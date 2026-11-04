import { Delta, isInsert, isTextInsert, type Op } from '@scrider/delta';

import { isBlockOwnedNewlineEmbedOp, isTableCellNewlineOp } from '../collapseFillerParagraphs';
import { blockAttrsAtNewlineInOp } from '../newlineBlockAttributes';

function deltaCharAt(delta: Delta, index: number): string | null {
  let pos = 0;
  for (const op of delta.ops) {
    if (isTextInsert(op)) {
      const end = pos + op.insert.length;
      if (index >= pos && index < end) {
        return op.insert[index - pos]!;
      }
      pos = end;
    } else if (isInsert(op)) {
      if (index === pos) return null;
      pos += 1;
    }
  }
  return null;
}

function blockOwnedNewlineEmbedOpAtIndex(delta: Delta, index: number): Op | null {
  let pos = 0;
  for (const op of delta.ops) {
    if (isTextInsert(op)) {
      pos += op.insert.length;
    } else if (isInsert(op)) {
      if (pos === index && isBlockOwnedNewlineEmbedOp(op)) return op;
      pos += 1;
    }
  }
  return null;
}

function tableCellNewlineAttrsAtIndex(delta: Delta, index: number): Record<string, unknown> | null {
  let pos = 0;
  for (const op of delta.ops) {
    if (isTextInsert(op)) {
      for (let i = 0; i < op.insert.length; i++) {
        if (pos + i === index && op.insert[i] === '\n') {
          const attrs = blockAttrsAtNewlineInOp(op, i);
          return attrs['table-row'] != null ? attrs : null;
        }
      }
      pos += op.insert.length;
    } else if (isInsert(op)) {
      pos += 1;
    }
  }
  return null;
}

function plainParagraphNewlineAtIndex(delta: Delta, index: number): boolean {
  if (deltaCharAt(delta, index) !== '\n') return false;
  return (
    tableCellNewlineAttrsAtIndex(delta, index) == null &&
    blockOwnedNewlineEmbedOpAtIndex(delta, index - 1) == null
  );
}

function blockOwnedNewlineAtIndex(delta: Delta, index: number): boolean {
  return (
    deltaCharAt(delta, index) === '\n' && blockOwnedNewlineEmbedOpAtIndex(delta, index - 1) != null
  );
}

/**
 * Caret on the line below a block-owned embed: skip inline continuation text
 * (`Hel|table|lo`) and an optional separator `\n` under the pasted block.
 */
function caretAfterBlockEmbedLine(delta: Delta, blockEmbedIndex: number): number {
  const ownedNewline = blockEmbedIndex + 1;
  const afterOwned = ownedNewline + 1;
  if (
    afterOwned < delta.length() &&
    deltaCharAt(delta, afterOwned) === '\n' &&
    plainParagraphNewlineAtIndex(delta, afterOwned) &&
    blockOwnedNewlineAtIndex(delta, ownedNewline)
  ) {
    // Land on the empty separator paragraph under the block, not past it.
    return afterOwned;
  }

  let idx = afterOwned;
  while (idx < delta.length()) {
    const ch = deltaCharAt(delta, idx);
    if (ch === null) break;
    if (ch === '\n') {
      idx++;
      break;
    }
    idx++;
  }
  // Inline continuation (`Hel|table|lo`) may be followed by a separator `\n` under the block.
  if (
    idx < delta.length() &&
    plainParagraphNewlineAtIndex(delta, idx) &&
    blockOwnedNewlineAtIndex(delta, ownedNewline)
  ) {
    idx++;
  }
  return idx;
}

function hasInlineContinuationAfterBlockEmbedLine(delta: Delta, blockEmbedIndex: number): boolean {
  const idx = blockEmbedIndex + 2;
  if (idx >= delta.length()) return false;
  const ch = deltaCharAt(delta, idx);
  return ch !== null && ch !== '\n';
}

/** Block embed before `insertIndex` when the index sits on trailing inline text after its line. */
function blockEmbedIndexForInlineContinuationPaste(
  delta: Delta,
  insertIndex: number,
): number | null {
  let pos = 0;
  let hit: number | null = null;
  for (const op of delta.ops) {
    if (isInsert(op) && typeof op.insert !== 'string' && isBlockOwnedNewlineEmbedOp(op)) {
      const embedIdx = pos;
      const ownedNl = embedIdx + 1;
      if (ownedNl < insertIndex && blockOwnedNewlineAtIndex(delta, ownedNl)) {
        let paragraphEnd = ownedNl + 1;
        while (paragraphEnd < delta.length() && deltaCharAt(delta, paragraphEnd) !== '\n') {
          paragraphEnd++;
        }
        if (insertIndex <= paragraphEnd) {
          hit = embedIdx;
        }
      }
    }
    pos += isInsert(op) ? (typeof op.insert === 'string' ? op.insert.length : 1) : 0;
  }
  return hit;
}

/**
 * When the caret sits on the `\n` that terminates a block-owned embed line,
 * move the paste point to the following line (same rule as `insertBlock` +2).
 */
export interface AdjustPasteInsertIndexOptions {
  /** Pasted fragment includes `{ block: … }` / divider — must not fuse into prior text line. */
  pastingBlockOwnedEmbed?: boolean;
  /** Pasted fragment is a flat Simple Table grid (`table-row` on cell `\n` ops). */
  pastingTableGrid?: boolean;
}

export function pasteOpsContainBlockOwnedEmbed(ops: readonly Op[]): boolean {
  return ops.some((op) => isInsert(op) && isBlockOwnedNewlineEmbedOp(op));
}

export function pasteOpsContainTableGrid(ops: readonly Op[]): boolean {
  return ops.some((op) => isTableCellNewlineOp(op));
}

/**
 * Snap a typing caret off a block-owned embed line (`{ divider }` / `{ block }`).
 *
 * The embed and its owned `\n` are not a text line. A caret parked on either
 * character (click on `<hr>` padding, or Chrome's after-void offset) must
 * insert on the following paragraph — otherwise the text glues onto the
 * embed (`{divider}123\n`) and renders above the rule.
 */
function isDividerEmbedAt(delta: Delta, index: number): boolean {
  const op = blockOwnedNewlineEmbedOpAtIndex(delta, index);
  if (!op || !isInsert(op) || typeof op.insert === 'string') return false;
  return 'divider' in op.insert;
}

/** `{ divider }` or its owned `\n` → embed index; otherwise `null`. */
function dividerLineStartAt(delta: Delta, index: number): number | null {
  if (isDividerEmbedAt(delta, index)) return index;
  if (blockOwnedNewlineAtIndex(delta, index) && isDividerEmbedAt(delta, index - 1)) {
    return index - 1;
  }
  return null;
}

/** Inclusive line start and `\n` (or EOD) end for the paragraph containing `index`. */
function paragraphLineBounds(delta: Delta, index: number): { start: number; end: number } | null {
  const len = delta.length();
  if (len <= 0) return null;
  let start = Math.max(0, Math.min(index, len - 1));
  while (start > 0 && deltaCharAt(delta, start - 1) !== '\n') {
    start--;
  }
  let end = start;
  while (end < len && deltaCharAt(delta, end) !== '\n') {
    end++;
  }
  return { start, end };
}

/** First index of a run of divider lines that ends at `afterIndex`. */
function skipDividerRunStart(delta: Delta, afterIndex: number): number {
  let start = afterIndex;
  while (start >= 2 && dividerLineStartAt(delta, start - 2) === start - 2) {
    start -= 2;
  }
  return start;
}

/**
 * Arrows must not park on a divider line (the `<hr>` padding box looks like
 * an empty paragraph). Skip the whole embed+`\n` (and stacked rules):
 * - up/down: adjacent line, same column when possible
 * - left from line-start below / right from line-end above: wrap to the
 *   neighbouring paragraph (end of the line above / start of the line below)
 */
export function skipDividerLineOnArrow(
  delta: Delta,
  index: number,
  direction: 'up' | 'down' | 'left' | 'right',
): number | null {
  const goingBack = direction === 'up' || direction === 'left';

  const onDivider = dividerLineStartAt(delta, index);
  if (onDivider != null) {
    if (goingBack) {
      const runStart = skipDividerRunStart(delta, onDivider);
      if (runStart <= 0) return 0;
      const above = paragraphLineBounds(delta, runStart - 1);
      if (!above) return 0;
      return direction === 'left' ? above.end : above.start;
    }
    let below = onDivider + 2;
    while (dividerLineStartAt(delta, below) === below) below += 2;
    if (below >= delta.length()) return delta.length();
    const dest = paragraphLineBounds(delta, below);
    return dest ? dest.start : below;
  }

  const line = paragraphLineBounds(delta, index);
  if (!line) return null;

  if (goingBack) {
    const runStart = skipDividerRunStart(delta, line.start);
    if (runStart === line.start) return null;
    if (direction === 'left' && index !== line.start) return null;
    if (runStart <= 0) return 0;
    const above = paragraphLineBounds(delta, runStart - 1);
    if (!above) return null;
    if (direction === 'left') return above.end;
    const offset = Math.max(0, index - line.start);
    return Math.min(above.start + offset, above.end);
  }

  if (dividerLineStartAt(delta, line.end + 1) !== line.end + 1) return null;
  if (direction === 'right' && index !== line.end) return null;
  let below = line.end + 1 + 2;
  while (dividerLineStartAt(delta, below) === below) below += 2;
  if (below >= delta.length()) return delta.length();
  const dest = paragraphLineBounds(delta, below);
  if (!dest) return below;
  if (direction === 'right') return dest.start;
  const offset = Math.max(0, index - line.start);
  return Math.min(dest.start + offset, dest.end);
}

/** Whole divider line (embed + owned `\n`) under / just behind the caret. */
export function dividerLineToDeleteBackward(
  delta: Delta,
  index: number,
): { start: number; length: number } | null {
  if (index <= 0) return null;
  const on = dividerLineStartAt(delta, index);
  if (on != null) return { start: on, length: 2 };
  const before = dividerLineStartAt(delta, index - 1);
  if (before != null) return { start: before, length: 2 };
  return null;
}

/** Whole divider line at / just ahead of the caret (Delete key). */
export function dividerLineToDeleteForward(
  delta: Delta,
  index: number,
): { start: number; length: number } | null {
  const on = dividerLineStartAt(delta, index);
  if (on != null) return { start: on, length: 2 };
  return null;
}

export function adjustTextInsertIndex(delta: Delta, insertIndex: number): number {
  if (insertIndex < 0) return 0;
  if (blockOwnedNewlineEmbedOpAtIndex(delta, insertIndex)) {
    return Math.min(insertIndex + 2, delta.length());
  }
  if (blockOwnedNewlineAtIndex(delta, insertIndex)) {
    return Math.min(insertIndex + 1, delta.length());
  }
  return insertIndex;
}

export function adjustPasteInsertIndex(
  delta: Delta,
  insertIndex: number,
  options?: AdjustPasteInsertIndexOptions,
): number {
  if (insertIndex <= 0) return insertIndex;

  const pastingStructuralTable =
    options?.pastingBlockOwnedEmbed === true || options?.pastingTableGrid === true;

  const inlineContinuationBlock = blockEmbedIndexForInlineContinuationPaste(delta, insertIndex);
  if (
    inlineContinuationBlock != null &&
    hasInlineContinuationAfterBlockEmbedLine(delta, inlineContinuationBlock)
  ) {
    return caretAfterBlockEmbedLine(delta, inlineContinuationBlock);
  }

  // Block / Simple table paste at end of a text line: DOM often maps the caret to the
  // last visible character (before the paragraph `\n`), not onto the `\n` itself.
  if (pastingStructuralTable && deltaCharAt(delta, insertIndex) !== '\n') {
    const next = insertIndex + 1;
    if (
      next < delta.length() &&
      deltaCharAt(delta, next) === '\n' &&
      plainParagraphNewlineAtIndex(delta, next)
    ) {
      return next + 1;
    }
  }

  if (deltaCharAt(delta, insertIndex) !== '\n') return insertIndex;
  if (blockOwnedNewlineEmbedOpAtIndex(delta, insertIndex - 1)) {
    return insertIndex + 1;
  }
  if (tableCellNewlineAttrsAtIndex(delta, insertIndex)) {
    return insertIndex + 1;
  }
  // Simple / block table paste leaves a separator `\n` under the block; pasting on
  // it must target the line below, not splice into the last row / adjacent embed.
  if (plainParagraphNewlineAtIndex(delta, insertIndex)) {
    if (tableCellNewlineAttrsAtIndex(delta, insertIndex - 1)) {
      return insertIndex + 1;
    }
    if (blockOwnedNewlineAtIndex(delta, insertIndex - 1)) {
      return insertIndex + 1;
    }
    // End-of-line caret sits ON the paragraph `\n` after text (`undo.|\\n`). Table
    // paste must land on the following line, not before the break (`undo.{table}\\n`).
    if (pastingStructuralTable && insertIndex > 0 && deltaCharAt(delta, insertIndex - 1) !== '\n') {
      return insertIndex + 1;
    }
  }
  return insertIndex;
}

/** Plain separator `\n` immediately under a pasted table when `rangeEnd` is past it. */
export function postTableSeparatorIndexInRange(
  delta: Delta,
  rangeStart: number,
  rangeEnd: number,
): number | null {
  if (rangeEnd <= rangeStart) return null;
  const sepIdx = rangeEnd - 1;
  if (!plainParagraphNewlineAtIndex(delta, sepIdx)) return null;
  if (sepIdx <= 0) return null;
  if (tableCellNewlineAttrsAtIndex(delta, sepIdx - 1) != null) return sepIdx;
  if (blockOwnedNewlineAtIndex(delta, sepIdx - 1)) return sepIdx;
  return null;
}

/** Last index in `[rangeStart, rangeEnd)` that is not a `\n` (caret after visible content). */
export function pasteCaretIndexInRange(delta: Delta, rangeStart: number, rangeEnd: number): number {
  if (rangeEnd <= rangeStart) return rangeStart;
  let pos = 0;
  let lastContentEnd = rangeStart;
  for (const op of delta.ops) {
    if (isTextInsert(op)) {
      for (let i = 0; i < op.insert.length; i++) {
        const idx = pos + i;
        if (idx >= rangeStart && idx < rangeEnd && op.insert[i] !== '\n') {
          lastContentEnd = idx + 1;
        }
      }
      pos += op.insert.length;
    } else if (isInsert(op) && typeof op.insert !== 'string') {
      const idx = pos;
      if (idx >= rangeStart && idx < rangeEnd) {
        lastContentEnd = idx + 1;
        if (isBlockOwnedNewlineEmbedOp(op)) {
          const ownedNewline = idx + 1;
          if (ownedNewline < rangeEnd && deltaCharAt(delta, ownedNewline) === '\n') {
            lastContentEnd = ownedNewline + 1;
          }
        }
      }
      pos += 1;
    }
  }
  if (tableCellNewlineAttrsAtIndex(delta, lastContentEnd)) {
    lastContentEnd += 1;
  }

  let scanPos = 0;
  for (const op of delta.ops) {
    if (
      isInsert(op) &&
      typeof op.insert !== 'string' &&
      isBlockOwnedNewlineEmbedOp(op) &&
      scanPos >= rangeStart &&
      scanPos < rangeEnd
    ) {
      const advanced = caretAfterBlockEmbedLine(delta, scanPos);
      if (advanced > lastContentEnd) {
        lastContentEnd = advanced;
      }
    }
    scanPos += isInsert(op) ? (typeof op.insert === 'string' ? op.insert.length : 1) : 0;
  }

  const sepIdx = postTableSeparatorIndexInRange(delta, rangeStart, rangeEnd);
  if (sepIdx != null) {
    lastContentEnd = Math.max(lastContentEnd, sepIdx);
  }

  if (lastContentEnd === delta.length() - 1 && deltaCharAt(delta, lastContentEnd) === '\n') {
    const onPostTableSeparator =
      lastContentEnd >= 1 &&
      plainParagraphNewlineAtIndex(delta, lastContentEnd) &&
      (blockOwnedNewlineAtIndex(delta, lastContentEnd - 1) ||
        tableCellNewlineAttrsAtIndex(delta, lastContentEnd - 1) != null);
    if (!onPostTableSeparator) {
      lastContentEnd = delta.length();
    }
  }

  return lastContentEnd;
}

/** Caret on the document line below a block-owned embed (paste / selection landing). */
export function pasteCaretIndexBelowBlockEmbed(delta: Delta, blockEmbedIndex: number): number {
  return caretAfterBlockEmbedLine(delta, blockEmbedIndex);
}

/**
 * Pasted tables (simple grid or block embed) need an empty paragraph under the
 * block so the caret has a visible line to land on. First paste into an empty
 * doc inherits the document's trailing `\n`; later pastes at the tail do not.
 */
export function ensureSeparatorLineAfterPastedTable(
  delta: Delta,
  rangeStart: number,
  rangeEndExclusive: number,
): { delta: Delta; rangeEndExclusive: number } {
  if (rangeEndExclusive <= rangeStart) {
    return { delta, rangeEndExclusive };
  }
  const endsOnTableCell = tableCellNewlineAttrsAtIndex(delta, rangeEndExclusive - 1) != null;
  const endsOnBlockOwnedLine =
    rangeEndExclusive >= 2 && blockOwnedNewlineAtIndex(delta, rangeEndExclusive - 1);
  if (!endsOnTableCell && !endsOnBlockOwnedLine) {
    return { delta, rangeEndExclusive };
  }
  if (
    rangeEndExclusive < delta.length() &&
    plainParagraphNewlineAtIndex(delta, rangeEndExclusive)
  ) {
    return { delta, rangeEndExclusive };
  }
  return {
    delta: delta.concat(new Delta([{ insert: '\n' }])),
    rangeEndExclusive: rangeEndExclusive + 1,
  };
}
