import { isTextInsert, type Op } from '@scrider/delta';
import type { AttributeMap } from '@scrider/delta';

import { blockAttrsOnly, inlineAttrsOnly } from './newlineBlockAttributes';

function pushTextChunk(out: Op[], text: string, inline: AttributeMap): void {
  if (text.length === 0) return;
  out.push(
    Object.keys(inline).length > 0 ? { insert: text, attributes: inline } : { insert: text },
  );
}

function pushNewlineChunk(out: Op[], inline: AttributeMap, block: AttributeMap): void {
  const attrs = { ...inline, ...block };
  out.push(Object.keys(attrs).length > 0 ? { insert: '\n', attributes: attrs } : { insert: '\n' });
}

/**
 * Split text ops that contain `\n` into `{ insert: "line" }, { insert: "\n" }, …`.
 * Block attrs on the source op are copied onto each `\n`; inline attrs stay on text chunks
 * and are also kept on `\n` ops (Quill-style).
 *
 * Idempotent on already-split ops. Preserves total document length.
 */
export function splitTextOpsAtNewlines(ops: readonly Op[]): Op[] {
  const result: Op[] = [];

  for (const op of ops) {
    if (!isTextInsert(op) || !op.insert.includes('\n') || op.insert.length <= 1) {
      result.push(op);
      continue;
    }

    const text = op.insert;
    const inline = inlineAttrsOnly(op.attributes);
    const block = blockAttrsOnly(op.attributes);
    let start = 0;

    for (let i = 0; i < text.length; i++) {
      if (text[i] !== '\n') continue;
      pushTextChunk(result, text.slice(start, i), inline);
      pushNewlineChunk(result, inline, block);
      start = i + 1;
    }
    pushTextChunk(result, text.slice(start), inline);
  }

  return result;
}
