import { isInsert, isTextInsert, type Op } from '@scrider/delta';

import { isPresentationOnlyFillerAttrs } from '../collapseFillerParagraphs';

/** `{ block: … }` container embed (Extended table, …) — owns the following `\n`. */
function isContainerBlockEmbedOp(op: Op): boolean {
  return isInsert(op) && typeof op.insert !== 'string' && 'block' in op.insert;
}

/**
 * A container block embed always starts its own line: `{ block }` consumes the
 * `\n` that follows it, so a text op right before the embed has no terminator
 * of its own and fuses into the table's line.
 *
 * `htmlToDelta` produces exactly that when a heading between two Extended
 * tables reaches it as a bare text node (own Ctrl+A copy pasted through the
 * HTML branch): `{block} \n "Making a Request" {block} \n`. The formatter then
 * renders the heading as a bare text node between two table hosts — 12pt body
 * text glued to the grid — and every DomBridge index below the first table
 * drifts by one.
 *
 * Restoring the missing paragraph break cannot change well-formed input: for
 * canonical ops the preceding op always ends a line already.
 */
export function splitLineBeforeContainerBlockEmbeds(ops: readonly Op[]): Op[] {
  const out: Op[] = [];
  for (const op of ops) {
    if (isContainerBlockEmbedOp(op)) {
      const prev = out[out.length - 1];
      if (prev && isTextInsert(prev) && prev.insert.length > 0 && !prev.insert.endsWith('\n')) {
        out.push({ insert: '\n' });
      }
    }
    out.push(op);
  }
  return out;
}

function isHeadingNewlineOp(op: Op): boolean {
  return isTextInsert(op) && op.insert === '\n' && typeof op.attributes?.header === 'number';
}

function isBlankGapNewlineOp(op: Op): boolean {
  if (!isTextInsert(op) || op.insert !== '\n') return false;
  const attrs = op.attributes;
  if (!attrs || Object.keys(attrs).length === 0) return true;
  return isPresentationOnlyFillerAttrs(attrs);
}

/**
 * Drop blank lines between a heading terminator and the following `{ block }`
 * embed.
 *
 * `deltaToMarkdown` puts a blank line after `###` so the raw `<table>` that
 * follows is a CommonMark HTML block. `parsePastedMarkdown` then keeps that
 * line as an empty paragraph — Ctrl+V of a heading+Extended-table document
 * grows a gap the source never had. Adjacent blanks only: a real paragraph
 * between the heading and the table is left alone.
 */
export function stripGapBetweenHeadingAndContainerBlockEmbed(ops: readonly Op[]): Op[] {
  const out: Op[] = [];
  let i = 0;
  while (i < ops.length) {
    const op = ops[i]!;
    if (!isHeadingNewlineOp(op)) {
      out.push(op);
      i++;
      continue;
    }
    out.push(op);
    i++;
    let gapEnd = i;
    while (gapEnd < ops.length && isBlankGapNewlineOp(ops[gapEnd]!)) gapEnd++;
    const after = ops[gapEnd];
    if (after && isContainerBlockEmbedOp(after) && gapEnd > i) {
      i = gapEnd;
      continue;
    }
  }
  return out;
}
