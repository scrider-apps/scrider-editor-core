import { compose, invert, isInsert, isTextInsert } from '@scrider/delta';
import { Delta } from '@scrider/delta';
import type { AttributeMap } from '@scrider/delta';

import type { EditorState } from '../state/EditorState';
import { pushUndo } from '../state/HistoryState';
import { isHeaderLevel } from '../queries/headerDefaults';

import { listHeadingLines } from './settingsHeadingBold';

export interface TextRange {
  readonly start: number;
  readonly length: number;
}

/**
 * Sub-ranges of `[selStart, selStart + selLen)` that belong to non-heading blocks.
 * Heading blocks are skipped entirely.
 */
export function computeNonHeadingRanges(
  delta: Delta,
  selStart: number,
  selLen: number,
): TextRange[] {
  if (selLen <= 0) return [];
  const selEnd = selStart + selLen;
  const result: TextRange[] = [];

  let pos = 0;
  let blockStart = 0;

  const emitIfInSelection = (blockEnd: number, headerLevel: unknown): void => {
    if (isHeaderLevel(headerLevel)) return;
    const start = Math.max(blockStart, selStart);
    const end = Math.min(blockEnd, selEnd);
    if (start < end) result.push({ start, length: end - start });
  };

  for (const op of delta.ops) {
    if (!isInsert(op)) continue;
    if (!isTextInsert(op)) {
      pos += 1;
      continue;
    }
    const text = op.insert;
    let i = 0;
    while (i < text.length) {
      const nl = text.indexOf('\n', i);
      if (nl === -1) {
        pos += text.length - i;
        break;
      }
      pos += nl - i;
      const blockEndInclusiveOfNewline = pos + 1;
      emitIfInSelection(blockEndInclusiveOfNewline, op.attributes?.header);
      pos += 1;
      blockStart = pos;
      i = nl + 1;
    }
  }

  if (blockStart < pos) emitIfInSelection(pos, undefined);

  return result;
}

function sortAndMergeAdjacentRanges(ranges: readonly TextRange[]): TextRange[] {
  if (ranges.length <= 1) return [...ranges];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: TextRange[] = [];
  let cur = sorted[0]!;

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!;
    if (cur.start + cur.length >= next.start) {
      const end = Math.max(cur.start + cur.length, next.start + next.length);
      cur = { start: cur.start, length: end - cur.start };
    } else {
      merged.push(cur);
      cur = next;
    }
  }
  merged.push(cur);
  return merged;
}

/**
 * Contiguous text ranges inside `[selStart, selStart + selLen)` that may receive
 * inline formats (`font`, `bold`, …). Newlines and embeds are skipped — putting
 * `font` on `\n` (header / table-row) or formula embeds breaks table/heading
 * structure after Ctrl+A → Font.
 */
export function collectInlineTextRanges(
  delta: Delta,
  selStart: number,
  selLen: number,
): TextRange[] {
  if (selLen <= 0) return [];
  const selEnd = selStart + selLen;
  const ranges: TextRange[] = [];
  let pos = 0;
  let runStart: number | null = null;

  const flush = (at: number): void => {
    if (runStart != null && at > runStart) {
      ranges.push({ start: runStart, length: at - runStart });
    }
    runStart = null;
  };

  for (const op of delta.ops) {
    if (!isInsert(op)) continue;

    if (!isTextInsert(op)) {
      if (pos >= selStart && pos < selEnd) flush(pos);
      pos += 1;
      if (pos >= selEnd) {
        flush(pos);
        return sortAndMergeAdjacentRanges(ranges);
      }
      continue;
    }

    const text = op.insert;
    for (let i = 0; i < text.length; i++) {
      const p = pos + i;
      if (p < selStart) continue;
      if (p >= selEnd) {
        flush(p);
        return sortAndMergeAdjacentRanges(ranges);
      }
      if (text[i] === '\n') {
        flush(p);
      } else if (runStart == null) {
        runStart = p;
      }
    }
    pos += text.length;
  }

  flush(Math.min(pos, selEnd));
  return sortAndMergeAdjacentRanges(ranges);
}

/**
 * Ranges where `setFontSize` should apply:
 * - heading lines intersecting the selection expand to the full line body;
 * - other selected text keeps the original slice, **excluding** `\n` and embeds
 *   (stamping `size` on table-row / header newlines after paste+Size breaks
 *   structure the same way `font` on `\n` did for Ctrl+A → Font).
 */
export function computeFontSizeApplyRanges(
  delta: Delta,
  selStart: number,
  selLen: number,
): TextRange[] {
  const ranges: TextRange[] = [];
  const selEnd = selStart + selLen;

  for (const line of listHeadingLines(delta)) {
    if (line.lineStart >= line.newlineIndex) continue;
    const intersects =
      selLen === 0
        ? selStart >= line.lineStart && selStart <= line.newlineIndex
        : line.lineStart < selEnd && line.newlineIndex >= selStart;
    if (intersects) {
      ranges.push({
        start: line.lineStart,
        length: line.newlineIndex - line.lineStart,
      });
    }
  }

  if (selLen > 0) {
    ranges.push(...collectInlineTextRanges(delta, selStart, selLen));
  }

  return sortAndMergeAdjacentRanges(ranges);
}

/** Apply an inline format to one or more text ranges (single undo entry). */
export function applyInlineFormatToRanges(
  state: EditorState,
  format: string,
  value: string | boolean | null,
  ranges: readonly TextRange[],
): EditorState {
  return applyInlineAttrsToRanges(state, { [format]: value }, ranges);
}

/** Apply several inline attributes to the same ranges in one undo entry. */
export function applyInlineAttrsToRanges(
  state: EditorState,
  attrs: AttributeMap,
  ranges: readonly TextRange[],
): EditorState {
  if (ranges.length === 0) return state;

  const { delta, selection, history, config } = state;
  let change = new Delta();
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) change = change.retain(range.start - cursor);
    if (range.length > 0) change = change.retain(range.length, attrs);
    cursor = range.start + range.length;
  }
  if (cursor < delta.length()) change = change.retain(delta.length() - cursor);

  const newDelta = compose(delta, change);
  const inverseDelta = invert(change, delta);

  return {
    ...state,
    delta: newDelta,
    history: pushUndo(history, inverseDelta, selection, config.history),
  };
}
