import { Delta, compose, invert, isTextInsert } from '@scrider/delta';
import { composeKeepingDocumentNewline } from '../../delta/ensureDocumentTrailingNewline';
import type { AttributeMap } from '@scrider/delta';

import {
  dividerLineToDeleteBackward,
  dividerLineToDeleteForward,
} from '../../delta/canonicalizePasteOps';
import { isPresentationOnlyFillerAttrs } from '../../delta/collapseFillerParagraphs';
import { runBehaviors } from '../../behavior';
import { expandSelectionToIncludeBlockTerminator } from '../clipboard';
import type { EditorState } from '../../state/EditorState';
import { pushUndo } from '../../state/HistoryState';

import { BACKSPACE_DEDENT_KEYS, BLOCK_FORMATS, NON_INHERITABLE } from './constants';
import {
  findCurrentLineNewline,
  getInheritedAttrs,
  hasBackspaceDedents,
  isAtLineStart,
} from './lineHelpers';

/** True when both newlines belong to the same fenced code-block. */
function sameCodeBlockFence(a: AttributeMap, b: AttributeMap): boolean {
  if (a['code-block'] == null || b['code-block'] == null) return false;
  if (a['code-block'] !== b['code-block']) return false;
  const idA = a['code-block-id'];
  const idB = b['code-block-id'];
  if (idA != null || idB != null) return idA === idB;
  return true;
}

/**
 * Delete one character before the cursor (Backspace).
 *
 * - Selection: deletes the selection.
 * - Collapsed caret: `state.config.behaviors` run first.
 * - Cursor at 0: no-op.
 * - At start of a code-block fence (first line): no-op — do not eject content.
 * - At start of a later line in the same fence: merge with the previous code line.
 * - At line start with other block format: removes block formatting instead of merging.
 * - Otherwise: deletes 1 character backward.
 */
export function deleteBackward(state: EditorState): EditorState {
  const { delta, selection, history, config } = state;
  if (!selection) return state;

  // Selection mode: delete selection
  if (selection.length > 0) {
    const range = expandSelectionToIncludeBlockTerminator(delta, selection);
    const rawChange = new Delta().retain(range.index).delete(range.length);
    const { newDelta, change } = composeKeepingDocumentNewline(delta, rawChange);
    const inverseDelta = invert(change, delta);
    return {
      ...state,
      delta: newDelta,
      selection: { index: selection.index, length: 0 },
      history: pushUndo(history, inverseDelta, selection, config.history),
    };
  }

  const cursorIndex = selection.index;

  const handled = runBehaviors(state, 'deleteBackward');
  if (handled) return handled;

  // Cursor at start of document
  if (cursorIndex === 0) return state;

  // Divider is atomic (embed + owned `\n`). Deleting only the `\n` glues the
  // next heading/paragraph onto the embed — the rule "slides down".
  const dividerBack = dividerLineToDeleteBackward(delta, cursorIndex);
  if (dividerBack) {
    const change = new Delta().retain(dividerBack.start).delete(dividerBack.length);
    const newDelta = compose(delta, change);
    const inverseDelta = invert(change, delta);
    return {
      ...state,
      delta: newDelta,
      selection: { index: dividerBack.start, length: 0 },
      history: pushUndo(history, inverseDelta, selection, config.history),
    };
  }

  // At line start: handle empty lines and block formatting
  if (isAtLineStart(delta, cursorIndex)) {
    const lineInfo = findCurrentLineNewline(delta, cursorIndex);
    if (lineInfo) {
      // Code-block fence: never strip `code-block` / eject the first line.
      // - Previous `\n` is a different fence (or plain): no-op.
      // - Previous `\n` is the same fence: fall through and merge lines.
      if (lineInfo.attributes['code-block'] != null) {
        const prevOp = delta.slice(cursorIndex - 1, cursorIndex).ops[0];
        const prevAttrs =
          prevOp != null && isTextInsert(prevOp) && prevOp.insert === '\n'
            ? (prevOp.attributes ?? {})
            : null;
        if (!prevAttrs || !sameCodeBlockFence(lineInfo.attributes, prevAttrs)) {
          return state;
        }
      }

      // Empty line (cursor is right at the \n):
      // delete the \n to merge with previous block, preserving previous block's format.
      // Busuu spacer lines (presentation-only attrs) — delete the `\n` outright.
      if (cursorIndex === lineInfo.newlineIndex) {
        if (isPresentationOnlyFillerAttrs(lineInfo.attributes)) {
          const change = new Delta().retain(cursorIndex).delete(1);
          const newDelta = compose(delta, change);
          const inverseDelta = invert(change, delta);
          return {
            ...state,
            delta: newDelta,
            selection: { index: Math.max(0, cursorIndex - 1), length: 0 },
            history: pushUndo(history, inverseDelta, selection, config.history),
          };
        }

        const change = new Delta().retain(cursorIndex).delete(1);
        const newDelta = compose(delta, change);
        const inverseDelta = invert(change, delta);

        // Preserve inline attrs from previous line so font/size aren't lost
        const prevAttrs = getInheritedAttrs(delta, cursorIndex);
        let marks: AttributeMap | null = null;
        if (Object.keys(prevAttrs).length > 0) {
          marks = {};
          for (const [key, value] of Object.entries(prevAttrs)) {
            if (value != null && !BLOCK_FORMATS.includes(key)) {
              (marks as Record<string, unknown>)[key] = value;
            }
          }
          if (Object.keys(marks).length === 0) marks = null;
        }

        return {
          ...state,
          delta: newDelta,
          selection: { index: cursorIndex - 1, length: 0 },
          history: pushUndo(history, inverseDelta, selection, config.history),
          storedMarks: marks,
        };
      }

      // Non-empty formatted line: strip block formatting (dedent).
      //
      // Exception: when the only block attr is non-inheritable (`header`),
      // the dedent dance is backwards.  Users expect Backspace at the start
      // of a styled heading to delete the previous line (merging up) and
      // keep the heading intact — symmetric with `splitBlock`'s "open up"
      // behaviour.  In that case we fall through to the default
      // char-deletion path so the previous `\n` is removed and the heading
      // attribute (which lives on the line's own \n) is preserved.
      if (hasBackspaceDedents(lineInfo.attributes)) {
        const attrKeys = Object.keys(lineInfo.attributes);
        const onlyNonInheritable =
          attrKeys.length > 0 && attrKeys.every((k) => NON_INHERITABLE.has(k));

        if (!onlyNonInheritable) {
          const clearAttrs: Record<string, null> = {};
          for (const fmt of BACKSPACE_DEDENT_KEYS) {
            if (lineInfo.attributes[fmt] != null) {
              clearAttrs[fmt] = null;
            }
          }
          const change = new Delta().retain(lineInfo.newlineIndex).retain(1, clearAttrs);
          const newDelta = compose(delta, change);
          const inverseDelta = invert(change, delta);
          return {
            ...state,
            delta: newDelta,
            history: pushUndo(history, inverseDelta, selection, config.history),
          };
        }
      }
    }
  }

  // Merge a plain paragraph up into the list item above: deleting the
  // item's `\n` would drop `list` / `indent` (they live on that newline).
  // Stamp them onto the surviving terminator so "3. 345" + "123" stays
  // "3. 345123". Empty paragraph after a list already keeps the item
  // (`cursorIndex === newlineIndex` above).
  if (isAtLineStart(delta, cursorIndex)) {
    const prevNl = delta.slice(cursorIndex - 1, cursorIndex).ops[0];
    const prevList = prevNl != null && isTextInsert(prevNl) ? prevNl.attributes?.list : undefined;
    if (prevNl != null && isTextInsert(prevNl) && prevNl.insert === '\n' && prevList != null) {
      const below = findCurrentLineNewline(delta, cursorIndex);
      const belowAttrs = below?.attributes ?? {};
      if (
        below &&
        belowAttrs.list == null &&
        belowAttrs.header == null &&
        belowAttrs['code-block'] == null
      ) {
        const keep: AttributeMap = { list: prevList };
        if (prevNl.attributes?.indent != null) keep.indent = prevNl.attributes.indent;
        const change = new Delta()
          .retain(cursorIndex - 1)
          .delete(1)
          .retain(below.newlineIndex - cursorIndex)
          .retain(1, keep);
        const newDelta = compose(delta, change);
        const inverseDelta = invert(change, delta);
        return {
          ...state,
          delta: newDelta,
          selection: { index: cursorIndex - 1, length: 0 },
          history: pushUndo(history, inverseDelta, selection, config.history),
        };
      }
    }
  }

  // Default: delete 1 character before cursor
  const change = new Delta().retain(cursorIndex - 1).delete(1);
  const newDelta = compose(delta, change);
  const inverseDelta = invert(change, delta);

  return {
    ...state,
    delta: newDelta,
    selection: { index: cursorIndex - 1, length: 0 },
    history: pushUndo(history, inverseDelta, selection, config.history),
  };
}

/**
 * Delete one character after the cursor (Delete key).
 *
 * - Selection: deletes the selection.
 * - Cursor at end of document: no-op.
 * - Collapsed caret: `state.config.behaviors` run first.
 * - Otherwise: deletes 1 character forward.
 */
export function deleteForward(state: EditorState): EditorState {
  const { delta, selection, history, config } = state;
  if (!selection) return state;

  // Selection mode: delete selection
  if (selection.length > 0) {
    const range = expandSelectionToIncludeBlockTerminator(delta, selection);
    const rawChange = new Delta().retain(range.index).delete(range.length);
    const { newDelta, change } = composeKeepingDocumentNewline(delta, rawChange);
    const inverseDelta = invert(change, delta);
    return {
      ...state,
      delta: newDelta,
      selection: { index: selection.index, length: 0 },
      history: pushUndo(history, inverseDelta, selection, config.history),
    };
  }

  const cursorIndex = selection.index;
  const docLength = delta.length();

  // Cursor at end of document
  if (cursorIndex >= docLength) return state;

  const handled = runBehaviors(state, 'deleteForward');
  if (handled) return handled;

  const dividerFwd = dividerLineToDeleteForward(delta, cursorIndex);
  if (dividerFwd) {
    const change = new Delta().retain(dividerFwd.start).delete(dividerFwd.length);
    const newDelta = compose(delta, change);
    const inverseDelta = invert(change, delta);
    return {
      ...state,
      delta: newDelta,
      selection: { index: dividerFwd.start, length: 0 },
      history: pushUndo(history, inverseDelta, selection, config.history),
    };
  }

  const change = new Delta().retain(cursorIndex).delete(1);
  const newDelta = compose(delta, change);
  const inverseDelta = invert(change, delta);

  return {
    ...state,
    delta: newDelta,
    // Cursor stays at same position
    history: pushUndo(history, inverseDelta, selection, config.history),
  };
}
