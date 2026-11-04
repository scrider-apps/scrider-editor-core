import { Delta, isInsert, isTextInsert, type Op } from '@scrider/delta';

import {
  collapseFillerParagraphNewlinesInOps,
  isPresentationOnlyFillerAttrs,
} from '../collapseFillerParagraphs';
import { normalizePastedSimpleTableCellOps } from '../normalizeSimpleTablePaste';
import { splitTextOpsAtNewlines } from '../splitTextOpsAtNewlines';
import {
  dedupeEmbeddedNewlineBeforeStandaloneNewline,
  splitGluedParagraphBoundariesInTextOps,
  stripRedundantPlainNewlineTail,
  stripSinglePlainParagraphTailWhenInlineOnly,
} from './glueAndTails';
import {
  splitLineBeforeContainerBlockEmbeds,
  stripGapBetweenHeadingAndContainerBlockEmbed,
} from './blockEmbedLines';
import { collapseEmptyListItemNewlines, stripDecorativeListMarkerOps } from './emptyListItems';
import { stripGapBetweenTableAndBlockEmbed } from './tableGaps';

/**
 * Normalize pasted ops to canonical Quill block structure:
 * - no `\n` inside text ops (split to standalone `\n` ops)
 * - no duplicate paragraph terminators (text+\n op followed by \n op)
 * - a `{ block }` container embed always starts its own line
 *   (see splitLineBeforeContainerBlockEmbeds)
 * - blank lines between a heading and the following `{ block }` embed
 *   (markdown `###\n\n<table>` CommonMark HTML-block separator)
 * - Busuu spacer paragraphs collapsed (see collapseFillerParagraphNewlinesInOps)
 * - extra empty list items collapsed (LMS nested `<div>` inside `<li>`)
 * - decorative `•` glyphs stripped from list item starts
 * - no redundant plain `\n` runs at fragment tail
 */
/** Inline `softBreak` embed (`<br>` within a paragraph) — never a block. */
export function isSoftBreakOp(op: Op): boolean {
  return isInsert(op) && typeof op.insert !== 'string' && 'softBreak' in op.insert;
}

/**
 * A "blank" op in the fragment's trailing run: a soft break, a whitespace-only
 * text op, or an empty paragraph `\n` (plain or presentation-only). Table cell
 * terminators, block embeds, and structural `\n` (heading/list/…) are content.
 */
export function isBlankPasteTailOp(op: Op): boolean {
  if (isSoftBreakOp(op)) return true;
  if (!isTextInsert(op)) return false;
  const text = op.insert;
  if (text === '\n') {
    if (op.attributes?.['table-row'] != null) return false;
    const attrs = op.attributes ?? {};
    if (Object.keys(attrs).length === 0) return true;
    return isPresentationOnlyFillerAttrs(attrs);
  }
  return !text.includes('\n') && text.trim().length === 0;
}

/**
 * Collapse the fragment's trailing run of blank ops to a single paragraph
 * terminator.
 *
 * Pasted page chrome (e.g. Busuu's `<nav>`, a WebKit
 * `<br class="Apple-interchange-newline">`, stray whitespace) trails the real
 * content as a mix of soft breaks, whitespace-only text, and empty paragraph
 * `\n` ops that `stripRedundantPlainNewlineTail` cannot collapse (the embeds /
 * text break its consecutive-`\n` run). Replacing that whole run with one `\n`
 * yields exactly one empty paragraph under a trailing table/divider (matching
 * Refresh-view) while a plain-text paste keeps just its terminator — because a
 * table cell's `\n` stays in the content head and supplies its own break.
 */
export function collapseTrailingBlankPasteOps(ops: Op[]): Op[] {
  let headEnd = ops.length;
  while (headEnd > 0 && isBlankPasteTailOp(ops[headEnd - 1]!)) headEnd--;
  if (headEnd === ops.length) return ops;

  const head = ops.slice(0, headEnd);
  if (head.length === 0) return [{ insert: '\n' }];
  return [...head, { insert: '\n' }];
}

export function canonicalizePasteOps(ops: readonly Op[]): Op[] {
  let result = splitGluedParagraphBoundariesInTextOps(ops);
  result = splitTextOpsAtNewlines(result);
  result = normalizePastedSimpleTableCellOps(result);
  result = dedupeEmbeddedNewlineBeforeStandaloneNewline(result);
  result = splitLineBeforeContainerBlockEmbeds(result);
  result = collapseFillerParagraphNewlinesInOps(result);
  result = stripGapBetweenHeadingAndContainerBlockEmbed(result);
  result = stripDecorativeListMarkerOps(result);
  result = collapseEmptyListItemNewlines(result);
  result = stripGapBetweenTableAndBlockEmbed(result);
  result = stripRedundantPlainNewlineTail(result);
  result = collapseTrailingBlankPasteOps(result);
  result = stripSinglePlainParagraphTailWhenInlineOnly(result);
  return result;
}

export function opCharLength(op: Op): number {
  if (isTextInsert(op)) return op.insert.length;
  if (isInsert(op)) return 1;
  return 0;
}

export function collectOpsInCharRange(
  delta: Delta,
  start: number,
  endExclusive: number,
): { beforeOps: Op[]; midOps: Op[]; afterOps: Op[] } | null {
  const beforeOps: Op[] = [];
  const midOps: Op[] = [];
  const afterOps: Op[] = [];
  let pos = 0;

  for (const op of delta.ops) {
    const len = opCharLength(op);
    const opStart = pos;
    const opEnd = pos + len;

    if (opEnd <= start) {
      beforeOps.push(op);
    } else if (opStart >= endExclusive) {
      afterOps.push(op);
    } else if (opStart >= start && opEnd <= endExclusive) {
      midOps.push(op);
    } else {
      return null;
    }
    pos = opEnd;
  }

  return { beforeOps, midOps, afterOps };
}

/**
 * Re-run {@link canonicalizePasteOps} on a pasted range.
 *
 * Must run BEFORE document-settings bake: the filler-collapse step rewrites
 * presentation-only `\n` ops to plain paragraph breaks (dropping attributes),
 * which would otherwise strip freshly-baked `scrider-*` settings.
 */
export function canonicalizePasteDeltaRange(
  delta: Delta,
  start: number,
  endExclusive: number,
): Delta {
  if (endExclusive <= start) return delta;

  const collected = collectOpsInCharRange(delta, start, endExclusive);
  if (!collected) {
    const before = delta.slice(0, start);
    const mid = delta.slice(start, endExclusive);
    const after = delta.slice(endExclusive);
    const canonical = canonicalizePasteOps(mid.ops);
    return before.concat(new Delta(canonical)).concat(after);
  }

  const canonical = canonicalizePasteOps(collected.midOps);
  const before = new Delta(collected.beforeOps);
  const after = new Delta(collected.afterOps);
  return before.concat(new Delta(canonical)).concat(after);
}
