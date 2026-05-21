'use client';

// Artwork layer (ADR-0006 §6). Topology: one <Group> per VIEW (the translate
// transform) → one <Group> per PANEL (the wrap-safe clipFunc) → element nodes.
// Because each element is a child of its panel group, it clips to the printable
// area on render. ONE layer for up to ~200 nodes — never one layer per element.

import { Layer, Group } from 'react-konva';
import type Konva from 'konva';
import type { CanvasDocument, ElementId, history } from '@alphawolf/canvas';

type Command = history.Command;
import type { ViewLayout } from './types';
import type { PanelClip } from './useKonvaClip';
import type { LiveDrag } from './elements/shared';
import { TextNode } from './elements/TextNode';
import { ShapeNode } from './elements/ShapeNode';
import { ImageNode } from './elements/ImageNode';

interface Props {
  doc: CanvasDocument;
  views: ViewLayout[];
  clips: Record<string, PanelClip>;
  selection: ReadonlyArray<ElementId>;
  layerRef: React.RefObject<Konva.Layer | null>;
  onSelect: (id: ElementId) => void;
  onCommit: (cmd: Command) => void;
  onDragLive: (live: LiveDrag | null) => void;
  registerNode: (id: ElementId, node: Konva.Node | null) => void;
}

export function ArtworkLayer({
  doc,
  views,
  clips,
  selection,
  layerRef,
  onSelect,
  onCommit,
  onDragLive,
  registerNode,
}: Props) {
  const selected = new Set(selection);

  return (
    <Layer ref={layerRef}>
      {views.map((view) => (
        <Group key={view.view} x={view.offsetX} y={view.offsetY}>
          {view.panels.map((panel) => {
            const panelState = doc.panels[panel.id];
            const clip = clips[panel.id];
            const ids = panelState?.elementIds ?? [];
            return (
              <Group key={panel.id} clipFunc={clip?.clipFunc}>
                {ids.map((id) => {
                  const el = doc.elements[id];
                  if (!el) return null;
                  const isSel = selected.has(id);
                  const shared = {
                    selected: isSel,
                    onSelect,
                    onCommit,
                    onDragLive,
                    registerNode,
                  } as const;
                  if (el.type === 'text') {
                    return <TextNode key={id} element={el} {...shared} />;
                  }
                  if (el.type === 'shape') {
                    return <ShapeNode key={id} element={el} {...shared} />;
                  }
                  return <ImageNode key={id} element={el} {...shared} />;
                })}
              </Group>
            );
          })}
        </Group>
      ))}
    </Layer>
  );
}
