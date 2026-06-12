// Pure command reducer (ADR-0006 §3).
//
// applyCommand(doc, cmd) NEVER mutates its input and returns a new document.
// invertCommand(cmd) yields the inverse for undo. Both are exercised directly
// in node vitest with zero DOM.

import type {
  CanvasDocument,
  CanvasElement,
  ElementId,
  PanelId,
  PanelState,
} from '../schema/types.js';
import type { Command, ElementPatch } from './command.js';

/** Internal: throw on a logically-impossible command (corrupt history). */
class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandError';
  }
}

/** Shallow-clone a panel's elementIds array within a fresh panels map. */
function withPanel(
  doc: CanvasDocument,
  panelId: PanelId,
  next: PanelState,
): Record<string, PanelState> {
  return { ...doc.panels, [panelId]: next };
}

function requirePanel(doc: CanvasDocument, panelId: PanelId): PanelState {
  const panel = doc.panels[panelId];
  if (!panel) throw new CommandError(`Unknown panel: ${panelId}`);
  return panel;
}

function requireElement(doc: CanvasDocument, id: ElementId): CanvasElement {
  const el = doc.elements[id];
  if (!el) throw new CommandError(`Unknown element: ${id}`);
  return el;
}

/** Insert `id` into `ids` at `index`, clamped to [0, len]. Returns a new array. */
function insertAt(ids: ElementId[], id: ElementId, index: number): ElementId[] {
  const next = ids.slice();
  const clamped = Math.max(0, Math.min(index, next.length));
  next.splice(clamped, 0, id);
  return next;
}

/** Apply a single patch onto an element, returning a new element. */
function applyPatch(el: CanvasElement, patch: ElementPatch): CanvasElement {
  const { id: _id, ...rest } = patch;
  // The patch only ever carries fields valid for this element's type (callers
  // build patches from the live element), so the spread is sound.
  return { ...el, ...rest } as CanvasElement;
}

export function applyCommand(doc: CanvasDocument, cmd: Command): CanvasDocument {
  switch (cmd.kind) {
    case 'addElement': {
      const el = cmd.element;
      const panel = requirePanel(doc, el.panelId);
      return {
        ...doc,
        elements: { ...doc.elements, [el.id]: el },
        panels: withPanel(doc, el.panelId, {
          ...panel,
          elementIds: insertAt(panel.elementIds, el.id, cmd.index),
        }),
      };
    }

    case 'addElements': {
      const elements = { ...doc.elements };
      let panels = doc.panels;
      // Restore in ascending-index order so each insert lands at its recorded
      // slot relative to already-restored siblings.
      const ordered = cmd.elements
        .map((element, i) => ({ element, index: cmd.indices[i] ?? 0 }))
        .sort((a, b) => a.index - b.index);
      for (const { element, index } of ordered) {
        elements[element.id] = element;
        const panel = panels[element.panelId];
        if (!panel) throw new CommandError(`Unknown panel: ${element.panelId}`);
        panels = {
          ...panels,
          [element.panelId]: {
            ...panel,
            elementIds: insertAt(panel.elementIds, element.id, index),
          },
        };
      }
      return { ...doc, elements, panels };
    }

    case 'removeElements': {
      const elements = { ...doc.elements };
      let panels = doc.panels;
      for (const el of cmd.elements) {
        delete elements[el.id];
        const panel = panels[el.panelId];
        if (panel) {
          panels = {
            ...panels,
            [el.panelId]: {
              ...panel,
              elementIds: panel.elementIds.filter((x) => x !== el.id),
            },
          };
        }
      }
      const removed = new Set(cmd.elements.map((e) => e.id));
      return {
        ...doc,
        elements,
        panels,
        selection: doc.selection.filter((id) => !removed.has(id)),
      };
    }

    case 'updateElements': {
      const elements = { ...doc.elements };
      for (const patch of cmd.after) {
        const el = requireElement(doc, patch.id);
        elements[patch.id] = applyPatch(el, patch);
      }
      return { ...doc, elements };
    }

    case 'reorder': {
      const panel = requirePanel(doc, cmd.panelId);
      const ids = panel.elementIds.slice();
      if (cmd.from < 0 || cmd.from >= ids.length || cmd.to < 0 || cmd.to >= ids.length) {
        throw new CommandError(
          `reorder out of range: from=${cmd.from} to=${cmd.to} len=${ids.length}`,
        );
      }
      const [moved] = ids.splice(cmd.from, 1);
      if (moved === undefined) throw new CommandError('reorder removed nothing');
      ids.splice(cmd.to, 0, moved);
      return {
        ...doc,
        panels: withPanel(doc, cmd.panelId, { ...panel, elementIds: ids }),
      };
    }

    case 'reparent': {
      const el = requireElement(doc, cmd.elementId);
      const fromPanel = requirePanel(doc, cmd.fromPanel);
      const toPanel = requirePanel(doc, cmd.toPanel);

      const fromIds = fromPanel.elementIds.filter((x) => x !== cmd.elementId);
      const moved: CanvasElement = {
        ...el,
        panelId: cmd.toPanel,
        view: toPanel.view,
        x: el.x + cmd.coordDelta.dx,
        y: el.y + cmd.coordDelta.dy,
      };

      let panels = withPanel(doc, cmd.fromPanel, {
        ...fromPanel,
        elementIds: fromIds,
      });
      // Re-read the (possibly same) target panel from the updated map so a
      // same-panel reparent composes correctly.
      const targetPanel = panels[cmd.toPanel];
      if (!targetPanel) throw new CommandError(`Unknown panel: ${cmd.toPanel}`);
      panels = {
        ...panels,
        [cmd.toPanel]: {
          ...targetPanel,
          elementIds: insertAt(targetPanel.elementIds, cmd.elementId, cmd.toIndex),
        },
      };

      return {
        ...doc,
        elements: { ...doc.elements, [cmd.elementId]: moved },
        panels,
      };
    }

    default: {
      // Exhaustiveness guard.
      const _never: never = cmd;
      throw new CommandError(`Unknown command: ${JSON.stringify(_never)}`);
    }
  }
}

export function invertCommand(cmd: Command): Command {
  switch (cmd.kind) {
    case 'addElement': {
      // Undo an add = remove the same element from the same slot.
      return {
        kind: 'removeElements',
        elements: [cmd.element],
        panelIds: [cmd.element.panelId],
        indices: [cmd.index],
      };
    }

    case 'addElements': {
      // Undo a multi-add = remove those elements.
      return {
        kind: 'removeElements',
        elements: cmd.elements,
        panelIds: cmd.elements.map((e) => e.panelId),
        indices: cmd.indices,
      };
    }

    case 'removeElements': {
      // Undo a remove = re-add each element at its recorded slot.
      return {
        kind: 'addElements',
        elements: cmd.elements,
        indices: cmd.indices,
      };
    }

    case 'updateElements': {
      // Swap before/after.
      return { kind: 'updateElements', before: cmd.after, after: cmd.before };
    }

    case 'reorder': {
      return { kind: 'reorder', panelId: cmd.panelId, from: cmd.to, to: cmd.from };
    }

    case 'reparent': {
      return {
        kind: 'reparent',
        elementId: cmd.elementId,
        fromPanel: cmd.toPanel,
        toPanel: cmd.fromPanel,
        fromIndex: cmd.toIndex,
        toIndex: cmd.fromIndex,
        coordDelta: { dx: -cmd.coordDelta.dx, dy: -cmd.coordDelta.dy },
      };
    }

    default: {
      const _never: never = cmd;
      throw new CommandError(`Unknown command: ${JSON.stringify(_never)}`);
    }
  }
}
