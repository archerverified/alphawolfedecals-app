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
  /** When set, expose the stage as window.__KONVA_STAGE__ (non-prod only). */
  exposeStage?: boolean;
  /** Bubbled up when the out-of-bounds cue toggles (for the aria-live region). */
  onCueChange?: (visible: boolean) => void;
}

const VIEW_ORDER = ['front', 'driver', 'back', 'passenger', 'top'];
const VIEW_GUTTER = 600; // doc units between views

/** Group panels into views and compute each view's content-bbox offset. */
function computeViewLayouts(panels: EditorPanel[]): {
  views: ViewLayout[];
  bounds: { w: number; h: number };
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

  const views: ViewLayout[] = [];
  let cursorX = 0;
  let maxH = 0;
  for (const view of ordered) {
    const vp = byView.get(view) ?? [];
    // Content bbox = union of every panel outline bbox in this view.
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
    const w = maxX - minX;
    const h = maxY - minY;
    // Offset so content starts at cursorX/0 (normalized top).
    views.push({ view, offsetX: cursorX - minX, offsetY: -minY, panels: vp });
    cursorX += w + VIEW_GUTTER;
    if (h > maxH) maxH = h;
  }

  return { views, bounds: { w: Math.max(0, cursorX - VIEW_GUTTER), h: maxH } };
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
  exposeStage,
  onCueChange,
}: Props) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const artworkLayerRef = useRef<Konva.Layer | null>(null);
  const nodeRegistry = useRef<Map<ElementId, Konva.Node>>(new Map());

  const [liveDrag, setLiveDrag] = useState<LiveDrag | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);

  const { views, bounds } = useMemo(() => computeViewLayouts(panels), [panels]);

  // Fit the whole vehicle into the viewport (scale to contain) and center it.
  const fit = useMemo(() => {
    const pad = 80;
    const sx = bounds.w > 0 ? (width - pad * 2) / bounds.w : 1;
    const sy = bounds.h > 0 ? (height - pad * 2) / bounds.h : 1;
    const scale = Math.max(0.02, Math.min(sx, sy, 1));
    const offX = (width - bounds.w * scale) / 2;
    const offY = (height - bounds.h * scale) / 2;
    return { scale, x: offX, y: offY };
  }, [bounds, width, height]);

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
      style={{ background: '#f4f4f5' }}
    >
      <VehicleLayer views={views} />
      <ArtworkLayer
        doc={doc}
        views={views}
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
        views={views}
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
