import { Delta, isInsert, isTextInsert } from '@scrider/delta';
import type { AttributeMap } from '@scrider/delta';

import { blockAttrsAtNewlineInOp } from '../delta/newlineBlockAttributes';

/** Block width in CSS px, stored on every `\n` of the fence. */
export const CODE_BLOCK_WIDTH_KEY = 'code-block-width';
/** `left` / `center` / `right`, stored on every `\n` of the fence. */
export const CODE_BLOCK_FLOAT_KEY = 'code-block-float';
/** Block height in CSS px. Only the diagram view honours it; source view keeps its natural height. */
export const CODE_BLOCK_HEIGHT_KEY = 'code-block-height';

export const CODE_BLOCK_MIN_WIDTH_PX = 120;
export const CODE_BLOCK_MIN_HEIGHT_PX = 120;

export type CodeBlockFloat = 'left' | 'center' | 'right';

export interface CodeBlockBox {
  width: number | null;
  float: CodeBlockFloat | null;
  height: number | null;
}

export interface CodeBlockFence {
  /** Index of the first character of the fence. */
  start: number;
  /** Indices of every `\n` that belongs to the fence. */
  newlines: number[];
  box: CodeBlockBox;
}

export interface CodeBlockBoxPatch {
  width?: number | null;
  float?: CodeBlockFloat | null;
  height?: number | null;
}

function parsePx(raw: unknown, min: number): number | null {
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseFloat(raw) : NaN;
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.max(min, Math.round(value));
}

function parseWidth(raw: unknown): number | null {
  return parsePx(raw, CODE_BLOCK_MIN_WIDTH_PX);
}

function parseHeight(raw: unknown): number | null {
  return parsePx(raw, CODE_BLOCK_MIN_HEIGHT_PX);
}

function parseFloatValue(raw: unknown): CodeBlockFloat | null {
  return raw === 'left' || raw === 'center' || raw === 'right' ? raw : null;
}

function sameFence(a: AttributeMap, b: AttributeMap): boolean {
  if (b['code-block'] == null || b['code-block'] === false) return false;
  const idA = a['code-block-id'];
  const idB = b['code-block-id'];
  if (typeof idA === 'string' || typeof idB === 'string') return idA === idB;
  return a['code-block'] === b['code-block'];
}

/**
 * Code-block fences in document order. One fence = same `code-block-id`, or a
 * contiguous run of the same language when the lines carry no id.
 * The box comes from the first line that has a value, so a line added by an
 * older path without the keys does not reset the fence.
 */
export function listCodeBlockFences(delta: Delta): CodeBlockFence[] {
  const fences: CodeBlockFence[] = [];
  let current: (CodeBlockFence & { attrs: AttributeMap }) | null = null;
  let pos = 0;
  let lineStart = 0;

  const close = (): void => {
    if (!current) return;
    const { attrs: _attrs, ...fence } = current;
    fences.push(fence);
    current = null;
  };

  for (const op of delta.ops) {
    if (isTextInsert(op)) {
      for (let i = 0; i < op.insert.length; i++) {
        if (op.insert[i] !== '\n') continue;
        const index = pos + i;
        const attrs = blockAttrsAtNewlineInOp(op, i);
        if (attrs['code-block'] == null || attrs['code-block'] === false) {
          close();
        } else {
          if (current && !sameFence(current.attrs, attrs)) close();
          if (!current) {
            current = {
              start: lineStart,
              newlines: [],
              box: { width: null, float: null, height: null },
              attrs,
            };
          }
          current.newlines.push(index);
          current.box.width ??= parseWidth(attrs[CODE_BLOCK_WIDTH_KEY]);
          current.box.float ??= parseFloatValue(attrs[CODE_BLOCK_FLOAT_KEY]);
          current.box.height ??= parseHeight(attrs[CODE_BLOCK_HEIGHT_KEY]);
        }
        lineStart = index + 1;
      }
      pos += op.insert.length;
    } else if (isInsert(op)) {
      close();
      pos += 1;
      lineStart = pos;
    }
  }
  close();
  return fences;
}

/** Fence whose lines contain `index` (first char through its last `\n`). */
export function findCodeBlockFenceAt(delta: Delta, index: number): CodeBlockFence | null {
  for (const fence of listCodeBlockFences(delta)) {
    const end = fence.newlines[fence.newlines.length - 1]!;
    if (index >= fence.start && index <= end) return fence;
  }
  return null;
}

/**
 * Controlled change that writes the box onto every `\n` of the fence at
 * `index`. `null` removes the key. Returns `null` when nothing changes.
 */
export function buildCodeBlockBoxChange(
  delta: Delta,
  index: number,
  patch: CodeBlockBoxPatch,
): Delta | null {
  const fence = findCodeBlockFenceAt(delta, index);
  if (!fence) return null;

  const attrs: AttributeMap = {};
  if (patch.width !== undefined) {
    const width = patch.width == null ? null : parseWidth(patch.width);
    if (width !== fence.box.width)
      attrs[CODE_BLOCK_WIDTH_KEY] = width == null ? null : String(width);
  }
  if (patch.float !== undefined && patch.float !== fence.box.float) {
    attrs[CODE_BLOCK_FLOAT_KEY] = patch.float;
  }
  if (patch.height !== undefined) {
    const height = patch.height == null ? null : parseHeight(patch.height);
    if (height !== fence.box.height) {
      attrs[CODE_BLOCK_HEIGHT_KEY] = height == null ? null : String(height);
    }
  }
  if (Object.keys(attrs).length === 0) return null;

  let change = new Delta();
  let cursor = 0;
  for (const newline of fence.newlines) {
    change = change.retain(newline - cursor).retain(1, attrs);
    cursor = newline + 1;
  }
  return change;
}
