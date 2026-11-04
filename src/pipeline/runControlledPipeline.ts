import { insertText } from '../commands/structure/insert';
import type { EditorState } from '../state/EditorState';

import { detectSingleSimpleTextBlockChange } from './detectSingleSimpleTextBlockChange';
import type {
  ControlledPipelinePayload,
  ControlledPipelineResult,
  ControlledTrigger,
} from './types';

/**
 * Framework-agnostic controlled edit entry.
 *
 * Owns: trigger dispatch → state transition + normalize hint.
 * Does **not** own: DOM, events, morph, post-render, island flags.
 *
 * `insertText` emits `normalizeHint: singleBlock` when the edit touches
 * exactly one simple paragraph/heading/list-item
 * (see {@link detectSingleSimpleTextBlockChange}).
 */
export function runControlledPipeline(
  state: EditorState,
  trigger: ControlledTrigger,
  payload: ControlledPipelinePayload = {},
): ControlledPipelineResult {
  switch (trigger) {
    case 'insertText': {
      const text = payload.text ?? '';
      if (text.length === 0) {
        return { state, normalizeHint: { kind: 'full' } };
      }
      const next = insertText(state, text);
      const change = detectSingleSimpleTextBlockChange(state.delta.ops, next.delta.ops);
      if (change) {
        return {
          state: next,
          normalizeHint: {
            kind: 'singleBlock',
            startDeltaIndex: change.startDeltaIndex,
            newBlockOps: change.newBlockOps,
          },
        };
      }
      return { state: next, normalizeHint: { kind: 'full' } };
    }
    case 'paste':
    case 'drop':
    case 'command':
    case 'inputRule':
    case 'contextualKey':
      return { state, normalizeHint: { kind: 'full' } };
    default: {
      const _exhaustive: never = trigger;
      return _exhaustive;
    }
  }
}
