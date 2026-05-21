'use client';

// Vehicle outline layer (ADR-0006 §6). One <Path> per panel (the body line) per
// view <Group>. The whole layer is listening:false (removed from the hit graph)
// and cached after mount so it never re-rasterizes during artwork edits.

import { useEffect, useRef } from 'react';
import { Layer, Group, Path } from 'react-konva';
import type Konva from 'konva';
import type { ViewLayout } from './types';

interface Props {
  views: ViewLayout[];
}

export function VehicleLayer({ views }: Props) {
  const layerRef = useRef<Konva.Layer | null>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    // Cache the static outline so it rasterizes once.
    layer.cache();
    layer.batchDraw();
    return () => {
      layer.clearCache();
    };
  }, [views]);

  return (
    <Layer ref={layerRef} listening={false}>
      {views.map((view) => (
        <Group key={view.view} x={view.offsetX} y={view.offsetY}>
          {view.panels.map((panel) => (
            <Path
              key={panel.id}
              data={panel.outlinePath}
              stroke="#a1a1aa"
              strokeWidth={12}
              fill="#fafafa"
              listening={false}
              perfectDrawEnabled={false}
              shadowForStrokeEnabled={false}
            />
          ))}
        </Group>
      ))}
    </Layer>
  );
}
