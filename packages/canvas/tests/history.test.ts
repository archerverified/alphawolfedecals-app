import { beforeEach, describe, expect, it } from 'vitest';
import {
  factory,
  history,
  type CanvasDocument,
  type CanvasElement,
  type ElementId,
  type PanelId,
} from '../src/index';

const { applyCommand, invertCommand, UndoStack, MAX_HISTORY } = history;
type Command = history.Command;

const PID_A = factory.panelId('panel-a');
const PID_B = factory.panelId('panel-b');

function baseDoc(): CanvasDocument {
  const doc = factory.newDocument('veh');
  doc.panels[PID_A] = { panelId: PID_A, view: 'driver', elementIds: [] };
  doc.panels[PID_B] = { panelId: PID_B, view: 'passenger', elementIds: [] };
  return doc;
}

function rect(id: string, panelId: PanelId, x = 0, y = 0): CanvasElement {
  return factory.newRect({ id: factory.elementId(id), panelId, view: 'driver' }, { x, y });
}

/** Apply an add and return the new doc (helper used across cases). */
function addRect(doc: CanvasDocument, id: string, panelId: PanelId, index: number): CanvasDocument {
  return applyCommand(doc, { kind: 'addElement', element: rect(id, panelId), index });
}

describe('applyCommand purity', () => {
  it('never mutates the input document', () => {
    const doc = baseDoc();
    const before = JSON.stringify(doc);
    addRect(doc, 'e1', PID_A, 0);
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe('addElement / removeElements', () => {
  it('adds an element into a panel at an index', () => {
    let doc = baseDoc();
    doc = addRect(doc, 'e1', PID_A, 0);
    doc = addRect(doc, 'e2', PID_A, 0); // insert before e1
    expect(doc.panels[PID_A]?.elementIds).toEqual(['e2', 'e1']);
    expect(doc.elements['e1']).toBeDefined();
    expect(doc.elements['e2']).toBeDefined();
  });

  it('removes elements and prunes selection', () => {
    let doc = baseDoc();
    doc = addRect(doc, 'e1', PID_A, 0);
    doc = { ...doc, selection: [factory.elementId('e1')] };
    const el = doc.elements['e1']!;
    doc = applyCommand(doc, {
      kind: 'removeElements',
      elements: [el],
      panelIds: [PID_A],
      indices: [0],
    });
    expect(doc.elements['e1']).toBeUndefined();
    expect(doc.panels[PID_A]?.elementIds).toEqual([]);
    expect(doc.selection).toEqual([]);
  });
});

describe('updateElements', () => {
  it('applies the after-patch and inverts via before/after swap', () => {
    let doc = baseDoc();
    doc = addRect(doc, 'e1', PID_A, 0);
    const cmd: Command = {
      kind: 'updateElements',
      before: [{ id: 'e1' as ElementId, x: 0, y: 0 }],
      after: [{ id: 'e1' as ElementId, x: 500, y: 250 }],
    };
    const moved = applyCommand(doc, cmd);
    expect(moved.elements['e1']?.x).toBe(500);
    expect(moved.elements['e1']?.y).toBe(250);

    const back = applyCommand(moved, invertCommand(cmd));
    expect(back.elements['e1']?.x).toBe(0);
    expect(back.elements['e1']?.y).toBe(0);
  });
});

describe('reorder', () => {
  it('moves an element within a panel and inverts', () => {
    let doc = baseDoc();
    doc = addRect(doc, 'e1', PID_A, 0);
    doc = addRect(doc, 'e2', PID_A, 1);
    doc = addRect(doc, 'e3', PID_A, 2);
    const cmd: Command = { kind: 'reorder', panelId: PID_A, from: 0, to: 2 };
    const reordered = applyCommand(doc, cmd);
    expect(reordered.panels[PID_A]?.elementIds).toEqual(['e2', 'e3', 'e1']);
    const back = applyCommand(reordered, invertCommand(cmd));
    expect(back.panels[PID_A]?.elementIds).toEqual(['e1', 'e2', 'e3']);
  });
});

describe('reparent', () => {
  it('moves an element to another panel, shifts coords, updates view, inverts', () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      kind: 'addElement',
      element: rect('e1', PID_A, 100, 100),
      index: 0,
    });
    const cmd: Command = {
      kind: 'reparent',
      elementId: 'e1' as ElementId,
      fromPanel: PID_A,
      toPanel: PID_B,
      fromIndex: 0,
      toIndex: 0,
      coordDelta: { dx: 50, dy: -20 },
    };
    const moved = applyCommand(doc, cmd);
    expect(moved.panels[PID_A]?.elementIds).toEqual([]);
    expect(moved.panels[PID_B]?.elementIds).toEqual(['e1']);
    const el = moved.elements['e1'];
    expect(el?.panelId).toBe(PID_B);
    expect(el?.view).toBe('passenger');
    expect(el?.x).toBe(150);
    expect(el?.y).toBe(80);

    const back = applyCommand(moved, invertCommand(cmd));
    expect(back.panels[PID_A]?.elementIds).toEqual(['e1']);
    expect(back.panels[PID_B]?.elementIds).toEqual([]);
    expect(back.elements['e1']?.panelId).toBe(PID_A);
    expect(back.elements['e1']?.view).toBe('driver');
    expect(back.elements['e1']?.x).toBe(100);
    expect(back.elements['e1']?.y).toBe(100);
  });
});

describe('UndoStack', () => {
  let stack: InstanceType<typeof UndoStack>;
  let doc: CanvasDocument;

  beforeEach(() => {
    stack = new UndoStack();
    doc = baseDoc();
  });

  it('undo/redo round-trips an add', () => {
    doc = stack.push(doc, { kind: 'addElement', element: rect('e1', PID_A), index: 0 });
    expect(doc.elements['e1']).toBeDefined();
    expect(stack.state.canUndo).toBe(true);
    expect(stack.state.canRedo).toBe(false);

    doc = stack.undo(doc);
    expect(doc.elements['e1']).toBeUndefined();
    expect(stack.state.canUndo).toBe(false);
    expect(stack.state.canRedo).toBe(true);

    doc = stack.redo(doc);
    expect(doc.elements['e1']).toBeDefined();
    expect(stack.state.canRedo).toBe(false);
  });

  it('undo/redo round-trips a remove (re-adds at original slot)', () => {
    doc = stack.push(doc, { kind: 'addElement', element: rect('e1', PID_A), index: 0 });
    doc = stack.push(doc, { kind: 'addElement', element: rect('e2', PID_A), index: 1 });
    const e1 = doc.elements['e1']!;
    doc = stack.push(doc, {
      kind: 'removeElements',
      elements: [e1],
      panelIds: [PID_A],
      indices: [0],
    });
    expect(doc.panels[PID_A]?.elementIds).toEqual(['e2']);
    doc = stack.undo(doc); // restore e1 at index 0
    expect(doc.panels[PID_A]?.elementIds).toEqual(['e1', 'e2']);
    expect(doc.elements['e1']).toEqual(e1);
  });

  it('returns the same reference when there is nothing to undo/redo', () => {
    const same = stack.undo(doc);
    expect(same).toBe(doc);
    const same2 = stack.redo(doc);
    expect(same2).toBe(doc);
  });

  it('clears redo on a new push', () => {
    doc = stack.push(doc, { kind: 'addElement', element: rect('e1', PID_A), index: 0 });
    doc = stack.undo(doc);
    expect(stack.state.canRedo).toBe(true);
    doc = stack.push(doc, { kind: 'addElement', element: rect('e2', PID_A), index: 0 });
    expect(stack.state.canRedo).toBe(false);
    // Redo is now a no-op.
    const ref = doc;
    expect(stack.redo(doc)).toBe(ref);
  });

  it('bounds history at MAX_HISTORY (drop-oldest ring buffer)', () => {
    expect(MAX_HISTORY).toBe(50);
    // Push MAX_HISTORY + 5 adds.
    for (let i = 0; i < MAX_HISTORY + 5; i++) {
      doc = stack.push(doc, {
        kind: 'addElement',
        element: rect(`e${i}`, PID_A, i, i),
        index: 0,
      });
    }
    expect(stack.state.undoDepth).toBe(MAX_HISTORY);
    // Undo all 50 recorded steps; the 5 oldest adds (e0..e4) were dropped from
    // history, so their elements remain after exhausting undo.
    for (let i = 0; i < MAX_HISTORY; i++) doc = stack.undo(doc);
    expect(stack.state.canUndo).toBe(false);
    expect(doc.elements['e0']).toBeDefined();
    expect(doc.elements['e4']).toBeDefined();
    expect(doc.elements['e5']).toBeUndefined();
  });

  it('clear() empties both stacks', () => {
    doc = stack.push(doc, { kind: 'addElement', element: rect('e1', PID_A), index: 0 });
    doc = stack.undo(doc);
    stack.clear();
    expect(stack.state.canUndo).toBe(false);
    expect(stack.state.canRedo).toBe(false);
  });

  it('respects a custom max', () => {
    const small = new UndoStack(2);
    let d = baseDoc();
    d = small.push(d, { kind: 'addElement', element: rect('a', PID_A), index: 0 });
    d = small.push(d, { kind: 'addElement', element: rect('b', PID_A), index: 0 });
    small.push(d, { kind: 'addElement', element: rect('c', PID_A), index: 0 });
    expect(small.state.undoDepth).toBe(2);
  });
});
