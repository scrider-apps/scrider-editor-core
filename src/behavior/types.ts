import type { AttributeMap } from '@scrider/delta';

import type { EditorState } from '../state/EditorState';

/**
 * Structural command override supplied by an extension package.
 *
 * Returns the next state when the extension handles the command (returning
 * the input state unchanged blocks it), or `null` to let the next behavior
 * and then the built-in logic run.
 */
export type BehaviorHook = (state: EditorState) => EditorState | null;

/**
 * Hooks an extension package installs into the built-in structural commands.
 *
 * Behaviors live in `state.config.behaviors` and run in array order before the
 * command's own logic. They keep block-specific editing rules (e.g. Enter on a
 * collapsible section title) out of the core.
 */
export interface EditorBehavior {
  /** Unique behavior name, usually the providing package or plugin name. */
  readonly name: string;
  /** Enter. */
  readonly splitBlock?: BehaviorHook;
  /** Ctrl+Enter. */
  readonly exitBlock?: BehaviorHook;
  /** Backspace with a collapsed selection. */
  readonly deleteBackward?: BehaviorHook;
  /** Delete with a collapsed selection. */
  readonly deleteForward?: BehaviorHook;
  /** Ctrl+A. */
  readonly selectAll?: BehaviorHook;
  /**
   * Tab / Shift+Tab on one line: returns the attribute patch for the line's
   * `\n`, or `null` to use the built-in indent logic.
   */
  readonly indentLine?: (attributes: AttributeMap, direction: 1 | -1) => AttributeMap | null;
}

export type BehaviorCommand = Exclude<keyof EditorBehavior, 'name' | 'indentLine'>;
