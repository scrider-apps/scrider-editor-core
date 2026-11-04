import { Delta, isInsert, isTextInsert, type Op } from '@scrider/delta';

import {
  blockAttrsAtNewlineInOp,
  blockAttrsOnly,
  SCRIDER_TEXT_INDENT_KEY,
} from './newlineBlockAttributes';
import { SCRIDER_MARGIN_BEFORE_KEY } from '../commands/settingsParagraphSpacing';

export function isTableCellNewlineOp(op: Op): boolean {
  return (
    isTextInsert(op) &&
    op.insert === '\n' &&
    op.attributes !== undefined &&
    op.attributes['table-row'] != null
  );
}

export function isBlockEmbedOp(op: Op): boolean {
  if (!isInsert(op) || typeof op.insert === 'string') return false;
  const ins = op.insert;
  return 'divider' in ins || 'video' in ins || 'image' in ins;
}

/**
 * Block embeds stored as `{embed}` + owned `\n` (`insertBlock`, container blocks).
 * Excludes inline embeds (formula, softBreak) and ambiguous image/video inserts.
 */
export function isBlockOwnedNewlineEmbedOp(op: Op): boolean {
  if (!isInsert(op) || typeof op.insert === 'string') return false;
  const ins = op.insert;
  return 'divider' in ins || 'block' in ins;
}

/** Plain paragraph break when a Busuu spacer `\n` sat between two text ops. */
function shouldInsertPlainParagraphBreakBetween(
  prevOp: Op | undefined,
  nextOp: Op | undefined,
): boolean {
  if (!prevOp || !nextOp || !isTextInsert(prevOp) || !isTextInsert(nextOp)) return false;
  if (prevOp.insert === '\n' || nextOp.insert === '\n') return false;
  if (isTableCellNewlineOp(prevOp)) return false;
  const prevTrim = prevOp.insert.trimEnd();
  const nextTrim = nextOp.insert.trimStart();
  if (prevTrim.length === 0 || nextTrim.length === 0) return false;
  const last = prevTrim[prevTrim.length - 1];
  if (last !== '.' && last !== '?' && last !== '!') return false;
  return /^[A-Z"«]/.test(nextTrim) || nextTrim.startsWith('Use ');
}

function marginBeforeIsStructural(attrs: Record<string, unknown>): boolean {
  const v = attrs[SCRIDER_MARGIN_BEFORE_KEY];
  if (v == null || v === '' || v === '0' || v === '0em') return false;
  return true;
}

export function isPresentationOnlyFillerAttrs(attrs: Record<string, unknown>): boolean {
  if (Object.keys(attrs).length === 0) return false;
  if (
    attrs['table-row'] != null ||
    attrs.header != null ||
    attrs.list != null ||
    attrs.blockquote != null ||
    attrs['code-block'] != null ||
    attrs[SCRIDER_TEXT_INDENT_KEY] != null ||
    marginBeforeIsStructural(attrs)
  ) {
    return false;
  }
  const block = blockAttrsOnly(attrs);
  const PRESENTATION_ONLY = new Set([
    'align',
    'scrider-line-height',
    'scrider-margin-after',
    'scrider-margin-before',
  ]);
  for (const key of Object.keys(block)) {
    if (!PRESENTATION_ONLY.has(key)) return false;
  }
  return true;
}

function isPresentationOnlyNewlineOp(op: Op): boolean {
  return (
    isTextInsert(op) && op.insert === '\n' && isPresentationOnlyFillerAttrs(op.attributes ?? {})
  );
}

/** True when `ops[index]` is the terminator of a text line (prev op is line content). */
function newlineFollowsLineContent(ops: readonly Op[], index: number): boolean {
  const prev = index > 0 ? ops[index - 1] : undefined;
  if (!prev || !isTextInsert(prev)) return false;
  if (prev.insert === '\n') return false;
  return !prev.insert.endsWith('\n');
}

/** Presentation `\n` that is not a real line terminator (empty spacer paragraph). */
function isCollapsiblePresentationNewline(ops: readonly Op[], index: number): boolean {
  return isPresentationOnlyNewlineOp(ops[index]!) && !newlineFollowsLineContent(ops, index);
}

function presentationOnlyNewlineRunLength(ops: readonly Op[], index: number): number {
  if (!isCollapsiblePresentationNewline(ops, index)) return 0;
  let start = index;
  while (start > 0 && isCollapsiblePresentationNewline(ops, start - 1)) start--;
  let end = index;
  while (end + 1 < ops.length && isCollapsiblePresentationNewline(ops, end + 1)) end++;
  return end - start + 1;
}

/** `{ block: table|… }` container embed — owns the following `\n` (cost 2). */
function isContainerBlockEmbedOp(op: Op): boolean {
  return isInsert(op) && typeof op.insert !== 'string' && 'block' in op.insert;
}

/** Attribute-less `\n` that is not a real paragraph break (Busuu tail after table, etc.). */
function isPlainEmptyNewlineInRun(op: Op, ops: readonly Op[], index: number): boolean {
  if (!isTextInsert(op) || op.insert !== '\n') return false;
  if (op.attributes && Object.keys(op.attributes).length > 0) return false;
  const prev = index > 0 ? ops[index - 1] : undefined;
  const next = index + 1 < ops.length ? ops[index + 1] : undefined;
  // Never treat the terminator after `{ block }` as filler even when more blank
  // lines follow (Rise/Articulate paste: table + wrapper `\n`s + banner image).
  // Do not apply to divider/hr — their owned `\n` is preserved by a later op.
  if (prev && isContainerBlockEmbedOp(prev)) return false;
  const prevIsNewline = prev && isTextInsert(prev) && prev.insert === '\n';
  const nextPlain =
    next &&
    isTextInsert(next) &&
    next.insert === '\n' &&
    (!next.attributes || Object.keys(next.attributes).length === 0);
  const nextEmbed = next && isBlockEmbedOp(next);
  if (prevIsNewline && (nextPlain || nextEmbed || !next)) return true;
  if (nextPlain) return true;
  return false;
}

export function isFillerEmptyParagraphNewlineOp(
  op: Op,
  _prevOp?: Op,
  _nextOp?: Op,
  ops?: readonly Op[],
  index?: number,
): boolean {
  if (!isTextInsert(op) || op.insert !== '\n') return false;
  if (isTableCellNewlineOp(op)) return false;
  if (ops != null && index != null) {
    // Baked line-spacing/margins make a real paragraph terminator look like a
    // Busuu spacer. Never collapse that `\n` — doing so glues the next block
    // (heading Copy RT: para + blank + H3 → one H3 line).
    if (newlineFollowsLineContent(ops, index)) return false;
    if (isPlainEmptyNewlineInRun(op, ops, index)) return true;
    if (isPresentationOnlyNewlineOp(op)) {
      const next = ops[index + 1];
      const prev = index > 0 ? ops[index - 1] : undefined;
      if (next && isBlockEmbedOp(next)) return true;
      if (prev && isTableCellNewlineOp(prev)) return true;
      return presentationOnlyNewlineRunLength(ops, index) >= 2;
    }
  }
  return false;
}

/** Busuu single spacer between paragraphs → one plain `\n` (drop presentation attrs). */
function asPlainParagraphBreakIfNeeded(op: Op, prevOp?: Op, nextOp?: Op): Op {
  if (
    isTextInsert(op) &&
    op.insert === '\n' &&
    isPresentationOnlyFillerAttrs(op.attributes ?? {}) &&
    shouldInsertPlainParagraphBreakBetween(prevOp, nextOp)
  ) {
    return { insert: '\n' };
  }
  return op;
}

function trailingNewlineInTextOpIsStructural(op: Op): boolean {
  if (!isTextInsert(op) || !op.insert.endsWith('\n')) return false;
  const lastIdx = op.insert.length - 1;
  return Object.keys(blockAttrsAtNewlineInOp(op, lastIdx)).length > 0;
}

/** Remove a redundant trailing `\n` on the last text op (htmlToDelta / paste tail). */
export function stripTrailingNewlineFromOps(ops: readonly Op[]): Op[] {
  const out = [...ops];
  const last = out[out.length - 1];
  if (!last || !isTextInsert(last) || !last.insert.endsWith('\n')) return out;
  if (last.insert === '\n' && last.attributes?.['table-row'] != null) return out;
  if (trailingNewlineInTextOpIsStructural(last)) return out;
  const trimmed = last.insert.slice(0, -1);
  if (trimmed) {
    out[out.length - 1] = last.attributes
      ? { insert: trimmed, attributes: { ...last.attributes } }
      : { insert: trimmed };
  } else {
    out.pop();
  }
  return out;
}

/** Collapse consecutive Busuu-style empty `\n` ops in a flat op list. */
export function collapseFillerParagraphNewlinesInOps(ops: readonly Op[]): Op[] {
  const out: Op[] = [];
  let i = 0;
  while (i < ops.length) {
    const op = ops[i]!;
    const prev = i > 0 ? ops[i - 1] : out[out.length - 1];
    const next = ops[i + 1];
    if (!isFillerEmptyParagraphNewlineOp(op, prev, next, ops, i)) {
      out.push(asPlainParagraphBreakIfNeeded(op, prev, next));
      i++;
      continue;
    }
    let j = i;
    while (j < ops.length) {
      const prevJ = j > i ? ops[j - 1] : out[out.length - 1];
      if (!isFillerEmptyParagraphNewlineOp(ops[j]!, prevJ, ops[j + 1], ops, j)) break;
      j++;
    }
    const prevBeforeRun = i > 0 ? ops[i - 1] : out[out.length - 1];
    const nextAfterRun = j < ops.length ? ops[j] : undefined;
    if (shouldInsertPlainParagraphBreakBetween(prevBeforeRun, nextAfterRun)) {
      out.push({ insert: '\n' });
    } else if (prevBeforeRun != null && isContainerBlockEmbedOp(prevBeforeRun)) {
      // Safety net: if the owned terminator after `{block}` was swept into the
      // filler run, restore exactly one `\n` so DomBridge cost stays aligned.
      out.push({ insert: '\n' });
    } else if (
      nextAfterRun != null &&
      isBlockEmbedOp(nextAfterRun) &&
      prevBeforeRun != null &&
      isTextInsert(prevBeforeRun) &&
      prevBeforeRun.insert !== '\n' &&
      !prevBeforeRun.insert.endsWith('\n')
    ) {
      // A block embed (divider / block image|video pasted with surrounding
      // blank lines) must start its own line. The filler-collapse above strips
      // the run of `\n`s between the preceding paragraph text and the embed —
      // including that paragraph's own terminator — because the re-insertion
      // heuristic only fires for text→text runs. Without a paragraph break the
      // embed glues onto the text (`para{divider}`), leaving the Delta one `\n`
      // short of the rendered DOM (`<p>para</p><hr>`) and drifting the caret
      // for everything below the embed. Keep exactly one paragraph break.
      out.push({ insert: '\n' });
    }
    i = j;
  }
  return out;
}

function opCharLength(op: Op): number {
  if (isTextInsert(op)) return op.insert.length;
  if (isInsert(op)) return 1;
  return 0;
}

/**
 * Collect ops whose char spans lie fully inside `[start, endExclusive)`.
 * Returns `null` when a range boundary cuts through a text op (use slice fallback).
 */
function collectOpsInCharRange(
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

/** Collapse filler paragraphs inside `[start, endExclusive)` and return a new Delta. */
export function collapseFillerParagraphsInDeltaRange(
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
    const collapsed = collapseFillerParagraphNewlinesInOps(mid.ops);
    return before.concat(new Delta(collapsed)).concat(after);
  }

  const collapsed = collapseFillerParagraphNewlinesInOps(collected.midOps);
  return new Delta(collected.beforeOps)
    .concat(new Delta(collapsed))
    .concat(new Delta(collected.afterOps));
}
