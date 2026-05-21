// Shared editor-layer types (client-only render concerns). The canvas DATA model
// lives in @alphawolf/canvas; this file only carries view/layout helpers used by
// the React/Konva components.

import type { geometry } from '@alphawolf/canvas';
import type { EditorPanel } from './contract';

/** A polygon ring from geometry.parsePath: ordered [x, y] vertices. */
export type Ring = ReturnType<typeof geometry.parsePath>[number];

/** The active tool in the left rail. */
export type Tool = 'select' | 'text' | 'shape' | 'image';

/** Which shape primitive the shape tool inserts. */
export type ShapeKind = 'rect' | 'ellipse' | 'line';

/** Snapping configuration surfaced in the snap popover. */
export interface SnapSettings {
  enabled: boolean;
  /** Threshold in screen pixels (converted to doc units using current scale). */
  thresholdPx: number;
}

/** Per-view horizontal offset computed from content bbox (ADR-0006 §2). */
export interface ViewLayout {
  view: string;
  /** x-offset applied to this view's Konva <Group> on the stage. */
  offsetX: number;
  /** y-offset (normalizes each view to a common top). */
  offsetY: number;
  /** Panels belonging to this view, in declared order. */
  panels: EditorPanel[];
}
