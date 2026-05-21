'use client';

// Editor document store (ADR-0006 data-flow §"client"): a useReducer over the
// CanvasDocument whose reducer is just history.applyCommand, plus an in-memory
// UndoStack ref. The store is the single source of truth the render layer reads
// and the only place Commands are applied. Drag interactions DO NOT go through
// here per-move — they commit ONE Command on dragend (§3, §6).

import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { history } from '@alphawolf/canvas';
import type { CanvasDocument, ElementId } from '@alphawolf/canvas';

type Command = history.Command;

export interface EditorStore {
  /** The current, authoritative document. */
  doc: CanvasDocument;
  /** Apply a Command, recording it for undo. */
  dispatch: (cmd: Command) => void;
  undo: () => void;
  redo: () => void;
  /** Replace selection (persisted in the document). */
  select: (ids: ReadonlyArray<ElementId>) => void;
  canUndo: boolean;
  canRedo: boolean;
}

type Action =
  | { type: 'push'; cmd: Command }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select'; ids: ReadonlyArray<ElementId> };

function makeReducer(stack: history.UndoStack) {
  return function reducer(doc: CanvasDocument, action: Action): CanvasDocument {
    switch (action.type) {
      case 'push':
        return stack.push(doc, action.cmd);
      case 'undo':
        return stack.undo(doc);
      case 'redo':
        return stack.redo(doc);
      case 'select':
        return { ...doc, selection: action.ids.slice() };
      default:
        return doc;
    }
  };
}

export function useEditorStore(initial: CanvasDocument): EditorStore {
  // One UndoStack per session, stable across renders.
  const stackRef = useRef<history.UndoStack | null>(null);
  if (!stackRef.current) stackRef.current = new history.UndoStack();
  const stack = stackRef.current;

  const reducer = useMemo(() => makeReducer(stack), [stack]);
  const [doc, rawDispatch] = useReducer(reducer, initial);

  // Mirror the stack's can-undo/redo into React state so chrome re-renders.
  const [, forceTick] = useState(0);

  const dispatch = useCallback(
    (cmd: Command) => {
      rawDispatch({ type: 'push', cmd });
      forceTick((n) => n + 1);
    },
    [rawDispatch],
  );
  const undo = useCallback(() => {
    rawDispatch({ type: 'undo' });
    forceTick((n) => n + 1);
  }, [rawDispatch]);
  const redo = useCallback(() => {
    rawDispatch({ type: 'redo' });
    forceTick((n) => n + 1);
  }, [rawDispatch]);
  const select = useCallback(
    (ids: ReadonlyArray<ElementId>) => rawDispatch({ type: 'select', ids }),
    [rawDispatch],
  );

  const { canUndo, canRedo } = stack.state;

  return { doc, dispatch, undo, redo, select, canUndo, canRedo };
}
