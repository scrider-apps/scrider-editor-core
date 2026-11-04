import { runBehaviors } from '../../behavior';
import type { EditorState } from '../../state/EditorState';

/**
 * Ctrl+A. `state.config.behaviors` may narrow the selection to a block scope;
 * otherwise select the whole document.
 */
export function selectAll(state: EditorState): EditorState {
  const scoped = runBehaviors(state, 'selectAll');
  if (scoped) return scoped;

  const len = state.delta.length();
  if (len === 0) return state;
  return {
    ...state,
    selection: { index: 0, length: len },
  };
}
