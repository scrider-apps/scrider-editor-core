import { compose, invert } from '@scrider/delta';

import type { EditorState } from '../state/EditorState';
import { popUndo, popRedo, pushRedo } from '../state/HistoryState';

// ---------------------------------------------------------------------------
// undo
// ---------------------------------------------------------------------------

/**
 * Undo the last change.
 *
 * Pops the top entry from the undo stack, applies the inverse Delta to revert
 * the document, computes the forward Delta for redo, and restores the selection.
 *
 * Returns the state unchanged if the undo stack is empty.
 */
export function undo(state: EditorState): EditorState {
  const result = popUndo(state.history);
  if (!result) return state;

  const { entry, history: poppedHistory } = result;

  const newDelta = compose(state.delta, entry.changeDelta);
  const redoDelta = invert(entry.changeDelta, state.delta);

  // Metadata is restored by full value swap (see HistoryEntry.metadata).
  // `undefined` = this entry doesn't touch metadata; carry the current value
  // onto the redo entry only when the undo entry did.
  const restoresMetadata = entry.metadata !== undefined;
  const nextMetadata = restoresMetadata ? (entry.metadata ?? null) : state.scriderMetadata;

  return {
    ...state,
    delta: newDelta,
    scriderMetadata: nextMetadata,
    selection: entry.selection ?? state.selection,
    history: pushRedo(
      poppedHistory,
      redoDelta,
      state.selection,
      restoresMetadata ? state.scriderMetadata : undefined,
    ),
    storedMarks: null,
  };
}

// ---------------------------------------------------------------------------
// redo
// ---------------------------------------------------------------------------

/**
 * Redo the last undone change.
 *
 * Pops the top entry from the redo stack, applies the forward Delta,
 * computes the inverse for undo, and restores the selection.
 *
 * Returns the state unchanged if the redo stack is empty.
 */
export function redo(state: EditorState): EditorState {
  const result = popRedo(state.history);
  if (!result) return state;

  const { entry, history: poppedHistory } = result;

  const newDelta = compose(state.delta, entry.changeDelta);
  const undoDelta = invert(entry.changeDelta, state.delta);

  const restoresMetadata = entry.metadata !== undefined;
  const nextMetadata = restoresMetadata ? (entry.metadata ?? null) : state.scriderMetadata;

  return {
    ...state,
    delta: newDelta,
    scriderMetadata: nextMetadata,
    selection: entry.selection ?? state.selection,
    history: {
      ...poppedHistory,
      undoStack: [
        ...poppedHistory.undoStack,
        {
          changeDelta: undoDelta,
          selection: state.selection,
          ...(restoresMetadata ? { metadata: state.scriderMetadata } : {}),
        },
      ],
    },
    storedMarks: null,
  };
}
