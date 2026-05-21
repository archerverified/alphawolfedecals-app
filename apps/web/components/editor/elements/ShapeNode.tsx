'use client';

// One shape element — rect / ellipse / line (ADR-0006 §6). Same drag contract as
// TextNode: live ref on dragmove, one Command on dragend, perfectDrawEnabled
// false, listening:false when locked.

import { Rect, Ellipse, Line } from 'react-konva';
import type Konva from 'konva';
import type { ShapeElement } from '@alphawolf/canvas';
import type { ElementNodeProps } from './shared';
import { useElementDrag } from './shared';

export function ShapeNode({
  element,
  selected,
  onSelect,
  onCommit,
  onDragLive,
  registerNode,
}: ElementNodeProps<ShapeElement>) {
  const handlers = useElementDrag({ element, onCommit, onDragLive });

  const common = {
    name: selected ? 'perf-drag-target selected-node' : 'element-node',
    x: element.x,
    y: element.y,
    rotation: element.rotation,
    scaleX: element.scaleX,
    scaleY: element.scaleY,
    opacity: element.opacity,
    listening: !element.locked,
    draggable: !element.locked,
    perfectDrawEnabled: false,
    shadowForStrokeEnabled: false,
    fill: element.fill ?? undefined,
    stroke: element.stroke ?? undefined,
    strokeWidth: element.strokeWidth,
    onMouseDown: () => onSelect(element.id),
    onTap: () => onSelect(element.id),
    ...handlers,
  } as const;

  if (element.kind === 'ellipse') {
    return (
      <Ellipse
        ref={(node: Konva.Ellipse | null) => registerNode(element.id, node)}
        {...common}
        radiusX={element.width / 2}
        radiusY={element.height / 2}
        offsetX={-element.width / 2}
        offsetY={-element.height / 2}
      />
    );
  }

  if (element.kind === 'line') {
    return (
      <Line
        ref={(node: Konva.Line | null) => registerNode(element.id, node)}
        {...common}
        points={element.points ? [...element.points] : [0, 0, element.width, 0]}
        hitStrokeWidth={element.locked ? 0 : Math.max(element.strokeWidth, 200)}
      />
    );
  }

  return (
    <Rect
      ref={(node: Konva.Rect | null) => registerNode(element.id, node)}
      {...common}
      width={element.width}
      height={element.height}
      cornerRadius={element.cornerRadius ?? 0}
    />
  );
}
