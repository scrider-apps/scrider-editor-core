import { isTextInsert, type InsertOp, type Op } from '@scrider/delta';

/** Decorative list glyphs LMS/a11y clones put inside `<li>` (Rise `visually-hidden`). */
const LIST_MARKER_ONLY_RE = /^[\s\u00a0]*[•·◦▪▫●○\u2022\u25CF\u25E6\u25AA\uF0B7]+[\s\u00a0]*$/;
const LIST_MARKER_PREFIX_RE = /^[\s\u00a0]*[•·◦▪▫●○\u2022\u25CF\u25E6\u25AA\uF0B7]+[\s\u00a0]*/;

function isStandaloneNewline(op: Op): op is InsertOp & { insert: '\n' } {
  return isTextInsert(op) && op.insert === '\n';
}

function listSignature(op: Op): string | null {
  if (!isStandaloneNewline(op) || op.attributes?.list == null) return null;
  const indent = op.attributes.indent ?? 0;
  return `${JSON.stringify(op.attributes.list)}:${JSON.stringify(indent)}`;
}

/**
 * Drop consecutive empty list items (Rise/Articulate nested `<div>` inside `<li>`
 * → htmlToDelta emits `\n\n\n\n` with `list`). Keeps the terminator of the
 * preceding content item.
 *
 * Must run after {@link splitTextOpsAtNewlines}.
 */
export function collapseEmptyListItemNewlines(ops: readonly Op[]): Op[] {
  const out: Op[] = [];
  for (const op of ops) {
    const sig = listSignature(op);
    if (sig == null) {
      out.push(op);
      continue;
    }
    const prev = out[out.length - 1];
    if (prev && listSignature(prev) === sig) continue;
    out.push(op);
  }
  return out;
}

/**
 * Strip a leading `•` / similar glyph on a list item (hidden a11y clone of the
 * custom bullet). Only the first text op of a list line is touched.
 */
export function stripDecorativeListMarkerOps(ops: readonly Op[]): Op[] {
  const drop = new Set<number>();
  const rewrite = new Map<number, Op>();

  let lineStart = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    if (!isStandaloneNewline(op)) continue;
    if (op.attributes?.list != null) {
      for (let j = lineStart; j < i; j++) {
        const textOp = ops[j]!;
        if (!isTextInsert(textOp)) continue;
        if (LIST_MARKER_ONLY_RE.test(textOp.insert)) {
          drop.add(j);
          break;
        }
        const stripped = textOp.insert.replace(LIST_MARKER_PREFIX_RE, '');
        if (stripped !== textOp.insert) {
          if (stripped) {
            rewrite.set(
              j,
              textOp.attributes
                ? { insert: stripped, attributes: textOp.attributes }
                : { insert: stripped },
            );
          } else {
            drop.add(j);
          }
        }
        break;
      }
    }
    lineStart = i + 1;
  }

  if (drop.size === 0 && rewrite.size === 0) return ops as Op[];

  const out: Op[] = [];
  for (let i = 0; i < ops.length; i++) {
    if (drop.has(i)) continue;
    out.push(rewrite.get(i) ?? ops[i]!);
  }
  return out;
}
