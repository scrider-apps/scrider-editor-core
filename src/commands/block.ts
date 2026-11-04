import { Delta, diff, invert, isTextInsert, isInsert } from '@scrider/delta';
import type { AttributeMap } from '@scrider/delta';

import {
  applyAttributePatchesAtNewlines,
  blockAttrsAtNewlineInOp,
  DEFAULT_SCRIDER_TEXT_INDENT,
  LIST_START_KEY,
  SCRIDER_TEXT_INDENT_KEY,
} from '../delta/newlineBlockAttributes';
import { runIndentBehaviors } from '../behavior';
import { isLineSpacingBlock, SCRIDER_LINE_HEIGHT_KEY } from './settingsLineSpacing';
import type { EditorState } from '../state/EditorState';
import type { SelectionRange } from '../state/SelectionRange';
import { pushUndo } from '../state/HistoryState';

export {
  SCRIDER_TEXT_INDENT_KEY,
  DEFAULT_SCRIDER_TEXT_INDENT,
} from '../delta/newlineBlockAttributes';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_INDENT = 8;
const MAX_LIST_INDENT = 2; // 3 levels: 1. → 1.1. → 1.1.1.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export interface AffectedLineInfo {
  /** Position of the `\n` character in the Delta document. */
  newlineIndex: number;
  /** Current block attributes on the `\n`. */
  attributes: AttributeMap;
}

/**
 * `\n` that terminates the line containing `cursorIndex` (first `\n` at or after index).
 * Matches `getBlockFormatsAtPosition` / Quill block-attribute semantics.
 */
function findCurrentLineNewline(delta: Delta, cursorIndex: number): AffectedLineInfo | null {
  let pos = 0;

  for (const op of delta.ops) {
    if (isTextInsert(op)) {
      for (let i = 0; i < op.insert.length; i++) {
        if (op.insert[i] === '\n' && pos + i >= cursorIndex) {
          return {
            newlineIndex: pos + i,
            attributes: blockAttrsAtNewlineInOp(op, i),
          };
        }
      }
      pos += op.insert.length;
    } else if (isInsert(op)) {
      pos += 1;
    }
  }

  return null;
}

/**
 * When the caret sits on a `\n` between two lines (not `\n\n`), treat it as the
 * start of the line below so we don't apply block format to the paragraph above
 * (first-line indent / toolbar on adjacent `<p>`).
 *
 * List items are the opposite: end-of-item caret is that item's `\n`. Tab must
 * nest the current `<li>`, not the next one.
 */
function caretLineLookupIndex(delta: Delta, index: number): number {
  if (index <= 0 || index >= delta.length()) return index;

  const here = delta.slice(index, index + 1).ops[0];
  if (here == null || !isTextInsert(here) || here.insert !== '\n') return index;

  if (blockAttrsAtNewlineInOp(here, 0).list != null) return index;

  const prev = delta.slice(index - 1, index).ops[0];
  if (prev != null && isTextInsert(prev) && prev.insert === '\n') return index;

  if (index + 1 < delta.length()) return index + 1;
  return index;
}

/**
 * Find all lines whose `\n` terminates a line overlapping with the selection.
 * Caret: single line via `findCurrentLineNewline`. Range: every `\n` in range.
 */
export function getAffectedLines(delta: Delta, selection: SelectionRange): AffectedLineInfo[] {
  if (selection.length === 0) {
    const line = findCurrentLineNewline(delta, caretLineLookupIndex(delta, selection.index));
    return line ? [line] : [];
  }

  const result: AffectedLineInfo[] = [];
  let pos = 0;
  let lineStart = 0;
  const selStart = selection.index;
  const selEnd = selection.index + selection.length;

  for (const op of delta.ops) {
    if (isTextInsert(op)) {
      for (let i = 0; i < op.insert.length; i++) {
        if (op.insert[i] === '\n') {
          const nlPos = pos + i;
          if (lineStart < selEnd && nlPos >= selStart) {
            result.push({
              newlineIndex: nlPos,
              attributes: blockAttrsAtNewlineInOp(op, i),
            });
          }
          lineStart = nlPos + 1;
        }
      }
      pos += op.insert.length;
    } else if (isInsert(op)) {
      pos += 1;
    }
  }

  return result;
}

/** Plain `<p>` only — no heading, list, blockquote, code-block, or table cell. */
export function isPlainParagraphLine(attrs: AttributeMap): boolean {
  if (attrs.header != null) return false;
  if (attrs.list != null) return false;
  if (attrs.blockquote != null) return false;
  if (attrs['code-block'] != null) return false;
  if (attrs['table-row'] != null) return false;
  return true;
}

function isHeadingLine(attrs: AttributeMap): boolean {
  return attrs.header != null && attrs['table-row'] == null;
}

function hasScriderTextIndent(attrs: AttributeMap): boolean {
  const v = attrs[SCRIDER_TEXT_INDENT_KEY];
  return typeof v === 'string' && v.length > 0;
}

/**
 * Apply block-attribute patches at specific `\n` positions (split-safe).
 */
function applyBlockChange(
  state: EditorState,
  lines: readonly AffectedLineInfo[],
  getNewAttrs: (current: AttributeMap) => AttributeMap,
): EditorState {
  const patches = new Map<number, AttributeMap>();
  for (const line of lines) {
    const newAttrs = getNewAttrs(line.attributes);
    if (Object.keys(newAttrs).length > 0) {
      patches.set(line.newlineIndex, newAttrs);
    }
  }
  if (patches.size === 0) return state;

  const { delta, selection, history, config } = state;
  const newDelta = applyAttributePatchesAtNewlines(delta, patches);
  const change = diff(delta, newDelta);
  const inverseDelta = invert(change, delta);

  return {
    ...state,
    delta: newDelta,
    history: pushUndo(history, inverseDelta, selection, config.history),
  };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Set header level (1–6) or remove (null / 0).
 */
export function setHeader(state: EditorState, level: number | null): EditorState {
  const { delta, selection } = state;
  if (!selection) return state;

  const lines = getAffectedLines(delta, selection);
  if (lines.length === 0) return state;

  const value = level != null && level >= 1 && level <= 6 ? level : null;
  // Heading and list are mutually exclusive block formats
  return applyBlockChange(state, lines, () =>
    value != null
      ? { header: value, list: null, indent: null, [LIST_START_KEY]: null }
      : { header: value },
  );
}

/**
 * Toggle blockquote on/off.
 */
export function toggleBlockquote(state: EditorState): EditorState {
  const { delta, selection } = state;
  if (!selection) return state;

  const lines = getAffectedLines(delta, selection);
  if (lines.length === 0) return state;

  const allHave = lines.every((l) => l.attributes.blockquote != null);
  const value = allHave ? null : true;
  return applyBlockChange(state, lines, () => ({ blockquote: value }));
}

/**
 * Toggle code-block on/off. Optional `language` parameter.
 *
 * Exact-match toggle: removes code-block only when ALL affected lines
 * already carry the exact same value (language). If any line differs
 * (different language or no code-block), the value is applied instead.
 */
export function toggleCodeBlock(state: EditorState, language?: string): EditorState {
  const { delta, selection } = state;
  if (!selection) return state;

  const lines = getAffectedLines(delta, selection);
  if (lines.length === 0) return state;

  const value = language ?? true;
  const allExact = lines.every((l) => l.attributes['code-block'] === value);

  if (allExact) {
    return applyBlockChange(state, lines, () => ({
      'code-block': null,
      'code-block-width': null,
      'code-block-float': null,
      'code-block-height': null,
    }));
  }

  const formatted = applyBlockChange(state, lines, () => ({ 'code-block': value }));
  return ensurePlainLineBelowTailCodeBlock(state, formatted, lines);
}

function eachNewline(delta: Delta): AffectedLineInfo[] {
  const result: AffectedLineInfo[] = [];
  let pos = 0;
  for (const op of delta.ops) {
    if (isTextInsert(op)) {
      for (let i = 0; i < op.insert.length; i++) {
        if (op.insert[i] === '\n') {
          result.push({
            newlineIndex: pos + i,
            attributes: blockAttrsAtNewlineInOp(op, i),
          });
        }
      }
      pos += op.insert.length;
    } else if (isInsert(op)) {
      pos += 1;
    }
  }
  return result;
}

/**
 * Every newline of the fence that contains `current`.
 * Same `code-block-id` when the line has one; otherwise the contiguous run
 * of the same language.
 */
function codeBlockFenceLines(delta: Delta, current: AffectedLineInfo): AffectedLineInfo[] {
  const all = eachNewline(delta);
  const id = current.attributes['code-block-id'];
  if (typeof id === 'string') {
    return all.filter(
      (line) => line.attributes['code-block'] != null && line.attributes['code-block-id'] === id,
    );
  }

  const lang = current.attributes['code-block'];
  const idx = all.findIndex((line) => line.newlineIndex === current.newlineIndex);
  if (idx < 0) return [current];

  let start = idx;
  let end = idx;
  const sameRun = (line: AffectedLineInfo): boolean =>
    line.attributes['code-block'] === lang && line.attributes['code-block-id'] == null;
  while (start > 0 && sameRun(all[start - 1]!)) start--;
  while (end + 1 < all.length && sameRun(all[end + 1]!)) end++;
  return all.slice(start, end + 1);
}

/**
 * Set the language of the whole code-block fence.
 * Lookup uses `atIndex` when the caret has left the block (settings click).
 * Does not toggle the block off and does not add a trailing paragraph.
 * If the caret is outside the fence, it is placed at the start of the fence
 * so edit mode can continue.
 */
export function setCodeBlockFenceLanguage(
  state: EditorState,
  language: string,
  atIndex?: number,
): EditorState {
  const { delta, selection } = state;
  const lookup = atIndex ?? selection?.index;
  if (lookup == null || language.length === 0) return state;

  const current = findCurrentLineNewline(delta, lookup);
  if (!current || current.attributes['code-block'] == null) return state;

  const lines = codeBlockFenceLines(delta, current);
  if (lines.every((line) => line.attributes['code-block'] === language)) return state;

  const next = applyBlockChange(state, lines, () => ({ 'code-block': language }));
  const caretLine = selection ? findCurrentLineNewline(delta, selection.index) : null;
  const caretInside =
    caretLine != null && lines.some((line) => line.newlineIndex === caretLine.newlineIndex);
  if (caretInside) return next;

  const first = lines[0]!.newlineIndex;
  const prevNewline = eachNewline(delta)
    .map((line) => line.newlineIndex)
    .filter((index) => index < first)
    .pop();
  const fenceStart = prevNewline == null ? 0 : prevNewline + 1;
  return { ...next, selection: { index: fenceStart, length: 0 } };
}

/**
 * A code block at the document tail has no line under it, so the caret cannot
 * land below the block (same idea as a pasted table's separator paragraph).
 * Append one plain `\n` only when the last formatted line is the last
 * character. A following line — empty or not — is left as-is, so editing
 * and a second toggle do not stack blank paragraphs.
 */
function ensurePlainLineBelowTailCodeBlock(
  before: EditorState,
  formatted: EditorState,
  lines: readonly AffectedLineInfo[],
): EditorState {
  if (formatted === before || !before.selection) return formatted;

  const lastNewline = Math.max(...lines.map((line) => line.newlineIndex));
  if (lastNewline !== formatted.delta.length() - 1) return formatted;

  const delta = formatted.delta.concat(new Delta().insert('\n'));
  const change = diff(before.delta, delta);
  const inverseDelta = invert(change, before.delta);

  return {
    ...formatted,
    delta,
    history: pushUndo(before.history, inverseDelta, before.selection, before.config.history),
  };
}

export interface SetListOptions {
  /**
   * Toolbar buttons toggle the same list type off. Markdown shortcuts
   * (`1. `, `- `) must apply: after Ctrl+Enter Chrome often auto-promotes
   * the next `1.` into an `<li>`, and a toggle would then erase the list.
   */
  toggle?: boolean;
  /**
   * Marker from `2. `. Stored on the opening item only. Ignored when the
   * line is already ordered, so a shortcut on a continuation does not restart.
   */
  start?: number;
}

/**
 * Set list type: 'bullet' | 'ordered' | 'checked' | 'unchecked' | null.
 */
export function setList(
  state: EditorState,
  type: string | null,
  options?: SetListOptions,
): EditorState {
  const { delta, selection } = state;
  if (!selection) return state;

  const lines = getAffectedLines(delta, selection);
  if (lines.length === 0) return state;

  const shouldToggle = options?.toggle !== false;
  // Toggle: if all affected lines already have this list type, remove it
  const effectiveType =
    shouldToggle && type != null && lines.every((line) => line.attributes.list === type)
      ? null
      : type;

  // List and heading are mutually exclusive block formats.
  // `list-start` lives on the first item of a run (`2.` → 2, 3, 4).
  let startUsed = false;
  return applyBlockChange(state, lines, (current) => {
    if (effectiveType === null) {
      return { list: null, indent: null, [LIST_START_KEY]: null };
    }
    const patch: AttributeMap = { list: effectiveType, header: null };
    if (effectiveType !== 'ordered') {
      patch[LIST_START_KEY] = null;
      return patch;
    }
    if (current.list === 'ordered') return patch;
    const start = options?.start;
    if (!startUsed && typeof start === 'number' && Number.isInteger(start) && start > 1) {
      startUsed = true;
      patch[LIST_START_KEY] = start;
    } else {
      patch[LIST_START_KEY] = null;
    }
    return patch;
  });
}

/**
 * Increase indent by 1 (max MAX_INDENT).
 */
export function increaseIndent(state: EditorState): EditorState {
  const { delta, selection } = state;
  if (!selection) return state;

  const lines = getAffectedLines(delta, selection);
  if (lines.length === 0) return state;

  return applyBlockChange(state, lines, (current) => {
    const handled = runIndentBehaviors(state, current, 1);
    if (handled) return handled;
    const cur = typeof current.indent === 'number' ? current.indent : 0;
    const max = current.list != null ? MAX_LIST_INDENT : MAX_INDENT;
    if (cur >= max) return {};
    const patch: AttributeMap = { indent: cur + 1 };
    if (current[LIST_START_KEY] != null) patch[LIST_START_KEY] = null;
    return patch;
  });
}

/**
 * Decrease indent by 1.
 * At indent 0 with list formatting: strip list + indent (exit list).
 */
export function decreaseIndent(state: EditorState): EditorState {
  const { delta, selection } = state;
  if (!selection) return state;

  const lines = getAffectedLines(delta, selection);
  if (lines.length === 0) return state;

  return applyBlockChange(state, lines, (current) => {
    const handled = runIndentBehaviors(state, current, -1);
    if (handled) return handled;
    const cur = typeof current.indent === 'number' ? current.indent : 0;
    if (cur > 0) {
      const patch: AttributeMap = { indent: cur <= 1 ? null : cur - 1 };
      if (current[LIST_START_KEY] != null) patch[LIST_START_KEY] = null;
      return patch;
    }
    // At indent 0 with list: strip list formatting (exit list)
    if (current.list != null) {
      return { list: null, indent: null, [LIST_START_KEY]: null };
    }
    return {};
  });
}

/**
 * Set text alignment: 'center' | 'right' | 'justify' | null (left/default).
 */
export function setAlign(state: EditorState, align: string | null): EditorState {
  const { delta, selection } = state;
  if (!selection) return state;

  const lines = getAffectedLines(delta, selection);
  if (lines.length === 0) return state;

  const value = align === 'left' ? null : align;
  return applyBlockChange(state, lines, () => ({ align: value }));
}

/**
 * Toggle first-line indent on plain paragraphs (`scrider-text-indent` on `\n`).
 * Headings, lists, blockquote, code-block, and table cells are skipped.
 */
/**
 * Set line spacing on the current line(s): multiplier string (e.g. `1.5`) or `null` to clear.
 * Applies to plain paragraphs, list items, and blockquotes — not headings or tables.
 */
export function setLineSpacing(state: EditorState, value: string | null): EditorState {
  const { delta, selection } = state;
  if (!selection) return state;

  const lines = getAffectedLines(delta, selection).filter((line) =>
    isLineSpacingBlock(line.attributes),
  );
  if (lines.length === 0) return state;

  const normalized =
    value === null || value === '' ? null : typeof value === 'string' ? value.trim() : null;

  return applyBlockChange(state, lines, (current) => {
    if (normalized === null) {
      if (current[SCRIDER_LINE_HEIGHT_KEY] == null) return {};
      return { [SCRIDER_LINE_HEIGHT_KEY]: null };
    }
    if (current[SCRIDER_LINE_HEIGHT_KEY] === normalized) return {};
    return { [SCRIDER_LINE_HEIGHT_KEY]: normalized };
  });
}

export function toggleTextIndent(
  state: EditorState,
  indent: string = DEFAULT_SCRIDER_TEXT_INDENT,
): EditorState {
  const { delta, selection } = state;
  if (!selection) return state;

  const lines = getAffectedLines(delta, selection).filter(
    (line) => isPlainParagraphLine(line.attributes) || isHeadingLine(line.attributes),
  );
  if (lines.length === 0) return state;

  const allHave = lines.every((line) => hasScriderTextIndent(line.attributes));
  const value = allHave ? null : indent;

  return applyBlockChange(state, lines, (current) => {
    if (value === null) {
      if (!hasScriderTextIndent(current)) return {};
      return { [SCRIDER_TEXT_INDENT_KEY]: null };
    }
    if (current[SCRIDER_TEXT_INDENT_KEY] === value) return {};
    return { [SCRIDER_TEXT_INDENT_KEY]: value };
  });
}
