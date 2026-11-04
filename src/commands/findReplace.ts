import { Delta, compose, invert } from '@scrider/delta';

import type { EditorState } from '../state/EditorState';
import { pushUndo } from '../state/HistoryState';
import { findMatches, type FindMatch, type FindOptions } from '../queries/findMatches';

export function replaceMatch(
  state: EditorState,
  match: FindMatch,
  replacement: string,
): EditorState {
  if (match.length === 0 && replacement.length === 0) return state;

  const { delta, history, config } = state;
  const change = new Delta().retain(match.index).delete(match.length).insert(replacement);
  const newDelta = compose(delta, change);
  const inverseDelta = invert(change, delta);

  const newIndex = match.index + replacement.length;

  return {
    ...state,
    delta: newDelta,
    selection: { index: newIndex, length: 0 },
    storedMarks: null,
    history: pushUndo(history, inverseDelta, state.selection, config.history),
  };
}

export function replaceAllMatches(
  state: EditorState,
  query: string,
  replacement: string,
  options?: FindOptions,
): EditorState {
  const matches = findMatches(state, query, options);
  if (matches.length === 0) return state;

  let next = state;
  for (let i = matches.length - 1; i >= 0; i--) {
    next = replaceMatch(next, matches[i]!, replacement);
  }
  return next;
}
