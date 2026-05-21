'use client';

// One text element (ADR-0006 §6). perfectDrawEnabled:false for fps. Dragging
// mutates ONLY the Konva node + the live geometry ref during dragmove (no React
// setState / history per move); a SINGLE updateElements Command commits on
// dragend. Locked elements are listening:false and not draggable.

import { Text as KonvaText } from 'react-konva';
import type Konva from 'konva';
import type { TextElement } from '@alphawolf/canvas';
import type { ElementNodeProps } from './shared';
import { useElementDrag } from './shared';

const FONT_STYLE_MAP: Record<TextElement['fontStyle'], string> = {
  normal: 'normal',
  bold: 'bold',
  italic: 'italic',
  'bold italic': 'italic bold',
};

export function TextNode({
  element,
  selected,
  onSelect,
  onCommit,
  onDragLive,
  registerNode,
}: ElementNodeProps<TextElement>) {
  const handlers = useElementDrag({ element, onCommit, onDragLive });
  return (
    <KonvaText
      ref={(node: Konva.Text | null) => registerNode(element.id, node)}
      name={selected ? 'perf-drag-target selected-node' : 'element-node'}
      x={element.x}
      y={element.y}
      rotation={element.rotation}
      scaleX={element.scaleX}
      scaleY={element.scaleY}
      opacity={element.opacity}
      text={element.content}
      fontFamily={element.fontFamily}
      fontSize={element.fontSize}
      fill={element.fill}
      align={element.align}
      lineHeight={element.lineHeight}
      letterSpacing={element.letterSpacing}
      fontStyle={FONT_STYLE_MAP[element.fontStyle]}
      listening={!element.locked}
      draggable={!element.locked}
      perfectDrawEnabled={false}
      shadowForStrokeEnabled={false}
      onMouseDown={() => onSelect(element.id)}
      onTap={() => onSelect(element.id)}
      {...handlers}
    />
  );
}
