import { Delta, compose, invert } from '@scrider/delta';
import type { AttributeMap } from '@scrider/delta';

import type { EditorState } from '../state/EditorState';
import { pushUndo } from '../state/HistoryState';
import { isFormatActive } from '../queries/formats';

import {
  applyInlineAttrsToRanges,
  applyInlineFormatToRanges,
  collectInlineTextRanges,
  computeFontSizeApplyRanges,
} from './headingFontSize';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All inline attribute names that removeFormat should clear. */
const INLINE_FORMATS: readonly string[] = [
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'mark',
  'subscript',
  'superscript',
  'kbd',
  'color',
  'background',
  'font',
  'size',
  'link',
];

/**
 * Toggle a boolean inline format (bold, italic, etc.).
 *
 * - Selection with length > 0: applies/removes the format on the range and pushes undo.
 * - Caret (length = 0): toggles storedMarks (pending format for next insertText).
 * - No selection: returns state unchanged.
 */
function toggleInlineFormat(state: EditorState, format: string): EditorState {
  const { delta, selection, storedMarks } = state;
  if (!selection) return state;

  // Caret mode — toggle storedMarks
  if (selection.length === 0) {
    const currentMarks = storedMarks ?? {};
    const hasStoredMark = storedMarks != null && format in storedMarks;
    const isActive = hasStoredMark
      ? Boolean(currentMarks[format])
      : isFormatActive(delta, selection, format);

    const newMarks: AttributeMap = { ...currentMarks };
    if (isActive) {
      (newMarks as Record<string, unknown>)[format] = null;
    } else {
      (newMarks as Record<string, unknown>)[format] = true;
    }
    return { ...state, storedMarks: newMarks };
  }

  // Selection mode — apply/remove format on text only (skip `\n` + embeds).
  const isActive = isFormatActive(delta, selection, format);
  const value = isActive ? null : true;
  const ranges = collectInlineTextRanges(delta, selection.index, selection.length);
  return applyInlineFormatToRanges(state, format, value, ranges);
}

/**
 * Set a valued inline format (color, background, link).
 *
 * - `value` = string → apply the format.
 * - `value` = null → remove the format.
 * - Caret mode: updates storedMarks.
 */
function setInlineFormat(state: EditorState, format: string, value: string | null): EditorState {
  const { delta, selection, storedMarks } = state;
  if (!selection) return state;

  // Caret mode
  if (selection.length === 0) {
    const newMarks: AttributeMap = { ...(storedMarks ?? {}) };
    (newMarks as Record<string, unknown>)[format] = value;
    return { ...state, storedMarks: newMarks };
  }

  // Selection mode — text runs only; never stamp inline attrs onto `\n`
  // (header / table-row) or embeds (formula). Ctrl+A → Font used to break
  // table/heading markup by putting `font` on those structural ops.
  const ranges = collectInlineTextRanges(delta, selection.index, selection.length);
  return applyInlineFormatToRanges(state, format, value, ranges);
}

// ---------------------------------------------------------------------------
// Toggle commands (9)
// ---------------------------------------------------------------------------

export function toggleBold(state: EditorState): EditorState {
  return toggleInlineFormat(state, 'bold');
}

export function toggleItalic(state: EditorState): EditorState {
  return toggleInlineFormat(state, 'italic');
}

export function toggleUnderline(state: EditorState): EditorState {
  return toggleInlineFormat(state, 'underline');
}

export function toggleStrike(state: EditorState): EditorState {
  return toggleInlineFormat(state, 'strike');
}

export function toggleCode(state: EditorState): EditorState {
  return toggleInlineFormat(state, 'code');
}

export function toggleMark(state: EditorState): EditorState {
  return toggleInlineFormat(state, 'mark');
}

function toggleExclusiveInlineFormat(
  state: EditorState,
  format: string,
  other: string,
): EditorState {
  const { delta, selection, storedMarks } = state;
  if (!selection) return state;

  if (selection.length === 0) {
    const currentMarks = storedMarks ?? {};
    const hasStoredMark = storedMarks != null && format in storedMarks;
    const active = hasStoredMark
      ? Boolean(currentMarks[format])
      : isFormatActive(delta, selection, format);

    const newMarks: AttributeMap = { ...currentMarks };
    if (active) {
      (newMarks as Record<string, unknown>)[format] = null;
    } else {
      (newMarks as Record<string, unknown>)[format] = true;
      (newMarks as Record<string, unknown>)[other] = null;
    }
    return { ...state, storedMarks: newMarks };
  }

  const active = isFormatActive(delta, selection, format);
  const ranges = collectInlineTextRanges(delta, selection.index, selection.length);
  const attrs: AttributeMap = active ? { [format]: null } : { [format]: true, [other]: null };
  return applyInlineAttrsToRanges(state, attrs, ranges);
}

export function toggleSubscript(state: EditorState): EditorState {
  return toggleExclusiveInlineFormat(state, 'subscript', 'superscript');
}

export function toggleSuperscript(state: EditorState): EditorState {
  return toggleExclusiveInlineFormat(state, 'superscript', 'subscript');
}

export function toggleKbd(state: EditorState): EditorState {
  return toggleInlineFormat(state, 'kbd');
}

// ---------------------------------------------------------------------------
// Set commands (5)
// ---------------------------------------------------------------------------

/** Set text color. Pass `null` to remove. */
export function setColor(state: EditorState, color: string | null): EditorState {
  return setInlineFormat(state, 'color', color);
}

/** Set background color. Pass `null` to remove. */
export function setBackground(state: EditorState, color: string | null): EditorState {
  return setInlineFormat(state, 'background', color);
}

/** Set font family (e.g. `"Times New Roman"`). Pass `null` to remove. */
export function setFont(state: EditorState, family: string | null): EditorState {
  return setInlineFormat(state, 'font', family);
}

/**
 * Set font size with unit (e.g. `"14pt"`). Pass `null` to remove.
 *
 * Heading lines always receive a uniform size on the full line body — partial
 * multi-size runs within one heading are not allowed.
 */
export function setFontSize(state: EditorState, size: string | null): EditorState {
  const { delta, selection, storedMarks } = state;
  if (!selection) return state;

  const ranges = computeFontSizeApplyRanges(delta, selection.index, selection.length);

  if (selection.length === 0 && ranges.length === 0) {
    return setInlineFormat(state, 'size', size);
  }

  if (ranges.length === 0) return state;

  let next = applyInlineFormatToRanges(state, 'size', size, ranges);

  if (selection.length === 0) {
    const newMarks: AttributeMap = { ...(storedMarks ?? {}) };
    (newMarks as Record<string, unknown>).size = size;
    next = { ...next, storedMarks: newMarks };
  }

  return next;
}

/** Set/remove link. Pass `null` to remove. */
export function setLink(state: EditorState, url: string | null): EditorState {
  return setInlineFormat(state, 'link', url);
}

// ---------------------------------------------------------------------------
// removeFormat
// ---------------------------------------------------------------------------

/**
 * Remove all inline formatting from the selection.
 * Block-level attributes on `\n` are preserved.
 * Caret mode: resets to detect mode (storedMarks = null).
 */
export function removeFormat(state: EditorState): EditorState {
  const { delta, selection, history, config } = state;
  if (!selection) return state;

  // Caret mode — reset to detect mode
  if (selection.length === 0) {
    return { ...state, storedMarks: null };
  }

  // Selection mode — build a change that nullifies all inline attributes
  const attrs: Record<string, null> = {};
  for (const fmt of INLINE_FORMATS) {
    attrs[fmt] = null;
  }

  const change = new Delta().retain(selection.index).retain(selection.length, attrs);

  const newDelta = compose(delta, change);
  const inverseDelta = invert(change, delta);

  return {
    ...state,
    delta: newDelta,
    history: pushUndo(history, inverseDelta, selection, config.history),
    storedMarks: null,
  };
}
