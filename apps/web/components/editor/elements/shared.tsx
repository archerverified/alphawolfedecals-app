'use client';

// Shared element-node plumbing (ADR-0006 §3, §6).
//
// The 60fps contract: during a drag we mutate only the Konva node (Konva already
// does this) and call layer.batchDraw(); we publish the live x/y to a ref so the
// overlay's out-of-bounds check + transformer can read it WITHOUT React state.
// On dragend we build exactly ONE updateElements Command (before/after x/y) and
// hand it up — never per dragmove.

import { useCallback } from 'react';
import type Konva from 'konva';
import type { CanvasElement, ElementId, history } from '@alphawolf/canvas';

type Command = history.Command;

/** Live drag position published to the overlay (panel-local coords). */
export interface LiveDrag {
  id: ElementId;
  x: number;
  y: number;
}

export interface ElementNodeProps<T extends CanvasElement = CanvasElement> {
  element: T;
  selected: boolean;
  onSelect: (id: ElementId) => void;
  /** Commit a single Command (called on dragend / transform end). */
  onCommit: (cmd: Command) => void;
  /** Publish live coords during a drag for the overlay (no React state). */
  onDragLive: (live: LiveDrag | null) => void;
  /** Register the Konva node so the Transformer + overlay can target it. */
  registerNode: (id: ElementId, node: Konva.Node | null) => void;
}

interface DragArgs {
  element: CanvasElement;
  onCommit: (cmd: Command) => void;
  onDragLive: (live: LiveDrag | null) => void;
}

/**
 * Build the dragstart/dragmove/dragend handlers for an element node.
 *
 * dragmove → batchDraw + publish live coords (no setState).
 * dragend  → one updateElements Command with before/after x/y.
 */
export function useElementDrag({ element, onCommit, onDragLive }: DragArgs) {
  const onDragStart = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target;
      onDragLive({ id: element.id, x: node.x(), y: node.y() });
    },
    [element.id, onDragLive],
  );

  const onDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target;
      onDragLive({ id: element.id, x: node.x(), y: node.y() });
      node.getLayer()?.batchDraw();
    },
    [element.id, onDragLive],
  );

  const onDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target;
      const nx = node.x();
      const ny = node.y();
      onDragLive(null);
      if (nx === element.x && ny === element.y) return;
      onCommit({
        kind: 'updateElements',
        before: [{ id: element.id, x: element.x, y: element.y }],
        after: [{ id: element.id, x: nx, y: ny }],
      });
    },
    [element.id, element.x, element.y, onCommit, onDragLive],
  );

  return { onDragStart, onDragMove, onDragEnd };
}

/**
 * Commit a transform (move + scale + rotate) as one updateElements Command.
 * Called from the Transformer's transformend so resize/rotate also undo as a
 * single step.
 */
export function commitTransform(
  element: CanvasElement,
  node: Konva.Node,
  onCommit: (cmd: Command) => void,
): void {
  const after = {
    id: element.id,
    x: node.x(),
    y: node.y(),
    rotation: node.rotation(),
    scaleX: node.scaleX(),
    scaleY: node.scaleY(),
  };
  const before = {
    id: element.id,
    x: element.x,
    y: element.y,
    rotation: element.rotation,
    scaleX: element.scaleX,
    scaleY: element.scaleY,
  };
  onCommit({ kind: 'updateElements', before: [before], after: [after] });
}
