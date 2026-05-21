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
import { Layer, Transformer, Rect, Line } from 'react-konva';
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
}

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
}: Props) {
  const trRef = useRef<Konva.Transformer | null>(null);
  const cueRef = useRef<Konva.Rect | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);

  // Bind the transformer to the selected nodes whenever selection changes.
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const nodes = selection.map((id) => getNode(id)).filter((n): n is Konva.Node => n != null);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selection, getNode, doc]);

  // Out-of-bounds cue: O(1) per drag frame. We recompute the dragged element's
  // bbox + clip test from the live position and position the single red rect.
  useEffect(() => {
    const cue = cueRef.current;
    if (!cue) return;

    const targetId = liveDrag?.id ?? selection[0];
    const el = targetId ? doc.elements[targetId] : undefined;
    if (!el) {
      cue.visible(false);
      cue.getLayer()?.batchDraw();
      return;
    }

    const view = views.find((v) => v.view === el.view);
    const clip = clips[el.panelId];
    const bbox = liveBbox(el, liveDrag);
    const inside = clip ? geometry.isElementInsideClip(bbox, clip.rings) : true;

    if (inside || !view) {
      cue.visible(false);
    } else {
      cue.visible(true);
      cue.position({ x: view.offsetX + bbox.minX, y: view.offsetY + bbox.minY });
      cue.size({ width: bbox.maxX - bbox.minX, height: bbox.maxY - bbox.minY });
    }
    cue.getLayer()?.batchDraw();
  }, [liveDrag, selection, doc, views, clips]);

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

      {/* The single out-of-bounds cue. */}
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
