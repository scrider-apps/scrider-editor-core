import type { EditorState } from '../state/EditorState';
import type { PluginContext } from '../plugin/types';

/**
 * Result of a command that may carry a deferred side effect.
 * The state transformation remains pure; the side effect executes
 * after the new state is applied.
 *
 * The view layer passes its context to `sideEffect`, so the effect acts on the
 * editor that ran the command (a view context may add members such as
 * `openPopover`). Headless callers may omit it.
 */
export interface CommandResult {
  state: EditorState;
  sideEffect?: (ctx?: PluginContext) => void | Promise<void>;
}

/**
 * A command transforms EditorState. Returns either:
 * - EditorState directly (pure commands: toggleBold, undo, etc.)
 * - CommandResult with state + optional sideEffect (export, print, save)
 *
 * Backward compatible: all existing commands return EditorState,
 * which is a valid return value.
 */
export type Command = (state: EditorState, ...args: unknown[]) => EditorState | CommandResult;

/**
 * Check whether a command return value is a CommandResult (has `state` property)
 * rather than a plain EditorState (has `delta` property).
 */
export function isCommandResult(value: EditorState | CommandResult): value is CommandResult {
  return 'state' in value && !('delta' in value);
}
