import { Delta, compose, invert } from '@scrider/delta';
import type { AttributeMap } from '@scrider/delta';

import { runBehaviors } from '../../behavior';
import type { EditorState } from '../../state/EditorState';
import { pushUndo } from '../../state/HistoryState';

import { BLOCK_FORMATS, NON_INHERITABLE } from './constants';
import { findCurrentLineNewline, getInheritedAttrs, isAtLineStart } from './lineHelpers';

/**
 * Split the current line at the cursor (Enter key).
 *
 * - `state.config.behaviors` run first.
 * - Deletes the selection if present.
 * - Inserts `\n` with the current line's full block attributes.
 * - Removes non-inheritable attributes (e.g. `header`) from the original `\n`
 *   so that the **new** line (below) starts clean.
 * - Inheritable attributes (list, indent, align, blockquote, code-block) are kept.
 */
export function splitBlock(state: EditorState): EditorState {
  const { delta, selection, history, config } = state;
  if (!selection) return state;

  const handled = runBehaviors(state, 'splitBlock');
  if (handled) return handled;

  const cursorIndex = selection.index;
  const selLength = selection.length;

  const lineInfo = findCurrentLineNewline(delta, cursorIndex);
  const currentAttrs = lineInfo ? lineInfo.attributes : {};

  // "Open up" mode: pressing Enter at the very start of a line with
  // non-inheritable block attrs (e.g. heading) should insert a plain empty
  // line ABOVE and leave the styled line untouched.  Without this, the
  // standard split logic inherits `header` onto the new \n above and then
  // demotes the original line to plain — backwards from what users expect.
  // Inheritable attrs (list/blockquote/indent/align) still propagate so
  // pressing Enter at the start of a list item creates a sibling item.
  const openUp =
    selLength === 0 &&
    isAtLineStart(delta, cursorIndex) &&
    Object.keys(currentAttrs).some((k) => NON_INHERITABLE.has(k));

  const newLineAttrs: Record<string, unknown> = {};
  if (!openUp) {
    Object.assign(newLineAttrs, currentAttrs);
  } else {
    for (const [k, v] of Object.entries(currentAttrs)) {
      if (!NON_INHERITABLE.has(k)) newLineAttrs[k] = v;
    }
  }

  // Build the change delta (delete selection + insert \n) as one atomic op
  let change = new Delta().retain(cursorIndex);
  if (selLength > 0) {
    change = change.delete(selLength);
  }

  const hasAttrs = Object.keys(newLineAttrs).length > 0;
  change = hasAttrs ? change.insert('\n', newLineAttrs) : change.insert('\n');

  // Modify original \n to remove non-inheritable attrs — but only outside
  // the open-up case (where we want the original line to keep its style).
  if (lineInfo && !openUp) {
    const attrsToRemove: Record<string, null> = {};
    let needsRemoval = false;
    for (const key of Object.keys(currentAttrs)) {
      if (NON_INHERITABLE.has(key)) {
        attrsToRemove[key] = null;
        needsRemoval = true;
      }
    }

    if (needsRemoval) {
      const selEnd = cursorIndex + selLength;
      // Only modify if the original \n wasn't deleted by the selection
      if (lineInfo.newlineIndex >= selEnd) {
        const gap = lineInfo.newlineIndex - selEnd;
        if (gap > 0) {
          change = change.retain(gap);
        }
        change = change.retain(1, attrsToRemove);
      }
    }
  }

  const newDelta = compose(delta, change);
  const inverseDelta = invert(change, delta);

  // Preserve inline attrs (font, size, color, …) across the line break so the
  // new line inherits them via storedMarks.  getInheritedAttrs returns {} when
  // the previous char is \n, so without this the new line loses styling.
  const inlineAttrs = getInheritedAttrs(delta, cursorIndex);
  let marks: AttributeMap | null = null;
  if (Object.keys(inlineAttrs).length > 0) {
    marks = {};
    for (const [key, value] of Object.entries(inlineAttrs)) {
      if (value != null && !BLOCK_FORMATS.includes(key)) {
        (marks as Record<string, unknown>)[key] = value;
      }
    }
    if (Object.keys(marks).length === 0) marks = null;
  }

  return {
    ...state,
    delta: newDelta,
    selection: { index: cursorIndex + 1, length: 0 },
    history: pushUndo(history, inverseDelta, selection, config.history),
    storedMarks: marks,
  };
}

/**
 * Exit the current block formatting (Ctrl+Enter).
 *
 * Like splitBlock, but the NEW line (where the cursor lands) has no block
 * attributes. The text before the cursor keeps its original formatting.
 *
 * - Inserts `\n` with the current block attributes at cursor (keeps text in block).
 * - Strips ALL block attributes from the original `\n` (new line is plain).
 * - Cursor moves to the new plain line.
 */
export function exitBlock(state: EditorState): EditorState {
  const handled = runBehaviors(state, 'exitBlock');
  if (handled) return handled;

  const { delta, selection, history, config } = state;
  if (!selection) return state;

  const cursorIndex = selection.index;
  const selLength = selection.length;

  const lineInfo = findCurrentLineNewline(delta, cursorIndex);
  const currentAttrs = lineInfo ? lineInfo.attributes : {};

  let change = new Delta().retain(cursorIndex);
  if (selLength > 0) {
    change = change.delete(selLength);
  }

  // Insert \n with current block attrs so the text before cursor stays formatted
  const hasAttrs = Object.keys(currentAttrs).length > 0;
  change = hasAttrs ? change.insert('\n', currentAttrs) : change.insert('\n');

  // Strip ALL block attributes from the original \n (the new line becomes plain)
  if (lineInfo && hasAttrs) {
    const clearAttrs: Record<string, null> = {};
    for (const key of Object.keys(currentAttrs)) {
      if (BLOCK_FORMATS.includes(key)) {
        clearAttrs[key] = null;
      }
    }
    if (Object.keys(clearAttrs).length > 0) {
      const selEnd = cursorIndex + selLength;
      if (lineInfo.newlineIndex >= selEnd) {
        const gap = lineInfo.newlineIndex - selEnd;
        if (gap > 0) {
          change = change.retain(gap);
        }
        change = change.retain(1, clearAttrs);
      }
    }
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
