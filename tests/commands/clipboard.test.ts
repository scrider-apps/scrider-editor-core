// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Delta, isInsert, isTextInsert } from '@scrider/delta';
import { createDefaultBlockHandlers, createDefaultRegistry, htmlToDelta } from '@scrider/formatter';

import {
  prepareCopy,
  expandSelectionToIncludeBlockTerminator,
  handlePaste,
  insertPastedOps,
  preparePastedOps,
  handleCut,
  isStructuralPasteNewline,
  isWholeDocumentSelection,
} from '../../src/commands/clipboard';
import { deleteBackward } from '../../src/commands/structure';
import { applyAttributePatchesAtNewlines } from '../../src/delta/newlineBlockAttributes';
import { createEditorState } from '../../src/state';
import type { EditorState } from '../../src/state';

const HELLO_UNDO_LINE = 'Press Enter for new paragraph, Backspace to delete, Ctrl+Z to undo.';

const WELCOME_PRESENTATION = {
  'scrider-line-height': '1.5',
  'scrider-margin-after': '0.5em',
} as const;

/** Welcome document tail: styled paragraph, blank line, then the undo hint as the last line. */
function welcomeDelta(): Delta {
  return new Delta()
    .insert('Welcome to ')
    .insert('Scrider', { bold: true })
    .insert('.')
    .insert('\n', { ...WELCOME_PRESENTATION })
    .insert('Try typing ')
    .insert('# ', { code: true })
    .insert(' at line start for a heading.')
    .insert('\n', { ...WELCOME_PRESENTATION })
    .insert('\n', { ...WELCOME_PRESENTATION })
    .insert(HELLO_UNDO_LINE)
    .insert('\n', { ...WELCOME_PRESENTATION });
}

/** Helper: create state with delta + selection. */
function makeState(delta: Delta, index: number, length = 0): EditorState {
  return createEditorState({ delta, selection: { index, length } });
}

// ========================================================================
// prepareCopy
// ========================================================================

describe('prepareCopy', () => {
  it('returns HTML and plain text for selection', () => {
    const delta = new Delta().insert('Hello World\n');
    const state = makeState(delta, 0, 5); // select "Hello"

    const { html, text } = prepareCopy(state);

    expect(text).toBe('Hello');
    expect(html.length).toBeGreaterThan(0);
  });

  it('returns empty strings when no selection', () => {
    const delta = new Delta().insert('Hello\n');
    const state = makeState(delta, 3); // caret, no selection

    const { html, text } = prepareCopy(state);

    expect(html).toBe('');
    expect(text).toBe('');
  });

  it('applies documentPresentation line spacing to paragraph HTML', () => {
    const delta = new Delta().insert('Line').insert('\n');
    const state = makeState(delta, 0, delta.length());

    const { html } = prepareCopy(state, { documentPresentation: { lineSpacing: 1.5 } });

    expect(html).toMatch(/<p[^>]*line-height:1\.5/);
  });

  it('preserves inline formatting in HTML', () => {
    const delta = new Delta().insert('Bold', { bold: true }).insert('\n');
    const state = makeState(delta, 0, 4);

    const { html, text } = prepareCopy(state);

    expect(text).toBe('Bold');
    expect(html).toContain('<strong>');
  });

  it('includes heading terminator when selection stops on the last heading character', () => {
    const delta = new Delta()
      .insert('Intro')
      .insert('\n')
      .insert('Opening (Letter Start)')
      .insert('\n', { header: 3 });
    const headingStart = 'Intro\n'.length;
    const headingTextLen = 'Opening (Letter Start)'.length;
    const state = makeState(delta, headingStart, headingTextLen);

    expect(expandSelectionToIncludeBlockTerminator(delta, state.selection!).length).toBe(
      headingTextLen + 1,
    );
    const { html } = prepareCopy(state);
    expect(html).toMatch(/<h3\b/i);
  });

  it('copies the accordion newline when the selection stops on the last character', () => {
    const delta = new Delta()
      .insert('Accordion')
      .insert('\n', { accordion: 0 })
      .insert('Footer of level 0')
      .insert('\n', { 'accordion-body': 0 })
      .insert('123123')
      .insert('\n', { 'accordion-body': 0 });
    const state = makeState(delta, 0, delta.length() - 1);

    expect(expandSelectionToIncludeBlockTerminator(delta, state.selection!).length).toBe(
      delta.length(),
    );
    const { html } = prepareCopy(state);
    expect(html.lastIndexOf('123123')).toBeLessThan(html.lastIndexOf('</details>'));
    const pasted = htmlToDelta(html);
    const newlines = pasted.ops.filter(isTextInsert).filter((op) => op.insert === '\n');
    expect(newlines[newlines.length - 1]?.attributes).toMatchObject({ 'accordion-body': 0 });
  });

  it('isWholeDocumentSelection is true only for 0..length', () => {
    const delta = new Delta().insert('Hello\n');
    expect(isWholeDocumentSelection(delta, { index: 0, length: delta.length() })).toBe(true);
    expect(isWholeDocumentSelection(delta, { index: 0, length: delta.length() + 1 })).toBe(true);
    expect(isWholeDocumentSelection(delta, { index: 0, length: 2 })).toBe(false);
    expect(isWholeDocumentSelection(delta, { index: 1, length: delta.length() - 1 })).toBe(false);
    expect(isWholeDocumentSelection(delta, { index: 0, length: 0 })).toBe(false);
    expect(isWholeDocumentSelection(delta, null)).toBe(false);
  });

  it('returns empty when selection is null', () => {
    const state = createEditorState();
    const { html, text } = prepareCopy(state);

    expect(html).toBe('');
    expect(text).toBe('');
  });

  it('applies tablePresentation to copied table HTML', () => {
    const delta = new Delta()
      .insert('A')
      .insert('\n', { 'table-row': 0, 'table-col': 0, 'table-header': true })
      .insert('B')
      .insert('\n', { 'table-row': 1, 'table-col': 0 });
    const state = makeState(delta, 0, delta.length());

    const { html } = prepareCopy(state, { tablePresentation: { grid: true } });

    expect(html).toContain('border: 1px solid');
    expect(html).toContain('<table style="border-collapse: collapse">');
  });

  it('applies tablePresentation header and zebra styles to copied table HTML', () => {
    const delta = new Delta()
      .insert('H')
      .insert('\n', { 'table-row': 0, 'table-col': 0, 'table-header': true })
      .insert('A')
      .insert('\n', { 'table-row': 1, 'table-col': 0 })
      .insert('B')
      .insert('\n', { 'table-row': 2, 'table-col': 0 });
    const state = makeState(delta, 0, delta.length());

    const { html } = prepareCopy(state, {
      tablePresentation: {
        grid: true,
        headerShade: true,
        zebraRows: true,
        headerBold: true,
        headerCenter: true,
      },
    });

    expect(html).toMatch(/<th[^>]*font-weight:\s*bold/i);
    expect(html).toMatch(/<th[^>]*text-align:\s*center/i);
    expect(html).toMatch(/<th[^>]*background-color:/i);
    expect(html).toMatch(/<td[^>]*background-color:/i);
  });
});

// ========================================================================
// handlePaste
// ========================================================================

describe('handlePaste', () => {
  it('inserts simple HTML at cursor', () => {
    const delta = new Delta().insert('Hello\n');
    const state = makeState(delta, 5); // "Hello|"

    const result = handlePaste(state, '<p>World</p>');

    // "Hello" + pasted "World\n" + trailing "\n"
    const plain = result.delta.ops
      .filter(isTextInsert)
      .map((op) => op.insert)
      .join('');
    expect(plain).toContain('HelloWorld');
  });

  it('keeps a trailing paragraph terminator after paste with settings bake (no off-by-one desync)', () => {
    // Empty doc → paste a table + divider + paragraphs with presentation bake.
    // The bake stamps presentation attrs onto the trailing `\n` ops; the
    // filler-paragraph collapse must NOT strip the document terminator.
    const state = makeState(new Delta().insert('\n'), 0);
    const html =
      '<table><tbody>' +
      '<tr><td>A</td><td>B</td></tr>' +
      '</tbody></table><hr><p>Who did the action?</p>' +
      '<p>Use "<strong>by</strong>" to mention the doer.</p>';

    const result = handlePaste(state, html, {
      documentSettingsPasteBake: {
        lineSpacing: 1.5,
        paragraphSpacingAfterEm: 0.5,
        paragraphSpacingBeforeEm: 0,
      },
    });

    const ops = result.delta.ops;
    const last = ops[ops.length - 1]!;
    expect(isTextInsert(last) && last.insert.endsWith('\n')).toBe(true);
  });

  it('preserves table-col-align on paste when document settings bake is active', () => {
    // Regression: bake rewrites every `\n` op through the block-attr whitelist.
    // `table-col-align` must be whitelisted, otherwise centered/right columns
    // (e.g. Busuu tables centered via inline `text-align`) come out left.
    const state = makeState(new Delta().insert('\n'), 0);
    const html =
      '<table><tbody>' +
      '<tr><td style="text-align: center">A</td><td style="text-align: right">B</td></tr>' +
      '<tr><td style="text-align: center">C</td><td style="text-align: right">D</td></tr>' +
      '</tbody></table>';

    const result = handlePaste(state, html, {
      documentSettingsPasteBake: {
        lineSpacing: 1.5,
        paragraphSpacingAfterEm: 0.5,
        paragraphSpacingBeforeEm: 0,
      },
    });

    const cellAligns = result.delta.ops
      .filter(
        (op): op is { insert: string; attributes: Record<string, unknown> } =>
          isTextInsert(op) && op.attributes != null && 'table-row' in op.attributes,
      )
      .map((op) => op.attributes['table-col-align']);

    expect(cellAligns.length).toBeGreaterThan(0);
    // Column 0 → center, column 1 → right; bake must not strip these.
    expect(cellAligns).toContain('center');
    expect(cellAligns).toContain('right');
  });

  it('inserts formatted HTML (bold)', () => {
    const delta = new Delta().insert('X\n');
    const state = makeState(delta, 1); // "X|"

    const result = handlePaste(state, '<p><strong>Bold</strong></p>');

    const ops = result.delta.ops;
    const boldOp = ops.find((op) => {
      if (!isTextInsert(op)) return false;
      return op.insert.includes('Bold') && op.attributes?.bold === true;
    });
    expect(boldOp).toBeDefined();
  });

  it('replaces selection', () => {
    const delta = new Delta().insert('Hello World\n');
    const state = makeState(delta, 6, 5); // "Hello [World]"

    const result = handlePaste(state, '<p>Earth</p>');

    const plain = result.delta.ops
      .filter(isTextInsert)
      .map((op) => op.insert)
      .join('');
    expect(plain).toContain('Hello Earth');
    expect(plain).not.toContain('World');
  });

  it('creates undo entry', () => {
    const delta = new Delta().insert('Hello\n');
    const state = makeState(delta, 5);

    const result = handlePaste(state, '<p>X</p>');
    expect(result.history.undoStack).toHaveLength(1);
  });

  it('returns unchanged when no selection', () => {
    const state = createEditorState();
    expect(handlePaste(state, '<p>X</p>')).toBe(state);
  });

  it('normalizes duplicate table-row newlines on insertPastedOps (Busuu htmlToDelta shape)', () => {
    const ops = [
      { insert: 'My grandfather ' },
      { insert: 'sold', attributes: { bold: true } },
      { insert: ' this house in 1995.' },
      { insert: '\n', attributes: { 'table-row': 0, 'table-col': 0 } },
      { insert: '\n', attributes: { 'table-row': 0, 'table-col': 0 } },
      { insert: '\n', attributes: { 'table-row': 0, 'table-col': 0 } },
      { insert: 'Active voice:', attributes: { bold: true } },
      { insert: ' the important information is "who sold the house".' },
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
    const state = makeState(new Delta().insert('\n'), 0);
    const result = insertPastedOps(state, ops);

    const cellNewlines = result.delta.ops.filter(
      (op) =>
        isTextInsert(op) && op.insert === '\n' && op.attributes && 'table-row' in op.attributes,
    );
    expect(cellNewlines).toHaveLength(4);
    const plain = result.delta.ops
      .filter(isTextInsert)
      .map((o) => o.insert)
      .join('');
    expect(plain).toContain('My grandfather');
    expect(plain).toContain('Active voice');
  });

  it('preserves trailing table-row newline when pasting table HTML', () => {
    const html = '<table><tbody><tr><td>Cell1</td></tr><tr><td>Cell2</td></tr></tbody></table>';
    const state = makeState(new Delta().insert('Before\n'), 6);

    const result = handlePaste(state, html);

    const plain = result.delta.ops
      .filter(isTextInsert)
      .map((op) => op.insert)
      .join('');
    expect(plain).toContain('Cell1');
    expect(plain).toContain('Cell2');
    expect(
      result.delta.ops.some(
        (op) =>
          isTextInsert(op) &&
          op.insert === '\n' &&
          op.attributes?.['table-row'] === 1 &&
          op.attributes?.['table-col'] === 0,
      ),
    ).toBe(true);
  });

  it('collapses trailing empty paragraphs after table paste (Busuu HTML tail)', () => {
    const html = `<table><tbody>
<tr><td><p>Cell A</p></td><td><p>Cell B</p></td></tr>
</tbody></table>
<p><br></p><p></p><p></p>`;
    const state = makeState(new Delta().insert('\n'), 0);
    const result = handlePaste(state, html);

    const ops = result.delta.ops;
    let lastTableIdx = -1;
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i]!;
      if (isTextInsert(op) && op.insert === '\n' && op.attributes && 'table-row' in op.attributes) {
        lastTableIdx = i;
      }
    }
    expect(lastTableIdx).toBeGreaterThanOrEqual(0);

    const trailingPlainNewlines = ops
      .slice(lastTableIdx + 1)
      .filter(
        (op) =>
          isTextInsert(op) &&
          op.insert === '\n' &&
          (!op.attributes || !('table-row' in op.attributes)),
      );
    expect(trailingPlainNewlines.length).toBeLessThanOrEqual(1);

    const plain = ops
      .filter(isTextInsert)
      .map((o) => o.insert)
      .join('');
    expect(plain).toContain('Cell A');
    expect(plain).toContain('Cell B');
  });

  it('preparePastedOps collapses trailing plain newlines after simple table', () => {
    const raw = [
      { insert: 'A' },
      { insert: '\n', attributes: { 'table-row': 0, 'table-col': 0 } },
      { insert: 'B' },
      { insert: '\n', attributes: { 'table-row': 0, 'table-col': 1 } },
      { insert: '\n' },
      { insert: '\n' },
      { insert: '\n' },
    ];
    const prepared = preparePastedOps(raw);
    expect(prepared[prepared.length - 1]).toEqual({
      insert: '\n',
      attributes: { 'table-row': 0, 'table-col': 1 },
    });
    expect(
      prepared.filter(
        (op) =>
          isTextInsert(op) &&
          op.insert === '\n' &&
          (!op.attributes || !('table-row' in op.attributes)),
      ),
    ).toHaveLength(0);
  });

  it('preparePastedOps replaces Busuu spacer between ? and Use with plain newline', () => {
    const raw = [
      { insert: 'Who did the action?' },
      {
        insert: '\n',
        attributes: {
          align: 'center',
          'scrider-line-height': '1.5',
          'scrider-margin-after': '0.5em',
        },
      },
      { insert: 'Use "by" if needed.' },
    ];
    const prepared = preparePastedOps(raw);
    const presentationSpacers = prepared.filter(
      (op) =>
        isTextInsert(op) && op.insert === '\n' && op.attributes?.['scrider-line-height'] != null,
    );
    expect(presentationSpacers).toHaveLength(0);
    const plainBreak = prepared.findIndex(
      (op, i) =>
        isTextInsert(op) &&
        op.insert === '\n' &&
        !op.attributes &&
        prepared[i - 1] &&
        isTextInsert(prepared[i - 1]!) &&
        (prepared[i - 1] as { insert: string }).insert === 'Who did the action?',
    );
    expect(plainBreak).toBeGreaterThanOrEqual(0);
  });

  it('preparePastedOps does not glue a heading onto the previous paragraph', () => {
    const pres = { 'scrider-line-height': '1.5', 'scrider-margin-after': '0.5em' };
    const raw = [
      { insert: 'Here are the printed tables:' },
      { insert: '\n', attributes: { ...pres } },
      { insert: '\n', attributes: { ...pres } },
      { insert: 'Opening (Letter Start)' },
      { insert: '\n', attributes: { header: 3 } },
      { insert: '\n', attributes: { ...pres } },
    ];
    const prepared = preparePastedOps(raw);
    const plain = prepared
      .filter(isTextInsert)
      .map((o) => o.insert)
      .join('');
    expect(plain).toContain('tables:\n');
    expect(plain).not.toContain('tables:Opening');
    expect(plain).toContain('tables:\n\nOpening');
    expect(
      prepared.some((op) => isTextInsert(op) && op.insert === '\n' && op.attributes?.header === 3),
    ).toBe(true);
    const headingText = prepared.find((op) => isTextInsert(op) && op.insert.includes('Opening'));
    expect(
      headingText && isTextInsert(headingText) ? headingText.attributes?.header : undefined,
    ).toBeUndefined();
  });

  it('preparePastedOps splits trailing newline out of last text op', () => {
    const raw = [
      { insert: 'Who did the action?' },
      { insert: '" if you want to mention the person who did the action.\n' },
    ];
    const prepared = preparePastedOps(raw);
    const last = prepared[prepared.length - 1];
    const prev = prepared[prepared.length - 2];
    expect(prev).toEqual({
      insert: '" if you want to mention the person who did the action.',
    });
    expect(last).toEqual({ insert: '\n' });
  });

  it('insertPastedOps places caret after last visible char not on trailing block newline', () => {
    const state = makeState(new Delta(), 0);
    const result = insertPastedOps(state, [
      { insert: 'Use "' },
      { insert: 'by', attributes: { bold: true } },
      { insert: '" if you want to mention the person who did the action.\n' },
    ]);
    const plain = result.delta.ops
      .filter(isTextInsert)
      .map((o) => o.insert)
      .join('');
    expect(plain).toContain('the action.');
    expect(result.selection?.index).toBe(result.delta.length());
  });

  it('hello-world EOL paste caret lands on separator under block table', () => {
    const html = '<table><tr><td colspan="2">Merged</td></tr><tr><td>A</td><td>B</td></tr></table>';
    const registry = createDefaultRegistry();
    const blockHandlers = createDefaultBlockHandlers();
    const pasted = htmlToDelta(html, { registry, blockHandlers }).ops;
    const undoLine = HELLO_UNDO_LINE;
    const delta = new Delta().insert(undoLine).insert('\n');
    const caret = undoLine.length;
    const state = insertPastedOps(makeState(delta, caret), pasted);
    const sel = state.selection?.index ?? -1;
    let pos = 0;
    let blockIndex = -1;
    for (const op of state.delta.ops) {
      if (
        isInsert(op) &&
        typeof op.insert === 'object' &&
        op.insert !== null &&
        'block' in op.insert &&
        (op.insert as { block?: { type?: string } }).block?.type === 'table'
      ) {
        blockIndex = pos;
      }
      pos += isTextInsert(op) ? op.insert.length : 1;
    }
    expect(blockIndex).toBeGreaterThanOrEqual(0);
    expect(sel).toBe(blockIndex + 2);
  });

  it('welcome document simple HTML table EOL paste keeps undo line and caret below grid', () => {
    const html = '<table><tr><td>A</td><td>B</td></tr><tr><td></td><td></td></tr></table>';
    const delta = welcomeDelta();
    const plain = delta.ops
      .filter(isTextInsert)
      .map((o) => o.insert)
      .join('');
    const undoLine = HELLO_UNDO_LINE;
    const caret = plain.indexOf(undoLine) + undoLine.length;
    const state = handlePaste(makeState(delta, caret), html);
    const sel = state.selection?.index ?? -1;
    const undoPos = plain.indexOf(undoLine);
    const pastedPlain = state.delta.ops
      .filter(isTextInsert)
      .map((o) => o.insert)
      .join('');
    expect(pastedPlain.slice(undoPos, undoPos + undoLine.length)).toBe(undoLine);
    const firstRowIdx = state.delta.ops.findIndex(
      (o) => isTextInsert(o) && o.attributes?.['table-row'] === 0,
    );
    expect(firstRowIdx).toBeGreaterThan(0);
    let tableEnd = 0;
    let pos = 0;
    for (const op of state.delta.ops) {
      if (isTextInsert(op) && op.attributes?.['table-row'] != null) {
        tableEnd = pos + op.insert.length;
      }
      pos += isTextInsert(op) ? op.insert.length : 1;
    }
    expect(sel).toBeGreaterThanOrEqual(tableEnd);
  });

  it('welcome document EOL paste caret lands on separator under block table', () => {
    const html = '<table><tr><td colspan="2">Merged</td></tr><tr><td>A</td><td>B</td></tr></table>';
    const registry = createDefaultRegistry();
    const blockHandlers = createDefaultBlockHandlers();
    const pasted = htmlToDelta(html, { registry, blockHandlers }).ops;
    const delta = welcomeDelta();
    const plain = delta.ops
      .filter(isTextInsert)
      .map((o) => o.insert)
      .join('');
    const undoLine = HELLO_UNDO_LINE;
    const caret = plain.indexOf(undoLine) + undoLine.length;
    const state = insertPastedOps(makeState(delta, caret), pasted);
    const sel = state.selection?.index ?? -1;
    let pos = 0;
    let blockIndex = -1;
    for (const op of state.delta.ops) {
      if (
        isInsert(op) &&
        typeof op.insert === 'object' &&
        op.insert !== null &&
        'block' in op.insert &&
        (op.insert as { block?: { type?: string } }).block?.type === 'table'
      ) {
        blockIndex = pos;
      }
      pos += isTextInsert(op) ? op.insert.length : 1;
    }
    expect(blockIndex).toBeGreaterThanOrEqual(0);
    expect(sel).toBe(blockIndex + 2);
  });

  it('two consecutive block table pastes stay on separate lines', () => {
    const tableOps = [
      {
        insert: {
          block: {
            type: 'table',
            cells: { '0:0': { ops: [{ insert: 'A\n' }] } },
          },
        },
      },
      { insert: '\n' },
    ];
    let state = makeState(new Delta().insert('\n'), 0);
    state = insertPastedOps(state, tableOps);
    expect(state.selection?.index).toBe(2);

    state = insertPastedOps(state, tableOps);

    const embedIndices: number[] = [];
    let pos = 0;
    for (const op of state.delta.ops) {
      if (
        isInsert(op) &&
        typeof op.insert === 'object' &&
        op.insert !== null &&
        'block' in op.insert &&
        (op.insert as { block?: { type?: string } }).block?.type === 'table'
      ) {
        embedIndices.push(pos);
      }
      pos += isTextInsert(op) ? op.insert.length : 1;
    }
    expect(embedIndices).toHaveLength(2);
    expect(embedIndices[1]! - embedIndices[0]!).toBeGreaterThanOrEqual(3);
  });

  it('two consecutive merged HTML block table pastes below text stay separate', () => {
    const html = '<table><tr><td colspan="2">Merged</td></tr><tr><td>A</td><td>B</td></tr></table>';
    const registry = createDefaultRegistry();
    const blockHandlers = createDefaultBlockHandlers();
    const pasted = htmlToDelta(html, { registry, blockHandlers }).ops;
    const emptyLineIndex = 'Hello\n'.length;
    let state = makeState(new Delta().insert('Hello\n\n'), emptyLineIndex);
    state = insertPastedOps(state, pasted);
    state = insertPastedOps(state, pasted);

    const embedIndices: number[] = [];
    let pos = 0;
    for (const op of state.delta.ops) {
      if (
        isInsert(op) &&
        typeof op.insert === 'object' &&
        op.insert !== null &&
        'block' in op.insert &&
        (op.insert as { block?: { type?: string } }).block?.type === 'table'
      ) {
        embedIndices.push(pos);
      }
      pos += isTextInsert(op) ? op.insert.length : 1;
    }
    expect(embedIndices).toHaveLength(2);
    expect(embedIndices[1]! - embedIndices[0]!).toBeGreaterThanOrEqual(3);
  });

  it('two consecutive simple HTML table pastes stay separate', () => {
    const html = '<table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>';
    let state = makeState(new Delta().insert('\n'), 0);
    state = handlePaste(state, html);
    expect(state.selection?.index).toBe(8);

    state = handlePaste(state, html);

    const plain = state.delta.ops
      .filter(isTextInsert)
      .map((o) => o.insert)
      .join('');
    expect(plain.match(/A/g)?.length ?? 0).toBe(2);
    expect(plain).not.toContain('DA');
    expect(plain).not.toContain('DB');
    expect(state.selection?.index).toBe(17);
    const lastTwo = state.delta.ops.slice(-2);
    expect(lastTwo[0]).toEqual({
      insert: '\n',
      attributes: { 'table-row': 1, 'table-col': 1 },
    });
    expect(lastTwo[1]).toEqual({ insert: '\n' });
  });

  it('backspace on separator between two simple tables keeps both grids', () => {
    const html = '<table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>';
    let state = makeState(new Delta().insert('\n'), 0);
    state = handlePaste(state, html);
    state = handlePaste(state, html);

    const lenBefore = state.delta.length();
    const sepBetweenIdx = 8;
    state = { ...state, selection: { index: sepBetweenIdx, length: 0 } };
    state = deleteBackward(state);

    expect(state.delta.length()).toBe(lenBefore - 1);
    const plain = state.delta.ops
      .filter(isTextInsert)
      .map((o) => o.insert)
      .join('');
    expect(plain.match(/A/g)?.length ?? 0).toBe(2);
    expect(plain).not.toContain('DA');
    expect(
      state.delta.ops.filter(
        (op) =>
          isTextInsert(op) &&
          op.insert === '\n' &&
          op.attributes !== undefined &&
          op.attributes['table-row'] != null,
      ).length,
    ).toBe(8);
  });

  it('preparePastedOps splits glued ?Use into paragraph break', () => {
    const raw = [{ insert: 'Who did the action?Use "by" if needed.' }, { insert: '\n' }];
    const prepared = preparePastedOps(raw);
    const plain = prepared
      .filter(isTextInsert)
      .map((o) => o.insert)
      .join('');
    expect(plain).toContain('Who did the action?\nUse');
    expect(plain).not.toContain('action?Use');
  });

  it('preparePastedOps does not split lowercase dotted abbreviations', () => {
    const raw = [
      { insert: 'Returns are assumed to be independently distributed (i.i.d.). Next sentence.' },
      { insert: '\n' },
    ];
    const prepared = preparePastedOps(raw);
    const plain = prepared
      .filter(isTextInsert)
      .map((o) => o.insert)
      .join('');
    expect(plain).toContain('(i.i.d.). Next sentence.');
    expect(plain).not.toContain('i.\ni.\nd.');
  });

  it('preparePastedOps collapses filler runs at document tail (Busuu footer)', () => {
    const raw = [
      { insert: 'Footer line' },
      { insert: '\n', attributes: { align: 'center' } },
      { insert: '\n', attributes: { 'scrider-line-height': '1.5' } },
      { insert: '\n', attributes: { 'scrider-line-height': '1.5' } },
      { insert: '\n', attributes: { 'scrider-line-height': '1.5' } },
    ];
    const prepared = preparePastedOps(raw);
    const filler = prepared.filter(
      (op) =>
        isTextInsert(op) && op.insert === '\n' && (!op.attributes || !('align' in op.attributes)),
    );
    expect(filler.length).toBeLessThanOrEqual(1);
  });

  it('preparePastedOps removes single presentation newline between table and divider', () => {
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
    const prepared = preparePastedOps(raw);
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
    expect(lastTableIdx).toBeGreaterThanOrEqual(0);
    expect(dividerIdx).toBe(lastTableIdx + 1);
    const gapBetween = prepared.slice(lastTableIdx + 1, dividerIdx);
    expect(gapBetween.filter((op) => isTextInsert(op) && op.insert === '\n')).toHaveLength(0);
  });

  it('preparePastedOps removes filler newlines between table and divider (Busuu fragment)', () => {
    const raw = [
      { insert: 'Cell A' },
      { insert: '\n', attributes: { 'table-row': 0, 'table-col': 0 } },
      { insert: 'Cell B' },
      { insert: '\n', attributes: { 'table-row': 0, 'table-col': 1 } },
      {
        insert: '\n',
        attributes: { 'scrider-line-height': '1.5', 'scrider-margin-after': '0.5em' },
      },
      {
        insert: '\n',
        attributes: { 'scrider-line-height': '1.5', 'scrider-margin-after': '0.5em' },
      },
      {
        insert: '\n',
        attributes: { 'scrider-line-height': '1.5', 'scrider-margin-after': '0.5em' },
      },
      { insert: { divider: true } },
      { insert: '\n' },
      { insert: 'Who did the action?' },
      { insert: '\n' },
      { insert: '\n' },
      { insert: '\n' },
    ];
    const prepared = preparePastedOps(raw);

    let lastTableIdx = -1;
    for (let i = 0; i < prepared.length; i++) {
      const op = prepared[i]!;
      if (isTextInsert(op) && op.insert === '\n' && op.attributes && 'table-row' in op.attributes) {
        lastTableIdx = i;
      }
    }
    const dividerIdx = prepared.findIndex(
      (op) =>
        isInsert(op) &&
        typeof op.insert === 'object' &&
        op.insert !== null &&
        'divider' in op.insert,
    );
    expect(dividerIdx).toBeGreaterThan(lastTableIdx);
    const fillerBeforeDivider = prepared
      .slice(lastTableIdx + 1, dividerIdx)
      .filter(
        (op) =>
          isTextInsert(op) &&
          op.insert === '\n' &&
          (!op.attributes || !('table-row' in op.attributes)),
      );
    expect(fillerBeforeDivider).toHaveLength(0);

    const trailingFiller = prepared
      .slice(dividerIdx)
      .filter(
        (op) =>
          isTextInsert(op) &&
          op.insert === '\n' &&
          (!op.attributes || !('table-row' in op.attributes)),
      );
    expect(trailingFiller.length).toBeLessThanOrEqual(2);
  });

  it('does not introduce line break when pasting inline HTML', () => {
    // Pasting "<p>abcd</p>" into "Start |here" should produce "Start abcdhere",
    // not "Start abcd\nhere". The trailing \n from htmlToDelta must be stripped.
    const delta = new Delta().insert('Start here\n');
    const state = makeState(delta, 6); // "Start |here"

    const result = handlePaste(state, '<p>abcd</p>');

    const plain = result.delta.ops
      .filter(isTextInsert)
      .map((op) => op.insert)
      .join('');
    expect(plain).toBe('Start abcdhere\n');
    expect(plain).not.toContain('abcd\n');
  });

  it('strips trailing newline from pasted block element', () => {
    // A <li> or <p> pasted inline should not add a phantom newline
    const delta = new Delta().insert('AB\n');
    const state = makeState(delta, 2); // "AB|"

    const result = handlePaste(state, '<li>CD</li>');

    const plain = result.delta.ops
      .filter(isTextInsert)
      .map((op) => op.insert)
      .join('');
    expect(plain).toContain('ABCD');
  });

  it('treats scrider-text-indent on trailing newline as structural (Word paste)', () => {
    const op = {
      insert: '\n',
      attributes: { align: 'justify', 'scrider-text-indent': '35.45pt' },
    };
    expect(isStructuralPasteNewline(op)).toBe(true);
  });

  it('preserves trailing plain paragraph newline with scrider-text-indent', () => {
    const delta = new Delta().insert('\n');
    const state = makeState(delta, 0);

    const result = handlePaste(state, '<p>After list body</p>', {
      transformPastedOps: (ops) => {
        const end = ops.reduce((len, o) => len + (isTextInsert(o) ? o.insert.length : 1), 0) - 1;
        return applyAttributePatchesAtNewlines(
          new Delta(ops),
          new Map([
            [
              end,
              {
                align: 'justify',
                'scrider-text-indent': '35.45pt',
                'scrider-line-height': '1.5',
              },
            ],
          ]),
        ).ops;
      },
    });

    expect(
      result.delta.ops.some(
        (op) =>
          isTextInsert(op) &&
          op.insert === '\n' &&
          op.attributes?.['scrider-text-indent'] === '35.45pt',
      ),
    ).toBe(true);
  });

  it('preserves trailing newline on merged text op when indent is on the final \\n', () => {
    const state = makeState(new Delta().insert('\n'), 0);

    const result = handlePaste(state, '<p>Paragraph</p>', {
      transformPastedOps: (ops) => {
        const end = ops.reduce((len, o) => len + (isTextInsert(o) ? o.insert.length : 1), 0) - 1;
        return applyAttributePatchesAtNewlines(
          new Delta(ops),
          new Map([[end, { 'scrider-text-indent': '35.45pt' }]]),
        ).ops;
      },
    });

    expect(
      result.delta.ops.some(
        (op) => isTextInsert(op) && op.attributes?.['scrider-text-indent'] === '35.45pt',
      ),
    ).toBe(true);
  });

  it('preserves multiple lines when pasting multi-paragraph HTML', () => {
    const delta = new Delta().insert('X\n');
    const state = makeState(delta, 1); // "X|"

    const result = handlePaste(state, '<p>Line1</p><p>Line2</p>');

    const plain = result.delta.ops
      .filter(isTextInsert)
      .map((op) => op.insert)
      .join('');
    // Should contain both lines with a newline between, but no trailing \n from paste
    expect(plain).toContain('Line1');
    expect(plain).toContain('Line2');
  });

  it('splits merged paragraph text into separate line and newline ops', () => {
    const state = makeState(new Delta(), 0);

    const result = handlePaste(state, '<p>Line1</p><p>Line2</p>');

    expect(result.delta.ops).toEqual([
      { insert: 'Line1' },
      { insert: '\n' },
      { insert: 'Line2' },
      { insert: '\n' },
    ]);
  });

  it('splits plain text paste blob into line and newline ops', () => {
    const state = makeState(new Delta(), 0);

    const result = insertPastedOps(state, [{ insert: 'A\nB' }]);

    // The composed document must end with a paragraph terminator (Quill
    // invariant), so a trailing `\n` is appended after the pasted "B".
    expect(result.delta.ops).toEqual([{ insert: 'A' }, { insert: '\n' }, { insert: 'B\n' }]);
  });
});

// ========================================================================
// handleCut
// ========================================================================

describe('handleCut', () => {
  it('returns copied data and deletes selection', () => {
    const delta = new Delta().insert('Hello World\n');
    const state = makeState(delta, 0, 5); // select "Hello"

    const { state: newState, html, text } = handleCut(state);

    expect(text).toBe('Hello');
    expect(html.length).toBeGreaterThan(0);

    // "Hello" removed, only " World\n" left
    const plain = newState.delta.ops
      .filter(isTextInsert)
      .map((op) => op.insert)
      .join('');
    expect(plain).toBe(' World\n');
    expect(newState.selection).toEqual({ index: 0, length: 0 });
  });

  it('returns unchanged state when no selection', () => {
    const delta = new Delta().insert('Hello\n');
    const state = makeState(delta, 3); // caret

    const { state: newState, html, text } = handleCut(state);

    expect(newState).toBe(state);
    expect(html).toBe('');
    expect(text).toBe('');
  });

  it('creates undo entry', () => {
    const delta = new Delta().insert('Hello World\n');
    const state = makeState(delta, 6, 5);

    const { state: newState } = handleCut(state);
    expect(newState.history.undoStack).toHaveLength(1);
  });
});
