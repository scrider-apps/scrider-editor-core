import type { AttributeMap } from '@scrider/delta';

import type { EditorState } from '../state/EditorState';
import type { BehaviorCommand } from './types';

export type { BehaviorCommand, BehaviorHook, EditorBehavior } from './types';

/** First non-null result of the `command` hook across `state.config.behaviors`. */
export function runBehaviors(state: EditorState, command: BehaviorCommand): EditorState | null {
  for (const behavior of state.config.behaviors) {
    const next = behavior[command]?.(state);
    if (next) return next;
  }
  return null;
}

/** First non-null `indentLine` patch across `state.config.behaviors`. */
export function runIndentBehaviors(
  state: EditorState,
  attributes: AttributeMap,
  direction: 1 | -1,
): AttributeMap | null {
  for (const behavior of state.config.behaviors) {
    const patch = behavior.indentLine?.(attributes, direction);
    if (patch) return patch;
  }
  return null;
}
