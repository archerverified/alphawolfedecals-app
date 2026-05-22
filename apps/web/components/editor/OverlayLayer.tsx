'use client';

// Overlay layer (ADR-0006 §6, §7). Holds three things, none of which touch the
// 200-node artwork layer:
//   1. a Konva Transformer bound to the current selection,
//   2. snap guide lines (rendered from the live snap result), and
//   3. the SINGLE out-of-bounds cue — one red bbox outline node toggled when
//      geometry.isElementInsideClip is false for the element being dragged.
// There are NO per-element listeners here: the cue is driven by the live-drag
// stream the element nodes already publish.

import { useEffect, useRef } from 'react';
import { Layer, Transformer, Rect, Line, Path } from 'react-konva';
import type Konva from 'konva';
import { geometry } from '@alphawolf/canvas';
import type { CanvasDocument, ElementId, CanvasElement } from '@alphawolf/canvas';
import type { ViewLayout, SnapSettings } from './types';
import type { PanelClip } from './useKonvaClip';
import type { LiveDrag } from './elements/shared';
import type { SnapGuide } from './CanvasStage';

interface Props {
  doc: CanvasDocument;
  views: ViewLayout[];
  clips: Record<string, PanelClip>;
  selection: ReadonlyArray<ElementId>;
  /** Live coords of the element under drag (null when not dragging). */
  liveDrag: LiveDrag | null;
  /** Active snap guides to render (panel-local, with their view offset). */
  guides: SnapGuide[];
  snap: SnapSettings;
  /** Resolve a node by id so the Transformer can attach to selected nodes. */
  getNode: (id: ElementId) => Konva.Node | null;
  /** Current stage scale, so the OOB warning icon stays a constant pixel size. */
  scale: number;
  /** Fired (on change only) when the out-of-bounds cue toggles, so the editor
   *  host can mirror it into a DOM aria-live region for assistive tech. */
  onCueChange?: (visible: boolean) => void;
}

// lucide `triangle-alert` outline, drawn as a Konva Path so the non-color cue
// scales with the cue (a shape, not just the red colour, signals out-of-bounds).
const WARNING_ICON_PATH =
  'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01';

/** Recompute an element's panel-local bbox using a live (dragging) position. */
function liveBbox(el: CanvasElement, live: LiveDrag | null) {
  if (!live || live.id !== el.id) return geometry.elementBbox(el);
  return geometry.elementBbox({ ...el, x: live.x, y: live.y });
}

export function OverlayLayer({
  doc,
  views,
  clips,
  selection,
  liveDrag,
  guides,
  getNode,
  snap,
  scale,
  onCueChange,
}: Props) {
  const trRef = useRef<Konva.Transformer | null>(null);
  const cueRef = useRef<Konva.Rect | null>(null);
  const iconRef = useRef<Konva.Path | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);
  const prevCueVisibleRef = useRef(false);

  // Bind the transformer to the selected nodes whenever selection changes.
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const nodes = selection.map((id) => getNode(id)).filter((n): n is Konva.Node => n != null);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selection, getNode, doc]);

  // Out-of-bounds cue: O(1) per drag frame. We recompute the dragged element's
  // bbox + clip test from the live position and position the red rect AND the
  // non-color warning icon, then mirror the visibility change to the host's
  // aria-live region (only when it actually flips, to avoid per-frame churn).
  useEffect(() => {
    const cue = cueRef.current;
    const icon = iconRef.current;
    if (!cue) return;

    const targetId = liveDrag?.id ?? selection[0];
    const el = targetId ? doc.elements[targetId] : undefined;

    let nextVisible = false;
    if (el) {
      const view = views.find((v) => v.view === el.view);
      const clip = clips[el.panelId];
      const bbox = liveBbox(el, liveDrag);
      const inside = clip ? geometry.isElementInsideClip(bbox, clip.rings) : true;
      if (!inside && view) {
        nextVisible = true;
        const x = view.offsetX + bbox.minX;
        const y = view.offsetY + bbox.minY;
        cue.position({ x, y });
        cue.size({ width: bbox.maxX - bbox.minX, height: bbox.maxY - bbox.minY });
        if (icon) {
          // Counter the stage scale so the badge stays ~constant on screen.
          const k = scale > 0 ? 1 / scale : 1;
          icon.position({ x, y });
          icon.scale({ x: k, y: k });
        }
      }
    }

    cue.visible(nextVisible);
    icon?.visible(nextVisible);
    cue.getLayer()?.batchDraw();

    if (prevCueVisibleRef.current !== nextVisible) {
      prevCueVisibleRef.current = nextVisible;
      onCueChange?.(nextVisible);
    }
  }, [liveDrag, selection, doc, views, clips, scale, onCueChange]);

  return (
    <Layer ref={layerRef}>
      {/* Snap guides (only while snapping is on). */}
      {snap.enabled &&
        guides.map((g, i) => (
          <Line
            key={`${g.axis}-${g.value}-${i}`}
            points={g.points}
            stroke="#6366f1"
            strokeWidth={1}
            dash={[4, 4]}
            listening={false}
            perfectDrawEnabled={false}
          />
        ))}

      {/* The single out-of-bounds cue: red dashed bbox (primary, colour) + a
          warning-triangle icon (secondary, shape — readable without colour). */}
      <Rect
        ref={cueRef}
        name="oob-cue"
        visible={false}
        stroke="#ef4444"
        strokeWidth={3}
        dash={[8, 4]}
        listening={false}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
      />
      <Path
        ref={iconRef}
        name="oob-cue-icon"
        visible={false}
        data={WARNING_ICON_PATH}
        fill="#fde047"
        stroke="#18181b"
        strokeWidth={2}
        lineJoin="round"
        lineCap="round"
        listening={false}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
      />

      <Transformer
        ref={trRef}
        rotateEnabled
        ignoreStroke
        shouldOverdrawWholeArea
        anchorSize={8}
        borderStroke="#6366f1"
        anchorStroke="#6366f1"
        anchorCornerRadius={2}
        flipEnabled={false}
      />
    </Layer>
  );
}
