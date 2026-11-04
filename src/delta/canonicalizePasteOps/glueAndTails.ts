import { isTextInsert, type Op } from '@scrider/delta';
import type { AttributeMap } from '@scrider/delta';

import { blockAttrsAtNewlineInOp } from '../newlineBlockAttributes';

/** Busuu HTML sometimes glues `</p><p>` into `?Use` inside one text op. */
export function splitGluedParagraphBoundariesInTextOps(ops: readonly Op[]): Op[] {
  // A lowercase letter after punctuation is commonly an abbreviation
  // (`i.i.d.`, `e.g.`), not a lost paragraph boundary. The known malformed
  // HTML case starts the glued paragraph with an uppercase letter (`?Use`).
  const GLUED = /([.!?])([A-Z])/g;
  const result: Op[] = [];
  for (const op of ops) {
    if (!isTextInsert(op) || typeof op.insert !== 'string' || !/[.!?][A-Z]/.test(op.insert)) {
      result.push(op);
      continue;
    }
    const replaced = op.insert.replace(GLUED, '$1\n$2');
    result.push(
      op.attributes ? { insert: replaced, attributes: { ...op.attributes } } : { insert: replaced },
    );
  }
  return result;
}

/**
 * Text op ending with `\n` immediately before a standalone `\n` op is invalid after
 * htmlToDelta: the paragraph terminator must be exactly one standalone `\n` op.
 */
export function dedupeEmbeddedNewlineBeforeStandaloneNewline(ops: Op[]): Op[] {
  const out: Op[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    const next = ops[i + 1];
    if (
      isTextInsert(op) &&
      op.insert !== '\n' &&
      op.insert.endsWith('\n') &&
      next &&
      isTextInsert(next) &&
      next.insert === '\n'
    ) {
      const block = blockAttrsAtNewlineInOp(op, op.insert.length - 1);
      const trimmed = op.insert.slice(0, -1);
      if (trimmed) {
        out.push(
          op.attributes
            ? { insert: trimmed, attributes: { ...op.attributes } }
            : { insert: trimmed },
        );
      }
      const merged: AttributeMap = { ...(next.attributes ?? {}), ...block };
      out.push(
        Object.keys(merged).length > 0 ? { insert: '\n', attributes: merged } : { insert: '\n' },
      );
      i++;
      continue;
    }
    out.push(op);
  }
  return out;
}

/** Remove redundant htmlToDelta tail: 2+ consecutive attribute-less `\n` at EOF only. */
export function stripRedundantPlainNewlineTail(ops: Op[]): Op[] {
  const out = [...ops];
  while (out.length >= 2) {
    const last = out[out.length - 1]!;
    const prev = out[out.length - 2]!;
    if (
      isTextInsert(last) &&
      last.insert === '\n' &&
      (!last.attributes || Object.keys(last.attributes).length === 0) &&
      isTextInsert(prev) &&
      prev.insert === '\n' &&
      (!prev.attributes || Object.keys(prev.attributes).length === 0)
    ) {
      out.pop();
      continue;
    }
    break;
  }
  return out;
}

/**
 * htmlToDelta turns `<p>inline</p>` into `text\\n` — after canonicalize that is
 * `text` + standalone plain `\\n`. For a one-line inline paste, drop the tail.
 */
export function stripSinglePlainParagraphTailWhenInlineOnly(ops: Op[]): Op[] {
  if (ops.length !== 2) return ops;
  const [first, last] = ops;
  if (
    first &&
    isTextInsert(first) &&
    !first.insert.includes('\n') &&
    last &&
    isTextInsert(last) &&
    last.insert === '\n' &&
    (!last.attributes || Object.keys(last.attributes).length === 0)
  ) {
    return [first];
  }
  return ops;
}
