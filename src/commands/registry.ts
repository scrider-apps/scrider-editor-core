import type { EditorState } from '../state/EditorState';
import type { Command, CommandResult } from './types';
import { isCommandResult } from './types';

import {
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  toggleCode,
  toggleMark,
  toggleSubscript,
  toggleSuperscript,
  toggleKbd,
  setColor,
  setBackground,
  setFont,
  setFontSize,
  setLink,
  removeFormat,
} from './inline';

import {
  setHeader,
  toggleBlockquote,
  toggleCodeBlock,
  setList,
  increaseIndent,
  decreaseIndent,
  setAlign,
  setLineSpacing,
  toggleTextIndent,
} from './block';

import {
  splitBlock,
  exitBlock,
  deleteBackward,
  deleteForward,
  insertText,
  insertEmbed,
  insertSoftBreak,
  insertBlock,
  selectAll,
} from './structure';

import { undo, redo } from './history';
import { insertContentsList } from './tableOfContents';

// ---------------------------------------------------------------------------
// defaultCommands
// ---------------------------------------------------------------------------

/**
 * All built-in commands indexed by name.
 */
export const defaultCommands: Record<string, Command> = {
  // Inline (15)
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  toggleCode,
  toggleMark,
  toggleSubscript,
  toggleSuperscript,
  toggleKbd,
  setColor: setColor as Command,
  setBackground: setBackground as Command,
  setFont: setFont as Command,
  setFontSize: setFontSize as Command,
  setLink: setLink as Command,
  removeFormat,

  // Block (7)
  setHeader: setHeader as Command,
  toggleBlockquote,
  toggleCodeBlock: toggleCodeBlock as Command,
  setList: setList as Command,
  increaseIndent,
  decreaseIndent,
  setAlign: setAlign as Command,
  setLineSpacing: setLineSpacing as Command,
  toggleTextIndent: toggleTextIndent as Command,

  // Structural (9)
  splitBlock,
  exitBlock,
  deleteBackward,
  deleteForward,
  insertText: insertText as Command,
  insertEmbed: insertEmbed as Command,
  insertSoftBreak,
  insertBlock: insertBlock as Command,
  insertContentsList,
  selectAll,

  // History (2)
  undo,
  redo,
};

// ---------------------------------------------------------------------------
// executeCommand
// ---------------------------------------------------------------------------

/**
 * Execute a command by name. Normalizes the result to CommandResult:
 * - If the command returns EditorState, wraps it as { state }
 * - If the command returns CommandResult, returns as-is
 * - If the command is not found, returns null
 *
 * Side effects (if any) are NOT executed here — the caller is
 * responsible for running result.sideEffect() after applying the state.
 */
export function executeCommand(
  commands: Record<string, Command>,
  name: string,
  state: EditorState,
  ...args: unknown[]
): CommandResult | null {
  const cmd = commands[name];
  if (!cmd) return null;

  const result = cmd(state, ...args);
  if (isCommandResult(result)) return result;
  return { state: result };
}
