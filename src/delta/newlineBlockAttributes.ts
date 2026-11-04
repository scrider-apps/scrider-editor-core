import { Delta, isInsert, isTextInsert } from '@scrider/delta';
import type { AttributeMap, Op } from '@scrider/delta';

/** Per-paragraph first-line indent (Word paste / toolbar). */
export const SCRIDER_TEXT_INDENT_KEY = 'scrider-text-indent';
/**
 * First marker of an ordered run (`2.` stays 2, the next item is 3).
 * Absent means the level starts at 1. Not inherited by Enter — only the
 * opening item carries it.
 */
export const LIST_START_KEY = 'list-start';
export const DEFAULT_SCRIDER_TEXT_INDENT = '1.25cm';

/**
 * Block-level keys stored on `\n` ops — the single source consumed by
 * `commands/structure.ts` and `queries/formats.ts` (broader than `BLOCK_FORMATS`
 * because it also includes table/embed markers).
 */
export const NEWLINE_BLOCK_ATTR_KEYS: ReadonlySet<string> = new Set([
  'header',
  'header-id',
  'list',
  LIST_START_KEY,
  'blockquote',
  'code-block',
  'code-block-id',
  'code-block-width',
  'code-block-float',
  'code-block-height',
  'align',
  'indent',
  'table-row',
  'table-col',
  'table-header',
  'table-col-align',
  '__divider',
  '__blockEmbed',
  SCRIDER_TEXT_INDENT_KEY,
  'scrider-line-height',
  'scrider-margin-after',
  'scrider-margin-before',
  'accordion',
  'accordion-collapsed',
  'accordion-body',
  'accordion-width',
  'accordion-float',
  'quiz-id',
  'quiz-role',
  'quiz-view',
  'dialog-id',
  'dialog-role',
  'dialog-view',
  'voice-id',
  'voice-role',
  'voice-view',
]);

export function isNewlineBlockAttrKey(key: string): boolean {
  return NEWLINE_BLOCK_ATTR_KEYS.has(key);
}

export function blockAttrsOnly(attrs: AttributeMap | undefined): AttributeMap {
  if (!attrs) return {};
  const result: AttributeMap = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (isNewlineBlockAttrKey(k) && v != null) result[k] = v;
  }
  return result;
}

export function inlineAttrsOnly(attrs: AttributeMap | undefined): AttributeMap {
  if (!attrs) return {};
  const result: AttributeMap = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (!isNewlineBlockAttrKey(k)) result[k] = v;
  }
  return Object.keys(result).length > 0 ? result : {};
}

/**
 * Block attrs on `\n` within a text op.
 *
 * - Op is only `\n` characters → each `\n` is its own paragraph boundary (Word paste).
 * - `\n` at index 0 → ends the paragraph in the **previous** text op (htmlToDelta split).
 * - `text…\n` in one op → attrs on the **last** `\n` only (Quill-style).
 */
export function blockAttrsAtNewlineInOp(
  op: { insert: string; attributes?: AttributeMap },
  newlineCharIndex: number,
): AttributeMap {
  if (op.insert[newlineCharIndex] !== '\n') return {};

  const block = blockAttrsOnly(op.attributes);
  if (Object.keys(block).length === 0) return {};

  if (newlineCharIndex === 0 || /^\n+$/.test(op.insert)) {
    return block;
  }

  for (let j = newlineCharIndex + 1; j < op.insert.length; j++) {
    if (op.insert[j] === '\n') return {};
  }

  return block;
}

/**
 * Block attrs on the `\n` that terminates the line at `newlineIndex` (a Delta
 * character index). Returns `{}` when that index is not a `\n`.
 *
 * Index-based wrapper over {@link blockAttrsAtNewlineInOp} — the single source
 * for the copy that previously lived in each Settings command.
 */
export function blockAttrsAtDeltaIndex(delta: Delta, newlineIndex: number): AttributeMap {
  let pos = 0;
  for (const op of delta.ops) {
    if (!isTextInsert(op)) {
      pos += isInsert(op) ? 1 : 0;
      continue;
    }
    for (let i = 0; i < op.insert.length; i++) {
      if (op.insert[i] === '\n' && pos + i === newlineIndex) {
        return blockAttrsAtNewlineInOp(op, i);
      }
    }
    pos += op.insert.length;
  }
  return {};
}

function mergeAttrPatch(base: AttributeMap, patch: AttributeMap): AttributeMap {
  const result = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete result[k];
    else result[k] = v;
  }
  return result;
}

/**
 * Apply attribute patches at specific `\n` indices by splitting text ops.
 * Avoids `compose().retain(1, attrs)` corrupting mid-string newlines.
 */
export function applyAttributePatchesAtNewlines(
  delta: Delta,
  patches: ReadonlyMap<number, AttributeMap>,
): Delta {
  if (patches.size === 0) return delta;

  const out: Op[] = [];
  let pos = 0;

  for (const op of delta.ops) {
    if (!isTextInsert(op)) {
      out.push(op);
      pos += isInsert(op) ? 1 : 0;
      continue;
    }

    let chunkStart = 0;
    for (let i = 0; i < op.insert.length; i++) {
      if (op.insert[i] !== '\n') continue;

      const nlIndex = pos + i;
      const textBefore = op.insert.slice(chunkStart, i);
      if (textBefore.length > 0) {
        const inline = inlineAttrsOnly(op.attributes);
        out.push(
          Object.keys(inline).length > 0
            ? { insert: textBefore, attributes: inline }
            : { insert: textBefore },
        );
      }

      let nlBlock = blockAttrsAtNewlineInOp(op, i);
      const patch = patches.get(nlIndex);
      if (patch) {
        nlBlock = mergeAttrPatch(nlBlock, patch);
      }

      const cleaned = blockAttrsOnly(nlBlock);
      out.push(
        Object.keys(cleaned).length > 0 ? { insert: '\n', attributes: cleaned } : { insert: '\n' },
      );

      chunkStart = i + 1;
    }

    const tail = op.insert.slice(chunkStart);
    if (tail.length > 0) {
      const inline = inlineAttrsOnly(op.attributes);
      out.push(
        Object.keys(inline).length > 0 ? { insert: tail, attributes: inline } : { insert: tail },
      );
    }

    pos += op.insert.length;
  }

  return new Delta(out);
}
