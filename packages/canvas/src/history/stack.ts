// In-memory undo/redo command stack (ADR-0006 §3).
//
// Holds COMMANDS (deltas), not document snapshots. Ring-buffer bounded at
// MAX_HISTORY=50 (push the 51st -> drop index 0). Redo is cleared on any new
// push. History is per-session and never persisted.

import type { CanvasDocument } from '../schema/types';
import type { Command } from './command';
import { applyCommand, invertCommand } from './apply';

export const MAX_HISTORY = 50;

export interface UndoStackState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoDepth: number;
  readonly redoDepth: number;
}

export class UndoStack {
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];
  private readonly max: number;

  constructor(max: number = MAX_HISTORY) {
    this.max = Math.max(1, Math.floor(max));
  }

  /** Apply `cmd` to `doc`, record it for undo, clear redo. Returns new doc. */
  push(doc: CanvasDocument, cmd: Command): CanvasDocument {
    const next = applyCommand(doc, cmd);
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.max) {
      this.undoStack.shift(); // ring buffer: drop oldest
    }
    this.redoStack.length = 0; // any new edit invalidates redo
    return next;
  }

  /** Undo the most recent command. No-op (same ref) when nothing to undo. */
  undo(doc: CanvasDocument): CanvasDocument {
    const cmd = this.undoStack.pop();
    if (!cmd) return doc;
    const next = applyCommand(doc, invertCommand(cmd));
    this.redoStack.push(cmd);
    return next;
  }

  /** Redo the most recently undone command. No-op (same ref) when empty. */
  redo(doc: CanvasDocument): CanvasDocument {
    const cmd = this.redoStack.pop();
    if (!cmd) return doc;
    const next = applyCommand(doc, cmd);
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.max) {
      this.undoStack.shift();
    }
    return next;
  }

  get state(): UndoStackState {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length,
    };
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
