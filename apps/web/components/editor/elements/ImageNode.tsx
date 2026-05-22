'use client';

// One image element (ADR-0006 §6). Loads the bitmap via use-image (the signed
// srcUrl). Same drag contract as the other nodes. Crop is applied as a sub-rect
// of the natural image in natural pixels.

import { Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import type Konva from 'konva';
import type { ImageElement } from '@alphawolf/canvas';
import type { ElementNodeProps } from './shared';
import { useElementDrag } from './shared';

export function ImageNode({
  element,
  selected,
  onSelect,
  onCommit,
  onDragLive,
  registerNode,
}: ElementNodeProps<ImageElement>) {
  const [img] = useImage(element.srcUrl, 'anonymous');
  const handlers = useElementDrag({ element, onCommit, onDragLive });

  const drawW = element.crop ? element.crop.width : element.naturalW;
  const drawH = element.crop ? element.crop.height : element.naturalH;

  return (
    <KonvaImage
      ref={(node: Konva.Image | null) => registerNode(element.id, node)}
      name={selected ? 'perf-drag-target selected-node' : 'element-node'}
      image={img}
      x={element.x}
      y={element.y}
      width={drawW}
      height={drawH}
      rotation={element.rotation}
      scaleX={element.scaleX}
      scaleY={element.scaleY}
      opacity={element.opacity}
      crop={element.crop ?? undefined}
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
