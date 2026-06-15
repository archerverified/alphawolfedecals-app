'use client';

// The Konva Stage + three layers (ADR-0006 §2, §6).
//
// View transform lives HERE, derived from each view's CONTENT bbox: we group
// panels by `view`, measure each view's outline bbox, normalize to a common top,
// and lay views left-to-right with a gutter. Geometry/data stay panel-local; the
// React layer owns the transform (ADR-0006 §2).
//
// Layers, in z-order: vehicle (listening:false, cached) · artwork (one layer,
// ~200 nodes) · overlay (transformer + snap guides + the single OOB cue).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stage } from 'react-konva';
import type Konva from 'konva';
import { geometry } from '@alphawolf/canvas';
import type { CanvasDocument, ElementId, history } from '@alphawolf/canvas';

type Command = history.Command;
import type { EditorPanel } from './contract';
import type { ViewLayout, SnapSettings } from './types';
import type { PanelClip } from './useKonvaClip';
import type { LiveDrag } from './elements/shared';
import { commitTransform } from './elements/shared';
import { VehicleArtLayer } from './VehicleArtLayer';
import { VehicleLayer } from './VehicleLayer';
import { ArtworkLayer } from './ArtworkLayer';
import { OverlayLayer } from './OverlayLayer';

export interface SnapGuide {
  axis: 'x' | 'y';
  value: number;
  /** Absolute stage points for the guide line. */
  points: number[];
}

interface Props {
  doc: CanvasDocument;
  panels: EditorPanel[];
  clips: Record<string, PanelClip>;
  snap: SnapSettings;
  width: number;
  height: number;
  onSelect: (id: ElementId) => void;
  onCommit: (cmd: Command) => void;
  /** Recognizable vehicle backdrop URL (Goal 12 D2); null → outlined zones. */
  artUrl: string | null;
  /** Which view the camera frames: a view name, or 'all' (the whole vehicle). */
  activeView: string;
  /** Selectable wrap zones (Goal 12 D2). */
  selectedZoneId: string | null;
  onZoneSelect: (panelId: string) => void;
  /** When set, expose the stage as window.__KONVA_STAGE__ (non-prod only). */
  exposeStage?: boolean;
  /** Bubbled up when the out-of-bounds cue toggles (for the aria-live region). */
  onCueChange?: (visible: boolean) => void;
}

const VIEW_ORDER = ['front', 'driver', 'back', 'passenger', 'top'];

// AW templates author both the panel geometry and the wrapped art in this shared
// viewBox (verified: X3/Contender/Crown all 1920×1080). The camera frames this
// region for the "all" view so the whole recognizable vehicle fills the canvas.
const ART_VIEWBOX = { w: 1920, h: 1080 };

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Group panels into views (Goal 12 D2: NATIVE absolute coordinates — offset 0).
 * The wrapped art and the panel geometry share one coordinate space, so we no
 * longer re-base each view into a horizontal strip; the art shows the views in
 * their authored layout and the panels/elements overlay it 1:1. Each view also
 * carries its absolute panel bbox so the camera can frame a single view.
 */
function computeViewLayouts(panels: EditorPanel[]): {
  views: (ViewLayout & { region: BBox })[];
  panelBounds: BBox;
} {
  const byView = new Map<string, EditorPanel[]>();
  for (const p of panels) {
    const arr = byView.get(p.view) ?? [];
    arr.push(p);
    byView.set(p.view, arr);
  }

  const ordered = [...byView.keys()].sort(
    (a, b) =>
      VIEW_ORDER.indexOf(a) +
      100 * Number(VIEW_ORDER.indexOf(a) < 0) -
      (VIEW_ORDER.indexOf(b) + 100 * Number(VIEW_ORDER.indexOf(b) < 0)),
  );

  const views: (ViewLayout & { region: BBox })[] = [];
  let gMinX = Infinity;
  let gMinY = Infinity;
  let gMaxX = -Infinity;
  let gMaxY = -Infinity;
  for (const view of ordered) {
    const vp = byView.get(view) ?? [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of vp) {
      const b = geometry.bbox(geometry.parsePath(p.outlinePath));
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
    }
    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 0;
      maxY = 0;
    }
    gMinX = Math.min(gMinX, minX);
    gMinY = Math.min(gMinY, minY);
    gMaxX = Math.max(gMaxX, maxX);
    gMaxY = Math.max(gMaxY, maxY);
    // Native coords: no per-view offset.
    views.push({
      view,
      offsetX: 0,
      offsetY: 0,
      panels: vp,
      region: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    });
  }

  const panelBounds: BBox = Number.isFinite(gMinX)
    ? { x: gMinX, y: gMinY, w: gMaxX - gMinX, h: gMaxY - gMinY }
    : { x: 0, y: 0, w: ART_VIEWBOX.w, h: ART_VIEWBOX.h };
  return { views, panelBounds };
}

/** Scale+translate so `target` (doc-space bbox) fits the viewport with padding.
    Magnification is allowed (capped) — the old `min(…, 1)` cap is what shrank the
    art into a strip with dead canvas around it (Goal 12 D2). */
function frame(
  target: BBox,
  width: number,
  height: number,
): { scale: number; x: number; y: number } {
  const pad = 48;
  const sx = target.w > 0 ? (width - pad * 2) / target.w : 1;
  const sy = target.h > 0 ? (height - pad * 2) / target.h : 1;
  const scale = Math.max(0.02, Math.min(sx, sy, 6));
  const x = (width - target.w * scale) / 2 - target.x * scale;
  const y = (height - target.h * scale) / 2 - target.y * scale;
  return { scale, x, y };
}

export function CanvasStage({
  doc,
  panels,
  clips,
  snap,
  width,
  height,
  onSelect,
  onCommit,
  artUrl,
  activeView,
  selectedZoneId,
  onZoneSelect,
  exposeStage,
  onCueChange,
}: Props) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const artworkLayerRef = useRef<Konva.Layer | null>(null);
  const nodeRegistry = useRef<Map<ElementId, Konva.Node>>(new Map());

  const [liveDrag, setLiveDrag] = useState<LiveDrag | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);

  const { views, panelBounds } = useMemo(() => computeViewLayouts(panels), [panels]);

  // When a single view is framed, render only that view's zones/artwork so the
  // other views' geometry doesn't float over the cropped backdrop (Goal 12 D2).
  const renderViews = useMemo(
    () => (activeView === 'all' ? views : views.filter((v) => v.view === activeView)),
    [views, activeView],
  );

  // The region a single view occupies: its panel bbox padded so the surrounding
  // art (roof/wheels) is in frame, clamped to the art viewBox. null for 'all'.
  const activeRegion = useMemo<BBox | null>(() => {
    if (activeView === 'all') return null;
    const v = views.find((vv) => vv.view === activeView);
    if (!v) return null;
    const padX = v.region.w * 0.18;
    const padY = v.region.h * 0.42;
    const x = Math.max(0, v.region.x - padX);
    const y = Math.max(0, v.region.y - padY);
    return {
      x,
      y,
      w: Math.min(ART_VIEWBOX.w, v.region.x + v.region.w + padX) - x,
      h: Math.min(ART_VIEWBOX.h, v.region.y + v.region.h + padY) - y,
    };
  }, [views, activeView]);

  // Camera: frame the active view's region, or the whole vehicle for 'all' (the
  // art viewBox when art is present, else the panel bounds). Magnification is now
  // allowed (the old min(…,1) cap shrank everything into a strip).
  const fit = useMemo(() => {
    const whole = artUrl ? { x: 0, y: 0, w: ART_VIEWBOX.w, h: ART_VIEWBOX.h } : panelBounds;
    return frame(activeRegion ?? whole, width, height);
  }, [activeRegion, panelBounds, artUrl, width, height]);

  const registerNode = useCallback((id: ElementId, node: Konva.Node | null) => {
    if (node) nodeRegistry.current.set(id, node);
    else nodeRegistry.current.delete(id);
  }, []);

  const getNode = useCallback((id: ElementId) => nodeRegistry.current.get(id) ?? null, []);

  // Snap candidates for a panel: wrap-safe bbox edges + center, plus sibling
  // element centers. Computed in panel-local space (no transform; ADR-0006 §2).
  const onDragLive = useCallback(
    (live: LiveDrag | null) => {
      if (!live) {
        setLiveDrag(null);
        setGuides([]);
        return;
      }
      const el = doc.elements[live.id];
      if (!el) {
        setLiveDrag(live);
        return;
      }

      if (!snap.enabled) {
        setLiveDrag(live);
        return;
      }

      const clip = clips[el.panelId];
      const view = views.find((v) => v.view === el.view);
      const node = nodeRegistry.current.get(live.id);
      const scale = fit.scale || 1;
      const candidates: geometry.SnapCandidate[] = [];
      if (clip && clip.rings.length > 0) {
        const cb = geometry.bbox(clip.rings);
        candidates.push(
          { axis: 'x', value: cb.minX, source: 'edge' },
          { axis: 'x', value: (cb.minX + cb.maxX) / 2, source: 'center' },
          { axis: 'x', value: cb.maxX, source: 'edge' },
          { axis: 'y', value: cb.minY, source: 'edge' },
          { axis: 'y', value: (cb.minY + cb.maxY) / 2, source: 'center' },
          { axis: 'y', value: cb.maxY, source: 'edge' },
        );
      }

      const movingBbox = geometry.elementBbox({ ...el, x: live.x, y: live.y });
      const result = geometry.resolveSnap({
        moving: {
          bbox: movingBbox,
          center: {
            x: (movingBbox.minX + movingBbox.maxX) / 2,
            y: (movingBbox.minY + movingBbox.maxY) / 2,
          },
        },
        candidates,
        thresholdPx: snap.thresholdPx / scale,
      });

      if ((result.dx !== 0 || result.dy !== 0) && node) {
        node.x(live.x + result.dx);
        node.y(live.y + result.dy);
        node.getLayer()?.batchDraw();
        live = { id: live.id, x: live.x + result.dx, y: live.y + result.dy };
      }

      // Build guide lines in absolute stage coords.
      const nextGuides: SnapGuide[] = [];
      if (view) {
        const cb = clip && clip.rings.length > 0 ? geometry.bbox(clip.rings) : null;
        for (const g of result.lines) {
          if (g.axis === 'x') {
            const x = view.offsetX + g.value;
            nextGuides.push({
              axis: 'x',
              value: g.value,
              points: [x, view.offsetY + (cb?.minY ?? 0), x, view.offsetY + (cb?.maxY ?? 0)],
            });
          } else {
            const y = view.offsetY + g.value;
            nextGuides.push({
              axis: 'y',
              value: g.value,
              points: [view.offsetX + (cb?.minX ?? 0), y, view.offsetX + (cb?.maxX ?? 0), y],
            });
          }
        }
      }
      setGuides(nextGuides);
      setLiveDrag(live);
    },
    [doc, clips, views, snap.enabled, snap.thresholdPx, fit.scale],
  );

  // Commit transformer move/scale/rotate as one Command.
  const onTransformEnd = useCallback(() => {
    const sel = doc.selection;
    for (const id of sel) {
      const el = doc.elements[id];
      const node = nodeRegistry.current.get(id);
      if (el && node) commitTransform(el, node, onCommit);
    }
  }, [doc, onCommit]);

  // Expose the stage for the fps benchmark E2E (non-prod only).
  useEffect(() => {
    if (!exposeStage) return;
    const stage = stageRef.current;
    if (stage && typeof window !== 'undefined') {
      (window as unknown as { __KONVA_STAGE__?: Konva.Stage }).__KONVA_STAGE__ = stage;
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as unknown as { __KONVA_STAGE__?: Konva.Stage }).__KONVA_STAGE__;
      }
    };
  }, [exposeStage]);

  // Click on empty stage clears selection.
  const onStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.target === e.target.getStage()) {
        onSelect('' as ElementId);
      }
    },
    [onSelect],
  );

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      scaleX={fit.scale}
      scaleY={fit.scale}
      x={fit.x}
      y={fit.y}
      onMouseDown={onStageMouseDown}
      onTransformEnd={onTransformEnd}
      style={{ background: '#e4e4e7' }}
    >
      <VehicleArtLayer
        artUrl={artUrl}
        width={ART_VIEWBOX.w}
        height={ART_VIEWBOX.h}
        crop={
          activeRegion
            ? { x: activeRegion.x, y: activeRegion.y, w: activeRegion.w, h: activeRegion.h }
            : null
        }
      />
      <VehicleLayer
        views={renderViews}
        hasArt={!!artUrl}
        selectedZoneId={selectedZoneId}
        onZoneSelect={onZoneSelect}
      />
      <ArtworkLayer
        doc={doc}
        views={renderViews}
        clips={clips}
        selection={doc.selection}
        layerRef={artworkLayerRef}
        onSelect={onSelect}
        onCommit={onCommit}
        onDragLive={onDragLive}
        registerNode={registerNode}
      />
      <OverlayLayer
        doc={doc}
        views={renderViews}
        clips={clips}
        selection={doc.selection}
        liveDrag={liveDrag}
        guides={guides}
        snap={snap}
        getNode={getNode}
        scale={fit.scale}
        onCueChange={onCueChange}
      />
    </Stage>
  );
}
