import { Delta, compose, invert } from '@scrider/delta';
import type { AttributeMap } from '@scrider/delta';

import {
  adjustPasteInsertIndex,
  adjustTextInsertIndex,
  ensureSeparatorLineAfterPastedTable,
  pasteCaretIndexBelowBlockEmbed,
} from '../../delta/canonicalizePasteOps';
import type { EditorState } from '../../state/EditorState';
import { pushUndo } from '../../state/HistoryState';

import {
  blockInsertStartsNewLine,
  getInheritedAttrs,
  getSelectionInlineIntersection,
} from './lineHelpers';

/**
 * Insert text at the cursor position.
 *
 * - Replaces the selection if present.
 * - Applies `storedMarks` if set, otherwise inherits formatting from the
 *   selection (when length > 0, uses uniform intersection across the
 *   replaced range) or from the previous character (caret mode).
 * - Clears `storedMarks` after insertion.
 */
export function insertText(state: EditorState, text: string): EditorState {
  const { delta, selection, history, config, storedMarks } = state;
  if (!selection) return state;
  if (text.length === 0) return state;

  const originalIndex = selection.index;
  let cursorIndex = originalIndex;
  let appendTrailingNewline = false;
  if (selection.length === 0) {
    cursorIndex = adjustTextInsertIndex(delta, originalIndex);
    // Snapped off an embed line onto EOD — keep the trailing-`\n` invariant.
    appendTrailingNewline = cursorIndex !== originalIndex && cursorIndex >= delta.length();
  }

  // Determine attributes for the inserted text:
  // - selection.length > 0: use the intersection of inline attrs uniformly
  //   present across the replaced range (so typing over "[TNR 14pt]" keeps
  //   font/size on the new char).
  // - caret mode: inherit from the previous character (or first char of
  //   doc when cursor is at index 0).
  // Then merge storedMarks on top (non-null overrides, null removes).
  const inherited =
    selection.length > 0
      ? getSelectionInlineIntersection(delta, cursorIndex, selection.length)
      : getInheritedAttrs(delta, cursorIndex);
  let attrs: AttributeMap;
  if (storedMarks) {
    const merged: Record<string, unknown> = { ...inherited };
    for (const [key, value] of Object.entries(storedMarks)) {
      if (value != null) {
        merged[key] = value;
      } else {
        delete merged[key];
      }
    }
    attrs = merged;
  } else {
    attrs = inherited;
  }

  // Build change: retain → delete selection → insert text
  let change = new Delta().retain(cursorIndex);
  if (selection.length > 0) {
    change = change.delete(selection.length);
  }

  const hasAttrs = Object.keys(attrs).length > 0;
  change = hasAttrs ? change.insert(text, attrs) : change.insert(text);
  if (appendTrailingNewline) {
    change = change.insert('\n');
  }

  const newDelta = compose(delta, change);
  const inverseDelta = invert(change, delta);

  return {
    ...state,
    delta: newDelta,
    selection: { index: cursorIndex + text.length, length: 0 },
    history: pushUndo(history, inverseDelta, selection, config.history),
    storedMarks: null,
  };
}

/**
 * Insert an inline embed (image, formula, etc.) at the cursor position.
 *
 * - Replaces the selection if present.
 * - Cursor advances past the embed (+1).
 */
export function insertEmbed(
  state: EditorState,
  embed: Record<string, unknown>,
  attributes?: AttributeMap,
): EditorState {
  const { delta, selection, history, config } = state;
  if (!selection) return state;

  const cursorIndex = selection.index;

  let change = new Delta().retain(cursorIndex);
  if (selection.length > 0) {
    change = change.delete(selection.length);
  }

  if (attributes && Object.keys(attributes).length > 0) {
    change = change.insert(embed, attributes);
  } else {
    change = change.insert(embed);
  }

  const newDelta = compose(delta, change);
  const inverseDelta = invert(change, delta);

  return {
    ...state,
    delta: newDelta,
    selection: { index: cursorIndex + 1, length: 0 },
    history: pushUndo(history, inverseDelta, selection, config.history),
  };
}

/**
 * Insert a soft line break embed at the cursor (Shift+Enter equivalent).
 *
 * Renders as `<br>` inside the surrounding block — the block itself is
 * NOT split. `<p>foo|bar</p>` with the cursor `|` becomes
 * `<p>foo<br>bar</p>`, still one paragraph in Delta.
 *
 * Thin wrapper over `insertEmbed(state, { softBreak: true })`. Selection
 * handling, cursor movement and history bookkeeping are delegated to
 * `insertEmbed` so the two commands stay structurally identical and any
 * future change to embed-insertion semantics applies uniformly.
 *
 * Round-trip with the `@scrider/formatter` softBreak Format (since v1.3.0):
 *   Delta:    `{ insert: { softBreak: true } }`
 *   HTML:     `<br data-scrider-embed>`
 *   Markdown: `"  \n"` (default) or `"<br>"` (via `softBreakStyle: 'html'`)
 */
export function insertSoftBreak(state: EditorState): EditorState {
  return insertEmbed(state, { softBreak: true });
}

/**
 * Insert a block-level embed (divider, video, etc.) as an atomic element.
 *
 * Inserts the embed object followed by `\n` (each block owns its newline).
 * When the block lands on its own line (end-of-line / new paragraph), also
 * adds a plain separator `\n` under the block and places the caret there —
 * same structure as the paste pipeline.
 */
export function insertBlock(state: EditorState, blockData: Record<string, unknown>): EditorState {
  const { delta, selection, history, config } = state;
  if (!selection) return state;

  const insertIndex =
    selection.length === 0
      ? adjustPasteInsertIndex(delta, selection.index, { pastingBlockOwnedEmbed: true })
      : selection.index;
  const onOwnLine = blockInsertStartsNewLine(delta, insertIndex);

  let change = new Delta().retain(insertIndex);
  if (selection.length > 0) {
    change = change.delete(selection.length);
  }

  change = change.insert(blockData).insert('\n');

  let newDelta = compose(delta, change);
  const inverseDelta = invert(change, delta);

  const blockEmbedIndex = insertIndex;
  let pasteRangeEnd = insertIndex + 2;
  if (onOwnLine) {
    const withSep = ensureSeparatorLineAfterPastedTable(newDelta, blockEmbedIndex, pasteRangeEnd);
    newDelta = withSep.delta;
    pasteRangeEnd = withSep.rangeEndExclusive;
  }

  const caretIndex = onOwnLine
    ? pasteCaretIndexBelowBlockEmbed(newDelta, blockEmbedIndex)
    : insertIndex + 2;

  return {
    ...state,
    delta: newDelta,
    selection: { index: caretIndex, length: 0 },
    history: pushUndo(history, inverseDelta, selection, config.history),
  };
}
