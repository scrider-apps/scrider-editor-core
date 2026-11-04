import type { EditorState } from '../state/EditorState';

/** Check if there are entries in the undo stack. */
export function canUndo(state: EditorState): boolean {
  return state.history.undoStack.length > 0;
}

/** Check if there are entries in the redo stack. */
export function canRedo(state: EditorState): boolean {
  return state.history.redoStack.length > 0;
}
