'use client';

// Vehicle zone layer (ADR-0006 §6; Goal 12 D2). One <Path> per panel per view
// <Group>, in NATIVE absolute coordinates (offset 0) so the zones register over
// the VehicleArtLayer backdrop. The panels are now SELECTABLE WRAP ZONES: hover
// highlights, click selects (sets the target panel + surfaces name/dimensions),
// mirroring the WrapUP reference's panel-select clarity.
//
// When the template has art the zones are translucent overlays on the artwork;
// when it has none (artUrl null, e.g. the Transit) they fall back to filled
// outline boxes so the design surface is still visible. listening:true (the
// layer is in the hit graph) and not cached, so hover/select restyle live.

import { useState } from 'react';
import { Layer, Group, Path } from 'react-konva';
import type Konva from 'konva';
import type { ViewLayout } from './types';

const ACCENT = '#00AEEF'; // AW brand cyan

interface Props {
  views: ViewLayout[];
  hasArt: boolean;
  selectedZoneId: string | null;
  onZoneSelect: (panelId: string) => void;
}

function setCursor(e: Konva.KonvaEventObject<MouseEvent>, cursor: string) {
  const stage = e.target.getStage();
  if (stage) stage.container().style.cursor = cursor;
}

export function VehicleLayer({ views, hasArt, selectedZoneId, onZoneSelect }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <Layer>
      {views.map((view) => (
        <Group key={view.view} x={view.offsetX} y={view.offsetY}>
          {view.panels.map((panel) => {
            const isSel = panel.id === selectedZoneId;
            const isHover = panel.id === hovered;
            // Fill: a real colour (low alpha) keeps the path hittable across its
            // area even when visually near-invisible.
            const fill = isSel
              ? 'rgba(0,174,239,0.22)'
              : isHover
                ? 'rgba(0,174,239,0.12)'
                : hasArt
                  ? 'rgba(255,255,255,0.01)'
                  : '#fafafa';
            const stroke = isSel || isHover ? ACCENT : hasArt ? 'rgba(82,82,91,0.38)' : '#a1a1aa';
            const strokeWidth = isSel ? 7 : isHover ? 5 : hasArt ? 2 : 10;
            return (
              <Path
                key={panel.id}
                name={`wrap-zone wrap-zone-${panel.id}`}
                data={panel.outlinePath}
                stroke={stroke}
                strokeWidth={strokeWidth}
                fill={fill}
                perfectDrawEnabled={false}
                shadowForStrokeEnabled={false}
                hitStrokeWidth={0}
                onMouseEnter={(e) => {
                  setHovered(panel.id);
                  setCursor(e, 'pointer');
                }}
                onMouseLeave={(e) => {
                  setHovered((h) => (h === panel.id ? null : h));
                  setCursor(e, 'default');
                }}
                onClick={() => onZoneSelect(panel.id)}
                onTap={() => onZoneSelect(panel.id)}
              />
            );
          })}
        </Group>
      ))}
    </Layer>
  );
}
