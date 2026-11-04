import { describe, expect, it } from 'vitest';
import type { Op } from '@scrider/delta';
import { Delta, isTextInsert } from '@scrider/delta';
import { deltaToHtml } from '@scrider/formatter';

import {
  normalizePastedSimpleTableCellOps,
  pastedOpsNeedSimpleTableCellNormalization,
} from '../../src/delta/normalizeSimpleTablePaste';

describe('normalizePastedSimpleTableCellOps', () => {
  it('collapses Busuu-style duplicate cell newlines after split', () => {
    const busuuLike: Op[] = [
      { insert: 'My grandfather ' },
      { insert: 'sold', attributes: { bold: true } },
      { insert: ' this house in 1995.' },
      { insert: '\n', attributes: { 'table-row': 0, 'table-col': 0 } },
      { insert: '\n', attributes: { 'table-row': 0, 'table-col': 0 } },
      { insert: '\n', attributes: { 'table-row': 0, 'table-col': 0 } },
      { insert: 'Active voice:', attributes: { bold: true } },
      { insert: ' the important information is "who sold the house".' },
      { insert: '\n', attributes: { 'table-row': 0, 'table-col': 1 } },
      { insert: '\n', attributes: { 'table-row': 0, 'table-col': 1 } },
      { insert: 'The house ' },
      { insert: 'was sold', attributes: { bold: true } },
      { insert: ' in 1995.' },
      { insert: '\n', attributes: { 'table-row': 1, 'table-col': 0 } },
      { insert: '\n', attributes: { 'table-row': 1, 'table-col': 0 } },
      { insert: 'Passive voice:', attributes: { bold: true } },
      { insert: ' the important information is "what happened to the house".' },
      { insert: '\n', attributes: { 'table-row': 1, 'table-col': 1 } },
    ];

    expect(pastedOpsNeedSimpleTableCellNormalization(busuuLike)).toBe(true);
    const normalized = normalizePastedSimpleTableCellOps(busuuLike);
    expect(
      normalized.filter(
        (o) => isTextInsert(o) && o.insert === '\n' && o.attributes && 'table-row' in o.attributes,
      ),
    ).toHaveLength(4);

    const html = deltaToHtml(new Delta(normalized));
    expect(html).toContain('My grandfather');
    expect(html).toContain('Active voice');
    expect(html).toContain('was sold');
    expect(html).toContain('Passive voice');
  });
});
