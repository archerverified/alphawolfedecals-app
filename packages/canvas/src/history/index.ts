export type { Command, CommandKind, ElementPatch } from './command.js';
export { applyCommand, invertCommand } from './apply.js';
export { UndoStack, MAX_HISTORY } from './stack.js';
export type { UndoStackState } from './stack.js';
