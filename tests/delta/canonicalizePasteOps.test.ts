import { describe, expect, it } from 'vitest';
import type { InsertOp } from '@scrider/delta';
import { Delta, isInsert, isTextInsert } from '@scrider/delta';

import {
  adjustPasteInsertIndex,
  adjustTextInsertIndex,
  dividerLineToDeleteBackward,
  skipDividerLineOnArrow,
  canonicalizePasteOps,
  ensureSeparatorLineAfterPastedTable,
  pasteCaretIndexInRange,
  stripGapBetweenTableAndBlockEmbed,
} from '../../src/delta/canonicalizePasteOps';

describe('canonicalizePasteOps', () => {
  it('does not merge standalone table-cell newline with following spacer newline', () => {
    const raw = [
      { insert: 'Cell' },
      { insert: '\n', attributes: { 'table-row': 0, 'table-col': 1 } },
      {
        insert: '\n',
        attributes: {
          align: 'center',
          'scrider-line-height': '1.5',
          'scrider-margin-after': '0.5em',
        },
      },
      { insert: { divider: true } },
    ];
    const prepared = canonicalizePasteOps(raw);
    const tableNl = prepared.find(
      (op): op is InsertOp =>
        isTextInsert(op) && op.insert === '\n' && op.attributes?.['table-row'] != null,
    );
    expect(tableNl?.attributes).toEqual({ 'table-row': 0, 'table-col': 1 });
  });

  it('removes presentation newline between table and divider', () => {
    const raw = [
      { insert: 'Cell' },
      { insert: '\n', attributes: { 'table-row': 0, 'table-col': 1 } },
      {
        insert: '\n',
        attributes: {
          align: 'center',
          'scrider-line-height': '1.5',
          'scrider-margin-after': '0.5em',
        },
      },
      { insert: { divider: true } },
      { insert: 'Below' },
      { insert: '\n' },
    ];
    const prepared = canonicalizePasteOps(raw);
    expect(prepared).toEqual([
      { insert: 'Cell' },
      { insert: '\n', attributes: { 'table-row': 0, 'table-col': 1 } },
      { insert: { divider: true } },
      { insert: 'Below' },
      { insert: '\n' },
    ]);
    const dividerIdx = prepared.findIndex(
      (op) =>
        isInsert(op) &&
        typeof op.insert === 'object' &&
        op.insert !== null &&
        'divider' in op.insert,
    );
    let lastTableIdx = -1;
    for (let i = 0; i < prepared.length; i++) {
      const op = prepared[i]!;
      if (isTextInsert(op) && op.insert === '\n' && op.attributes?.['table-row'] != null) {
        lastTableIdx = i;
      }
    }
    expect(dividerIdx).toBe(lastTableIdx + 1);
    const gapNewlines = prepared
      .slice(0, dividerIdx)
      .filter(
        (op) => isTextInsert(op) && op.insert === '\n' && op.attributes?.['table-row'] == null,
      );
    expect(gapNewlines).toHaveLength(0);
  });

  it('keeps one paragraph break before a divider glued only by filler blank lines', () => {
    // parsePastedMarkdown output for `para.\n\n---\n\n## H`: the paragraph's own
    // terminator + a blank spacer, both plain `\n`. The filler-collapse used to
    // strip BOTH of them (re-insertion only fired for text→text runs), gluing
    // the divider onto the paragraph (`para.{divider}`). That left the Delta one
    // `\n` short of the rendered DOM (`<p>para</p><hr>` + a browser filler
    // `<p></p>`), drifting the caret for every line below each divider.
    const raw = [
      { insert: 'Paragraph text.' },
      { insert: '\n' },
      { insert: '\n' },
      { insert: { divider: true } },
      { insert: '\n' },
      { insert: '\n' },
      { insert: 'Heading' },
      { insert: '\n', attributes: { header: 2 } },
    ];
    const prepared = canonicalizePasteOps(raw);
    expect(prepared).toEqual([
      { insert: 'Paragraph text.' },
      { insert: '\n' },
      { insert: { divider: true } },
      { insert: '\n' },
      { insert: 'Heading' },
      { insert: '\n', attributes: { header: 2 } },
    ]);
  });

  it('does not glue a divider onto the preceding paragraph (single blank line)', () => {
    const raw = [
      { insert: 'Some sentence.' },
      { insert: '\n' },
      { insert: { divider: true } },
      { insert: '\n' },
      { insert: 'After' },
      { insert: '\n' },
    ];
    const prepared = canonicalizePasteOps(raw);
    const dividerIdx = prepared.findIndex(
      (op) =>
        isInsert(op) &&
        typeof op.insert === 'object' &&
        op.insert !== null &&
        'divider' in op.insert,
    );
    const before = prepared[dividerIdx - 1]!;
    expect(isTextInsert(before) && before.insert === '\n').toBe(true);
  });

  it('collapses trailing page-chrome blanks after a table to a single empty paragraph', () => {
    // Busuu paste tail: last table cell, then nav-induced empty paragraphs, a
    // WebKit `<br>` (softBreak) and stray whitespace. Must reduce to exactly
    // one empty paragraph under the table (Refresh-view parity).
    const raw = [
      { insert: 'The flight ' },
      { insert: 'will be cancelled', attributes: { bold: true } },
      { insert: '.' },
      { insert: '\n', attributes: { 'table-row': 3, 'table-col': 1 } },
      { insert: '\n' },
      { insert: { softBreak: true } },
      { insert: ' ' },
      { insert: '\n' },
      { insert: '\n' },
    ];
    const prepared = canonicalizePasteOps(raw);

    // Nothing blank survives past the last cell except a single `\n`.
    const lastCellIdx = prepared.findIndex(
      (op) => isTextInsert(op) && op.insert === '\n' && op.attributes?.['table-row'] != null,
    );
    const tail = prepared.slice(lastCellIdx + 1);
    expect(tail).toEqual([{ insert: '\n' }]);
    expect(
      prepared.some(
        (op) => isInsert(op) && typeof op.insert === 'object' && 'softBreak' in op.insert,
      ),
    ).toBe(false);
  });

  it('keeps a mid-fragment soft break that is followed by content', () => {
    const raw = [
      { insert: 'Modal verbs:' },
      { insert: { softBreak: true } },
      { insert: 'will, would, can.' },
      { insert: '\n' },
    ];
    const prepared = canonicalizePasteOps(raw);
    expect(
      prepared.some(
        (op) => isInsert(op) && typeof op.insert === 'object' && 'softBreak' in op.insert,
      ),
    ).toBe(true);
  });

  it('stripGap peels presentation attrs merged onto last table-cell newline', () => {
    const merged = [
      { insert: 'Cell' },
      {
        insert: '\n',
        attributes: {
          'table-row': 0,
          'table-col': 1,
          align: 'center',
          'scrider-line-height': '1.5',
        },
      },
      { insert: { divider: true } },
    ];
    const stripped = stripGapBetweenTableAndBlockEmbed(merged);
    expect(stripped[1]).toEqual({
      insert: '\n',
      attributes: { 'table-row': 0, 'table-col': 1 },
    });
  });

  it('keeps owned newline after Extended table when collapsing blank lines before image', () => {
    // Rise/Articulate: htmlToDelta emits `{block}` + many `\n` + `{image}`.
    // Filler collapse must not glue image onto the block (DomBridge drift).
    const tableBlock = {
      block: {
        type: 'table',
        cells: { '0:0': { ops: [{ insert: 'A\n' }] } },
      },
    };
    const raw = [
      { insert: tableBlock },
      { insert: '\n\n\n\n\n' },
      { insert: { image: 'https://example.com/banner.png' } },
      { insert: '\n\n\n' },
    ];
    const prepared = canonicalizePasteOps(raw);
    expect(prepared[0]).toEqual({ insert: tableBlock });
    expect(prepared[1]).toEqual({ insert: '\n' });
    expect(prepared[2]).toEqual({ insert: { image: 'https://example.com/banner.png' } });
    expect(
      prepared.some(
        (op) => isInsert(op) && typeof op.insert === 'string' && op.insert.includes('\n'),
      ),
    ).toBe(true);
    // Never adjacent: block then image
    expect(
      prepared.findIndex(
        (op) =>
          isInsert(op) &&
          typeof op.insert === 'object' &&
          op.insert != null &&
          'image' in op.insert,
      ),
    ).toBeGreaterThan(1);
  });
});

describe('pasteCaretIndexInRange', () => {
  const tableBlock = {
    block: {
      type: 'table',
      cells: { '0:0': { ops: [{ insert: 'A\n' }] } },
    },
  };

  it('places caret on separator line under block-owned newline', () => {
    const delta = new Delta().insert(tableBlock).insert('\n').insert('\n');
    expect(pasteCaretIndexInRange(delta, 0, 2)).toBe(2);
  });

  it('places caret on separator line under divider-owned newline', () => {
    const delta = new Delta().insert({ divider: true }).insert('\n').insert('\n');
    expect(pasteCaretIndexInRange(delta, 0, 2)).toBe(2);
  });

  it('places caret on separator line under simple table grid', () => {
    const delta = new Delta()
      .insert('A')
      .insert('\n', { 'table-row': 0, 'table-col': 0 })
      .insert('B')
      .insert('\n', { 'table-row': 0, 'table-col': 1 })
      .insert('\n');
    expect(pasteCaretIndexInRange(delta, 0, 5)).toBe(4);
  });
});

describe('skipDividerLineOnArrow', () => {
  const helloDivider123 = (): Delta =>
    new Delta().insert('Hello\n').insert({ divider: true }).insert('\n123\n');

  it('ArrowUp from the line below a divider jumps to the line above', () => {
    const delta = helloDivider123();
    // "123" starts at index 8 (Hello\n = 6, embed+owned \n = 2)
    expect(skipDividerLineOnArrow(delta, 8, 'up')).toBe(0);
    expect(skipDividerLineOnArrow(delta, 9, 'up')).toBe(1);
  });

  it('ArrowDown from the line above a divider jumps to the line below', () => {
    const delta = helloDivider123();
    expect(skipDividerLineOnArrow(delta, 0, 'down')).toBe(8);
    expect(skipDividerLineOnArrow(delta, 1, 'down')).toBe(9);
  });

  it('ArrowUp from the divider line itself leaves the rule', () => {
    const delta = helloDivider123();
    expect(skipDividerLineOnArrow(delta, 6, 'up')).toBe(0);
    expect(skipDividerLineOnArrow(delta, 7, 'up')).toBe(0);
  });

  it('leaves unrelated arrows unchanged', () => {
    const delta = new Delta().insert('Hello\nWorld\n');
    expect(skipDividerLineOnArrow(delta, 8, 'up')).toBeNull();
    expect(skipDividerLineOnArrow(delta, 0, 'down')).toBeNull();
  });

  it('skips stacked dividers in one step', () => {
    const delta = new Delta()
      .insert('Hello\n')
      .insert({ divider: true })
      .insert('\n')
      .insert({ divider: true })
      .insert('\n123\n');
    expect(skipDividerLineOnArrow(delta, 10, 'up')).toBe(0);
    expect(skipDividerLineOnArrow(delta, 0, 'down')).toBe(10);
  });

  it('ArrowLeft from the start of the line below jumps to the end of the line above', () => {
    const delta = helloDivider123();
    expect(skipDividerLineOnArrow(delta, 8, 'left')).toBe(5);
    expect(skipDividerLineOnArrow(delta, 9, 'left')).toBeNull();
  });

  it('ArrowRight from the end of the line above jumps to the start of the line below', () => {
    const delta = helloDivider123();
    expect(skipDividerLineOnArrow(delta, 5, 'right')).toBe(8);
    expect(skipDividerLineOnArrow(delta, 4, 'right')).toBeNull();
  });

  it('horizontal arrows leave the divider line itself', () => {
    const delta = helloDivider123();
    expect(skipDividerLineOnArrow(delta, 6, 'left')).toBe(5);
    expect(skipDividerLineOnArrow(delta, 6, 'right')).toBe(8);
  });
});

describe('dividerLineToDeleteBackward', () => {
  it('consumes embed + owned newline from the line below', () => {
    const delta = new Delta().insert({ divider: true }).insert('\nHorizontal Rule\n');
    expect(dividerLineToDeleteBackward(delta, 2)).toEqual({ start: 0, length: 2 });
  });

  it('consumes the divider when the caret sits on it', () => {
    const delta = new Delta().insert({ divider: true }).insert('\n123\n');
    expect(dividerLineToDeleteBackward(delta, 0)).toBeNull();
    expect(dividerLineToDeleteBackward(delta, 1)).toEqual({ start: 0, length: 2 });
  });
});

describe('adjustTextInsertIndex', () => {
  it('moves caret off a divider embed onto the following line', () => {
    const delta = new Delta().insert('Hello\n').insert({ divider: true }).insert('\n\n');
    expect(adjustTextInsertIndex(delta, 6)).toBe(8);
    expect(adjustTextInsertIndex(delta, 7)).toBe(8);
  });

  it('leaves a caret in the paragraph above a divider unchanged', () => {
    const delta = new Delta().insert('Hello\n').insert({ divider: true }).insert('\n\n');
    expect(adjustTextInsertIndex(delta, 5)).toBe(5);
    expect(adjustTextInsertIndex(delta, 4)).toBe(4);
  });

  it('leaves a caret already below a divider unchanged', () => {
    const delta = new Delta().insert('Hello\n').insert({ divider: true }).insert('\n\n');
    expect(adjustTextInsertIndex(delta, 8)).toBe(8);
  });
});

describe('adjustPasteInsertIndex', () => {
  const tableBlock = {
    block: { type: 'table', cells: { '0:0': { ops: [{ insert: 'A\n' }] } } },
  };

  it('moves paste point past block embed owned newline', () => {
    const delta = new Delta().insert(tableBlock).insert('\n').insert('\n');
    expect(adjustPasteInsertIndex(delta, 1)).toBe(2);
  });

  it('leaves index unchanged on regular paragraph newlines', () => {
    const delta = new Delta().insert('Hello\n');
    expect(adjustPasteInsertIndex(delta, 5)).toBe(5);
  });

  it('moves paste point past simple-table cell newline', () => {
    const delta = new Delta()
      .insert('A')
      .insert('\n', { 'table-row': 0, 'table-col': 0 })
      .insert('B')
      .insert('\n', { 'table-row': 0, 'table-col': 1 })
      .insert('\n');
    expect(adjustPasteInsertIndex(delta, 3)).toBe(4);
  });

  it('moves paste point past separator line under a simple table', () => {
    const delta = new Delta()
      .insert('A')
      .insert('\n', { 'table-row': 0, 'table-col': 0 })
      .insert('D')
      .insert('\n', { 'table-row': 0, 'table-col': 1 })
      .insert('\n');
    expect(adjustPasteInsertIndex(delta, 4)).toBe(5);
  });

  it('moves paste point past separator line under a block table embed', () => {
    const delta = new Delta()
      .insert({ block: { type: 'table', cells: {} } })
      .insert('\n')
      .insert('\n');
    expect(adjustPasteInsertIndex(delta, 2)).toBe(3);
  });

  it('moves paste point past inline continuation text after block table embed', () => {
    const tableBlock = {
      block: { type: 'table', cells: { '0:0': { ops: [{ insert: 'Merged\n' }] } } },
    };
    const delta = new Delta().insert('Hel').insert(tableBlock).insert('\nlo\n\n');
    expect(adjustPasteInsertIndex(delta, 6)).toBe(9);
    expect(pasteCaretIndexInRange(delta, 3, 5)).toBe(9);
  });

  it('moves block embed paste past end-of-line paragraph break (caret on \\n)', () => {
    const delta = new Delta().insert('Ctrl+Z to undo.\n');
    const caretOnNewline = 'Ctrl+Z to undo.'.length;
    expect(adjustPasteInsertIndex(delta, caretOnNewline, { pastingBlockOwnedEmbed: true })).toBe(
      caretOnNewline + 1,
    );
  });

  it('moves block embed paste past end-of-line paragraph break (caret on last char)', () => {
    const delta = new Delta().insert('Ctrl+Z to undo.\n');
    const caretOnDot = 'Ctrl+Z to undo.'.length - 1;
    expect(adjustPasteInsertIndex(delta, caretOnDot, { pastingBlockOwnedEmbed: true })).toBe(
      'Ctrl+Z to undo.'.length + 1,
    );
  });

  it('leaves mid-line caret unchanged for block embed paste', () => {
    const delta = new Delta().insert('Hello world\n');
    expect(adjustPasteInsertIndex(delta, 3, { pastingBlockOwnedEmbed: true })).toBe(3);
  });

  it('moves simple-table grid paste past end-of-line paragraph break (caret on \\n)', () => {
    const delta = new Delta().insert('Ctrl+Z to undo.\n');
    const caretOnNewline = 'Ctrl+Z to undo.'.length;
    expect(adjustPasteInsertIndex(delta, caretOnNewline, { pastingTableGrid: true })).toBe(
      caretOnNewline + 1,
    );
  });

  it('moves simple-table grid paste past end-of-line paragraph break (caret on last char)', () => {
    const delta = new Delta().insert('Ctrl+Z to undo.\n');
    const caretOnDot = 'Ctrl+Z to undo.'.length - 1;
    expect(adjustPasteInsertIndex(delta, caretOnDot, { pastingTableGrid: true })).toBe(
      'Ctrl+Z to undo.'.length + 1,
    );
  });
});

describe('ensureSeparatorLineAfterPastedTable', () => {
  it('appends plain paragraph when paste ends on table-row newline at EOF', () => {
    const delta = new Delta().insert('D').insert('\n', { 'table-row': 1, 'table-col': 1 });
    const result = ensureSeparatorLineAfterPastedTable(delta, 0, 2);
    expect(result.rangeEndExclusive).toBe(3);
    const lastOp = result.delta.ops[result.delta.ops.length - 1];
    expect(lastOp).toEqual({ insert: '\n' });
  });

  it('is idempotent when separator already follows the table', () => {
    const delta = new Delta()
      .insert('D')
      .insert('\n', { 'table-row': 1, 'table-col': 1 })
      .insert('\n');
    const result = ensureSeparatorLineAfterPastedTable(delta, 0, 2);
    expect(result.delta).toBe(delta);
    expect(result.rangeEndExclusive).toBe(2);
  });

  it('appends plain paragraph when paste ends on block table owned newline at EOF', () => {
    const delta = new Delta().insert({ block: { type: 'table', cells: {} } }).insert('\n');
    const result = ensureSeparatorLineAfterPastedTable(delta, 0, 2);
    expect(result.rangeEndExclusive).toBe(3);
    expect(result.delta.length()).toBe(3);
  });

  it('collapses extra empty bullet items from nested list HTML', () => {
    const prepared = canonicalizePasteOps([
      { insert: 'Direct Speech', attributes: { bold: true } },
      { insert: ' is a statement.' },
      { insert: '\n\n\n\n', attributes: { list: 'bullet' } },
      { insert: 'Reported Speech', attributes: { bold: true } },
      { insert: ' is a paraphrase.' },
      { insert: '\n\n\n\n', attributes: { list: 'bullet' } },
    ]);
    const listNewlines = prepared.filter(
      (op) => isTextInsert(op) && op.insert === '\n' && op.attributes?.list === 'bullet',
    );
    expect(listNewlines).toHaveLength(2);
    const text = prepared
      .map((op) => (isTextInsert(op) ? op.insert : ''))
      .join('')
      .replace(/\n/g, '|');
    expect(text).toBe('Direct Speech is a statement.|Reported Speech is a paraphrase.|');
  });

  it('strips a leading decorative bullet glyph on list items', () => {
    const prepared = canonicalizePasteOps([
      { insert: '•' },
      { insert: 'Direct Speech', attributes: { bold: true } },
      { insert: '\n', attributes: { list: 'bullet' } },
      { insert: '•Reported Speech' },
      { insert: '\n', attributes: { list: 'bullet' } },
    ]);
    const text = prepared.map((op) => (isTextInsert(op) ? op.insert : '')).join('');
    expect(text).toBe('Direct Speech\nReported Speech\n');
    expect(text).not.toContain('•');
  });

  it('keeps line structure between a table at the top and a divider at the bottom', () => {
    // Communication.dlt: a Simple table near the start and an `<hr>` at the very
    // end used to make stripGap delete every `\n` in between, so each heading
    // fused into the Extended table that followed it.
    const table = { block: { type: 'table', cells: {}, rows: 1, cols: 1 } };
    const raw = [
      { insert: 'Cell' },
      { insert: '\n', attributes: { 'table-row': 0, 'table-col': 0 } },
      { insert: 'Opening' },
      { insert: '\n', attributes: { header: 3 } },
      { insert: table },
      { insert: '\n' },
      { insert: '\n' },
      { insert: 'Making a Request' },
      { insert: '\n', attributes: { header: 3 } },
      { insert: table },
      { insert: '\n' },
      { insert: { divider: true } },
      { insert: '\n' },
    ];
    const prepared = canonicalizePasteOps(raw);
    const headers = prepared.filter(
      (op) => isTextInsert(op) && op.insert === '\n' && op.attributes?.header === 3,
    );
    expect(headers).toHaveLength(2);
    const cellNl = prepared.findIndex(
      (op) => isTextInsert(op) && op.attributes?.['table-row'] != null,
    );
    const dividerIdx = prepared.findIndex(
      (op) => isInsert(op) && typeof op.insert === 'object' && 'divider' in op.insert,
    );
    expect(dividerIdx).toBeGreaterThan(cellNl + 1);
  });

  it('gives a heading glued to a following block table its own line', () => {
    const table = { block: { type: 'table', cells: {}, rows: 1, cols: 1 } };
    const prepared = canonicalizePasteOps([
      { insert: table },
      { insert: '\n' },
      { insert: 'Making a Request (Polite Form)' },
      { insert: table },
      { insert: '\n' },
    ]);
    const headingIdx = prepared.findIndex(
      (op) => isTextInsert(op) && op.insert.startsWith('Making a Request'),
    );
    expect(headingIdx).toBeGreaterThan(-1);
    const after = prepared[headingIdx + 1];
    expect(after && isTextInsert(after) && after.insert).toBe('\n');
  });

  it('leaves a well-formed heading before a block table untouched', () => {
    const table = { block: { type: 'table', cells: {}, rows: 1, cols: 1 } };
    const raw = [
      { insert: table },
      { insert: '\n' },
      { insert: '\n' },
      { insert: 'Making a Request (Polite Form)' },
      { insert: '\n', attributes: { header: 3 } },
      { insert: table },
      { insert: '\n' },
    ];
    const prepared = canonicalizePasteOps(raw);
    const headers = prepared.filter(
      (op) => isTextInsert(op) && op.insert === '\n' && op.attributes?.header === 3,
    );
    expect(headers).toHaveLength(1);
    const headingNl = prepared.findIndex(
      (op) => isTextInsert(op) && op.insert === '\n' && op.attributes?.header === 3,
    );
    const next = prepared[headingNl + 1];
    expect(
      next && isInsert(next) && typeof next.insert === 'object' && 'block' in next.insert,
    ).toBe(true);
  });

  it('drops the markdown blank line between a heading and the following block table', () => {
    // deltaToMarkdown emits `### Heading\n\n<table>` so the HTML block is
    // valid CommonMark; parsePastedMarkdown then keeps that blank as a
    // paragraph and Ctrl+V grows a gap the source never had.
    const table = { block: { type: 'table', cells: {}, rows: 1, cols: 1 } };
    const prepared = canonicalizePasteOps([
      { insert: 'Opening (Letter Start)' },
      { insert: '\n', attributes: { header: 3 } },
      { insert: '\n' },
      { insert: table },
      { insert: '\n' },
    ]);
    const headingNl = prepared.findIndex(
      (op) => isTextInsert(op) && op.insert === '\n' && op.attributes?.header === 3,
    );
    expect(headingNl).toBeGreaterThan(-1);
    const next = prepared[headingNl + 1];
    expect(
      next && isInsert(next) && typeof next.insert === 'object' && 'block' in next.insert,
    ).toBe(true);
  });

  it('keeps the author blank between a block table and the next heading', () => {
    const table = { block: { type: 'table', cells: {}, rows: 1, cols: 1 } };
    const prepared = canonicalizePasteOps([
      { insert: table },
      { insert: '\n' },
      { insert: '\n' },
      { insert: 'Referring to Previous Contact' },
      { insert: '\n', attributes: { header: 3 } },
    ]);
    const blockIdx = prepared.findIndex(
      (op) => isInsert(op) && typeof op.insert === 'object' && 'block' in op.insert,
    );
    expect(blockIdx).toBeGreaterThan(-1);
    expect(prepared[blockIdx + 1]).toEqual({ insert: '\n' });
    expect(prepared[blockIdx + 2]).toEqual({ insert: '\n' });
    expect(prepared[blockIdx + 3]).toEqual({ insert: 'Referring to Previous Contact' });
  });

  it('keeps a real paragraph between a heading and the following block table', () => {
    const table = { block: { type: 'table', cells: {}, rows: 1, cols: 1 } };
    const prepared = canonicalizePasteOps([
      { insert: 'Opening (Letter Start)' },
      { insert: '\n', attributes: { header: 3 } },
      { insert: 'Intro before the table' },
      { insert: '\n' },
      { insert: table },
      { insert: '\n' },
    ]);
    const headingNl = prepared.findIndex(
      (op) => isTextInsert(op) && op.insert === '\n' && op.attributes?.header === 3,
    );
    expect(prepared[headingNl + 1]).toEqual({ insert: 'Intro before the table' });
  });
});
