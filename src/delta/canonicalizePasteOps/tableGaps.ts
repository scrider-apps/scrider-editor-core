import { isInsert, isTextInsert, type Op } from '@scrider/delta';
import type { AttributeMap } from '@scrider/delta';

import {
  isBlockEmbedOp,
  isPresentationOnlyFillerAttrs,
  isTableCellNewlineOp,
} from '../collapseFillerParagraphs';

export const TABLE_CELL_NEWLINE_ATTR_KEYS = [
  'table-row',
  'table-col',
  'table-header',
  'table-col-align',
] as const;

export function tableCellNewlineAttrsOnly(
  attrs: AttributeMap | undefined,
): AttributeMap | undefined {
  if (!attrs) return undefined;
  const cleaned: AttributeMap = {};
  for (const key of TABLE_CELL_NEWLINE_ATTR_KEYS) {
    if (attrs[key] != null) cleaned[key] = attrs[key];
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

/** Blank spacer line: no structural attributes, so removing it loses no content. */
function isGapNewlineOp(op: Op): boolean {
  if (!isTextInsert(op) || op.insert !== '\n') return false;
  const attrs = op.attributes;
  if (!attrs || Object.keys(attrs).length === 0) return true;
  return isPresentationOnlyFillerAttrs(attrs);
}

function dividerIndex(ops: readonly Op[], from: number): number {
  for (let i = from; i < ops.length; i++) {
    const op = ops[i]!;
    if (!isBlockEmbedOp(op) || !isInsert(op) || typeof op.insert === 'string') continue;
    if ('divider' in op.insert) return i;
  }
  return -1;
}

/**
 * Drop the blank spacer lines a table→divider paste leaves between the last
 * cell terminator and the `<hr>`.
 *
 * The gap must be *adjacent*: only blank `\n` ops may sit between the two.
 * Scanning for "the last table cell newline anywhere before the first divider"
 * instead swept whole documents — Communication.dlt has a Simple table near the
 * top and an `<hr>` at the very bottom, so every paragraph and heading
 * terminator in between was deleted and the text fused into the Extended
 * tables below it.
 */
export function stripGapBetweenTableAndBlockEmbed(ops: Op[]): Op[] {
  let dividerIdx = dividerIndex(ops, 0);
  let lastTableNl = -1;
  while (dividerIdx >= 0) {
    let gapStart = dividerIdx;
    while (gapStart > 0 && isGapNewlineOp(ops[gapStart - 1]!)) gapStart--;
    if (gapStart > 0 && isTableCellNewlineOp(ops[gapStart - 1]!)) {
      lastTableNl = gapStart - 1;
      break;
    }
    dividerIdx = dividerIndex(ops, dividerIdx + 1);
  }
  if (dividerIdx < 0 || lastTableNl < 0) return ops;

  const removedGap = dividerIdx > lastTableNl + 1;
  const out = ops.slice(0, lastTableNl + 1);
  out.push(...ops.slice(dividerIdx));

  const tableOp = out[lastTableNl];
  const nextAfterTable = out[lastTableNl + 1];
  if (
    tableOp &&
    nextAfterTable &&
    isTableCellNewlineOp(tableOp) &&
    isBlockEmbedOp(nextAfterTable)
  ) {
    const cleanedAttrs = tableCellNewlineAttrsOnly(
      isTextInsert(tableOp) ? tableOp.attributes : undefined,
    );
    const rawAttrs = isTextInsert(tableOp) ? tableOp.attributes : undefined;
    const hasExtraAttrs =
      rawAttrs != null &&
      Object.keys(rawAttrs).some(
        (k) =>
          !TABLE_CELL_NEWLINE_ATTR_KEYS.includes(
            k as (typeof TABLE_CELL_NEWLINE_ATTR_KEYS)[number],
          ),
      );
    if (hasExtraAttrs) {
      out[lastTableNl] = cleanedAttrs
        ? { insert: '\n', attributes: cleanedAttrs }
        : { insert: '\n' };
      return out;
    }
  }

  return removedGap ? out : ops;
}
