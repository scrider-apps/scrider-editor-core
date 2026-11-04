import { isTextInsert, type Op } from '@scrider/delta';

function tableCellKey(attrs: Record<string, unknown> | undefined): string | null {
  if (!attrs || attrs['table-row'] == null || attrs['table-col'] == null) return null;
  return `${attrs['table-row'] as number}:${attrs['table-col'] as number}`;
}

function isTableCellNewlineOp(op: Op): boolean {
  return (
    isTextInsert(op) &&
    op.insert === '\n' &&
    op.attributes !== undefined &&
    'table-row' in op.attributes
  );
}

export function deltaHasSimpleTableOps(ops: readonly Op[]): boolean {
  return ops.some((op) => isTableCellNewlineOp(op));
}

/** True when two consecutive `\n` ops share the same table cell coords. */
export function pastedOpsNeedSimpleTableCellNormalization(ops: readonly Op[]): boolean {
  for (let i = 0; i + 1 < ops.length; i++) {
    const a = ops[i];
    const b = ops[i + 1];
    if (!a || !b || !isTableCellNewlineOp(a) || !isTableCellNewlineOp(b)) continue;
    const ka = tableCellKey(isTextInsert(a) ? a.attributes : undefined);
    const kb = tableCellKey(isTextInsert(b) ? b.attributes : undefined);
    if (ka && ka === kb) return true;
  }
  return false;
}

/**
 * Collapse duplicate per-cell `\n` terminators (Busuu / rich HTML paste).
 * Run after `splitTextOpsAtNewlines` so each cell ends with one `\n` op.
 */
export function normalizePastedSimpleTableCellOps(ops: readonly Op[]): Op[] {
  if (!pastedOpsNeedSimpleTableCellNormalization(ops)) return [...ops];

  const firstTableIdx = ops.findIndex((o) => isTableCellNewlineOp(o));
  if (firstTableIdx < 0) return [...ops];

  let lastTableIdx = -1;
  for (let i = ops.length - 1; i >= 0; i--) {
    if (isTableCellNewlineOp(ops[i]!)) {
      lastTableIdx = i;
      break;
    }
  }
  if (lastTableIdx < 0) return [...ops];

  const result: Op[] = [...ops.slice(0, firstTableIdx)];
  const pendingCell: Op[] = [];
  let i = firstTableIdx;

  while (i <= lastTableIdx) {
    const op = ops[i]!;

    if (isTextInsert(op) && op.insert !== '\n') {
      pendingCell.push(op);
      i++;
      continue;
    }

    if (isTableCellNewlineOp(op)) {
      const key = tableCellKey(isTextInsert(op) ? op.attributes : undefined)!;
      let last = op;
      i++;
      while (i <= lastTableIdx) {
        const next = ops[i]!;
        if (!isTableCellNewlineOp(next)) break;
        if (tableCellKey(isTextInsert(next) ? next.attributes : undefined) !== key) break;
        last = next;
        i++;
      }
      result.push(...pendingCell);
      pendingCell.length = 0;
      result.push(last);
      continue;
    }

    pendingCell.push(op);
    i++;
  }

  result.push(...ops.slice(lastTableIdx + 1));
  return result;
}
