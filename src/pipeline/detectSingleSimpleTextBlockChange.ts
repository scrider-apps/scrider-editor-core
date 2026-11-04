// Pure detector for single-block text edits.
//
// Used by `runControlledPipeline` to emit `normalizeHint: singleBlock`, and by
// the React wrapper as a fallback when no hint was supplied.

import { opLength, type Op } from '@scrider/delta';

import { splitTextOpsAtNewlines } from '../delta/splitTextOpsAtNewlines';

/**
 * Block-structural keys that disqualify the fast path.
 * `list` is intentionally **absent**: a list item is still one block
 * element (`<li>`) whose text can be morphed in place. Nested list indent
 * (`indent`) stays structural.
 */
const NON_SIMPLE_BLOCK_KEYS: ReadonlySet<string> = new Set([
  'blockquote',
  'code-block',
  'code-block-id',
  'code-block-width',
  'code-block-float',
  'code-block-height',
  'table-row',
  'table-col',
  'table-header',
  'table-col-align',
  'indent',
  '__divider',
  '__blockEmbed',
  // Rendered with its neighbours (level, hidden scope) — never alone.
  'accordion',
  'accordion-body',
]);

const UNSAFE_INLINE_EMBED_KEYS: ReadonlySet<string> = new Set([
  'video',
  'iframe',
  'drawio',
  'diagram',
]);

export interface SingleTextBlockChange {
  readonly blockIndex: number;
  readonly startDeltaIndex: number;
  readonly newBlockOps: Op[];
}

function insertString(op: Op): string | null {
  const ins = (op as { insert?: unknown }).insert;
  return typeof ins === 'string' ? ins : null;
}

function toBlocks(ops: readonly Op[]): Op[][] {
  const split = splitTextOpsAtNewlines(ops);
  const blocks: Op[][] = [];
  let cur: Op[] = [];
  for (const op of split) {
    cur.push(op);
    if (insertString(op) === '\n') {
      blocks.push(cur);
      cur = [];
    }
  }
  if (cur.length > 0) blocks.push(cur);
  return blocks;
}

function terminator(block: Op[]): Op | null {
  const last = block[block.length - 1];
  if (!last) return null;
  return insertString(last) === '\n' ? last : null;
}

function embedKind(op: Op): string | null {
  const ins = (op as { insert?: unknown }).insert;
  if (ins && typeof ins === 'object') return Object.keys(ins)[0] ?? '';
  return null;
}

function isFastPathBlock(block: Op[]): boolean {
  const term = terminator(block);
  if (!term) return false;

  for (const op of block) {
    const kind = embedKind(op);
    if (kind !== null && UNSAFE_INLINE_EMBED_KEYS.has(kind)) {
      return false;
    }
  }

  const attrs = (term as { attributes?: Record<string, unknown> }).attributes;
  if (attrs) {
    for (const key of Object.keys(attrs)) {
      if (NON_SIMPLE_BLOCK_KEYS.has(key)) return false;
    }
  }
  return true;
}

function embedSignature(block: Op[]): string {
  const embeds: Op[] = [];
  for (const op of block) {
    if (insertString(op) === null) embeds.push(op);
  }
  return JSON.stringify(embeds);
}

/**
 * Detect an edit that changed the text of exactly ONE simple paragraph /
 * heading / list-item block. Returns info for a scoped morph, or `null`.
 */
export function detectSingleSimpleTextBlockChange(
  oldOps: readonly Op[],
  newOps: readonly Op[],
): SingleTextBlockChange | null {
  const oldBlocks = toBlocks(oldOps);
  const newBlocks = toBlocks(newOps);

  if (oldBlocks.length !== newBlocks.length) return null;

  let changed = -1;
  for (let i = 0; i < oldBlocks.length; i++) {
    if (JSON.stringify(oldBlocks[i]) !== JSON.stringify(newBlocks[i])) {
      if (changed !== -1) return null;
      changed = i;
    }
  }
  if (changed === -1) return null;

  const oldBlock = oldBlocks[changed]!;
  const newBlock = newBlocks[changed]!;
  if (!isFastPathBlock(oldBlock)) return null;
  if (!isFastPathBlock(newBlock)) return null;

  if (JSON.stringify(terminator(oldBlock)) !== JSON.stringify(terminator(newBlock))) {
    return null;
  }

  if (embedSignature(oldBlock) !== embedSignature(newBlock)) return null;

  let startDeltaIndex = 0;
  for (let i = 0; i < changed; i++) {
    for (const op of newBlocks[i]!) startDeltaIndex += opLength(op);
  }

  return { blockIndex: changed, startDeltaIndex, newBlockOps: newBlock };
}
