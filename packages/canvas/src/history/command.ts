// Command union (ADR-0006 §3).
//
// TYPE-ONLY module: the runtime reducer lives in apply.ts. Commands are small
// deltas (not snapshots) so 50 steps of history is kilobytes.

import type { CanvasElement, ElementId, PanelId } from '../schema/types';

/** A partial element keyed by id — `before`/`after` for updateElements. */
export type ElementPatch = { id: ElementId } & Partial<Omit<CanvasElement, 'id' | 'type'>>;

export type Command =
  | { kind: 'addElement'; element: CanvasElement; index: number }
  | {
      // Restore previously-removed elements at their original slots. Used as the
      // inverse of `removeElements`; not normally pushed directly.
      kind: 'addElements';
      elements: CanvasElement[];
      indices: number[];
    }
  | {
      kind: 'removeElements';
      elements: CanvasElement[];
      panelIds: PanelId[];
      indices: number[];
    }
  | { kind: 'updateElements'; before: ElementPatch[]; after: ElementPatch[] }
  | { kind: 'reorder'; panelId: PanelId; from: number; to: number }
  | {
      kind: 'reparent';
      elementId: ElementId;
      fromPanel: PanelId;
      toPanel: PanelId;
      fromIndex: number;
      toIndex: number;
      coordDelta: { dx: number; dy: number };
    };

export type CommandKind = Command['kind'];
