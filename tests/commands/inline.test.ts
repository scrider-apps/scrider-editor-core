import { describe, it, expect } from 'vitest';
import { Delta, isInsert, isTextInsert } from '@scrider/delta';

import {
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  toggleCode,
  toggleMark,
  toggleSubscript,
  toggleSuperscript,
  toggleKbd,
  setColor,
  setBackground,
  setLink,
  setFont,
  setFontSize,
  removeFormat,
} from '../../src/commands/inline';
import { createEditorState } from '../../src/state';
import type { EditorState } from '../../src/state';

/** Helper: create a state with delta + selection. */
function makeState(delta: Delta, index: number, length: number): EditorState {
  return createEditorState({ delta, selection: { index, length } });
}

// ---------------------------------------------------------------------------
// toggleBold
// ---------------------------------------------------------------------------

describe('toggleBold', () => {
  it('applies bold to selection', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    const state = makeState(delta, 0, 5);

    const result = toggleBold(state);

    expect(result.delta.ops).toEqual([
      { insert: 'Hello', attributes: { bold: true } },
      { insert: '\n' },
    ]);
  });

  it('removes bold from fully-bold selection', () => {
    const delta = new Delta().insert('Hello', { bold: true }).insert('\n');
    const state = makeState(delta, 0, 5);

    const result = toggleBold(state);

    expect(result.delta.ops).toEqual([{ insert: 'Hello\n' }]);
  });

  it('applies bold when selection is partially bold', () => {
    const delta = new Delta().insert('Hel', { bold: true }).insert('lo').insert('\n');
    const state = makeState(delta, 0, 5);

    const result = toggleBold(state);

    expect(result.delta.ops).toEqual([
      { insert: 'Hello', attributes: { bold: true } },
      { insert: '\n' },
    ]);
  });

  it('sets storedMarks when caret (length=0) in non-bold text', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    const state = makeState(delta, 3, 0);

    const result = toggleBold(state);

    expect(result.storedMarks).toEqual(expect.objectContaining({ bold: true }));
    // Delta should NOT change
    expect(result.delta.ops).toEqual(state.delta.ops);
  });

  it('clears storedMarks bold when caret in bold text', () => {
    const delta = new Delta().insert('Hello', { bold: true }).insert('\n');
    const state = makeState(delta, 3, 0);

    const result = toggleBold(state);

    expect(result.storedMarks).toEqual(expect.objectContaining({ bold: null }));
  });

  it('toggles storedMarks when already set', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    let state = makeState(delta, 3, 0);

    // First toggle: bold on
    state = toggleBold(state);
    expect(state.storedMarks?.bold).toBe(true);

    // Second toggle: bold off
    state = toggleBold(state);
    expect(state.storedMarks?.bold).toBeNull();
  });

  it('returns state unchanged when no selection', () => {
    const state = createEditorState();
    const result = toggleBold(state);
    expect(result).toBe(state);
  });

  it('creates undo entry on selection change', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    const state = makeState(delta, 0, 5);

    const result = toggleBold(state);

    expect(result.history.undoStack).toHaveLength(1);
  });

  it('preserves storedMarks after selection-mode apply (predict mode)', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    let state = makeState(delta, 3, 0);
    state = toggleBold(state); // sets storedMarks
    expect(state.storedMarks).not.toBeNull();

    // Now select and toggle — storedMarks persist in predict mode
    state = { ...state, selection: { index: 0, length: 5 } };
    state = toggleBold(state);
    expect(state.storedMarks).toEqual({ bold: true });
  });
});

// ---------------------------------------------------------------------------
// Smoke tests for other toggle commands
// ---------------------------------------------------------------------------

describe('toggle commands — smoke tests', () => {
  const toggleCommands = [
    { name: 'toggleItalic', fn: toggleItalic, attr: 'italic' },
    { name: 'toggleUnderline', fn: toggleUnderline, attr: 'underline' },
    { name: 'toggleStrike', fn: toggleStrike, attr: 'strike' },
    { name: 'toggleCode', fn: toggleCode, attr: 'code' },
    { name: 'toggleMark', fn: toggleMark, attr: 'mark' },
    { name: 'toggleSubscript', fn: toggleSubscript, attr: 'subscript' },
    { name: 'toggleSuperscript', fn: toggleSuperscript, attr: 'superscript' },
    { name: 'toggleKbd', fn: toggleKbd, attr: 'kbd' },
  ] as const;

  for (const { name, fn, attr } of toggleCommands) {
    it(`${name} applies format to selection`, () => {
      const delta = new Delta().insert('Hello').insert('\n');
      const state = makeState(delta, 0, 5);

      const result = fn(state);

      const op = result.delta.ops[0] as { insert: string; attributes?: Record<string, unknown> };
      expect(op.insert).toBe('Hello');
      expect(op.attributes?.[attr]).toBe(true);
    });

    it(`${name} sets storedMarks at caret`, () => {
      const delta = new Delta().insert('Hello').insert('\n');
      const state = makeState(delta, 3, 0);

      const result = fn(state);

      expect(result.storedMarks).not.toBeNull();
      expect(result.storedMarks![attr]).toBe(true);
    });
  }
});

describe('subscript and superscript', () => {
  it('replaces subscript with superscript in one undo step', () => {
    const delta = new Delta().insert('H2O', { subscript: true }).insert('\n');
    const state = makeState(delta, 1, 1);

    const result = toggleSuperscript(state);

    const two = result.delta.ops.find((op) => isTextInsert(op) && op.insert === '2') as {
      insert: string;
      attributes?: Record<string, unknown>;
    };
    expect(two.attributes).toEqual({ superscript: true });
    expect(result.history.undoStack).toHaveLength(1);
  });

  it('clears the other script in storedMarks when turning one on', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    let state = makeState(delta, 3, 0);
    state = toggleSubscript(state);

    state = toggleSuperscript(state);

    expect(state.storedMarks).toEqual({ subscript: null, superscript: true });
  });

  it('turns subscript off without touching superscript', () => {
    const delta = new Delta().insert('H2O', { subscript: true }).insert('\n');
    const state = makeState(delta, 1, 1);

    const result = toggleSubscript(state);

    const two = result.delta.ops.find((op) => isTextInsert(op) && op.insert === '2') as {
      insert: string;
      attributes?: Record<string, unknown>;
    };
    expect(two.attributes?.subscript).toBeUndefined();
    expect(two.attributes?.superscript).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// setColor
// ---------------------------------------------------------------------------

describe('setColor', () => {
  it('applies color to selection', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    const state = makeState(delta, 0, 5);

    const result = setColor(state, '#ff0000');

    expect(result.delta.ops[0]).toEqual({
      insert: 'Hello',
      attributes: { color: '#ff0000' },
    });
  });

  it('removes color with null', () => {
    const delta = new Delta().insert('Hello', { color: '#ff0000' }).insert('\n');
    const state = makeState(delta, 0, 5);

    const result = setColor(state, null);

    expect(result.delta.ops).toEqual([{ insert: 'Hello\n' }]);
  });

  it('sets storedMarks at caret', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    const state = makeState(delta, 3, 0);

    const result = setColor(state, '#00ff00');

    expect(result.storedMarks).toEqual(expect.objectContaining({ color: '#00ff00' }));
  });

  it('creates undo entry', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    const state = makeState(delta, 0, 5);

    const result = setColor(state, '#ff0000');

    expect(result.history.undoStack).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// setBackground
// ---------------------------------------------------------------------------

describe('setBackground', () => {
  it('applies background to selection', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    const state = makeState(delta, 0, 5);

    const result = setBackground(state, '#ffff00');

    expect(result.delta.ops[0]).toEqual({
      insert: 'Hello',
      attributes: { background: '#ffff00' },
    });
  });

  it('removes background with null', () => {
    const delta = new Delta().insert('Hello', { background: '#ffff00' }).insert('\n');
    const state = makeState(delta, 0, 5);

    const result = setBackground(state, null);

    expect(result.delta.ops).toEqual([{ insert: 'Hello\n' }]);
  });
});

// ---------------------------------------------------------------------------
// setLink
// ---------------------------------------------------------------------------

describe('setLink', () => {
  it('applies link to selection', () => {
    const delta = new Delta().insert('Click here').insert('\n');
    const state = makeState(delta, 0, 10);

    const result = setLink(state, 'https://example.com');

    expect(result.delta.ops[0]).toEqual({
      insert: 'Click here',
      attributes: { link: 'https://example.com' },
    });
  });

  it('removes link with null', () => {
    const delta = new Delta().insert('Click here', { link: 'https://example.com' }).insert('\n');
    const state = makeState(delta, 0, 10);

    const result = setLink(state, null);

    expect(result.delta.ops).toEqual([{ insert: 'Click here\n' }]);
  });

  it('sets storedMarks at caret', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    const state = makeState(delta, 3, 0);

    const result = setLink(state, 'https://example.com');

    expect(result.storedMarks).toEqual(expect.objectContaining({ link: 'https://example.com' }));
  });
});

// ---------------------------------------------------------------------------
// setFont
// ---------------------------------------------------------------------------

describe('setFont', () => {
  it('applies font to selection', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    const state = makeState(delta, 0, 5);

    const result = setFont(state, 'Times New Roman');

    expect(result.delta.ops[0]).toEqual({
      insert: 'Hello',
      attributes: { font: 'Times New Roman' },
    });
  });

  it('removes font with null', () => {
    const delta = new Delta().insert('Hello', { font: 'Arial' }).insert('\n');
    const state = makeState(delta, 0, 5);

    const result = setFont(state, null);

    expect(result.delta.ops).toEqual([{ insert: 'Hello\n' }]);
  });

  it('sets storedMarks at caret', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    const state = makeState(delta, 3, 0);

    const result = setFont(state, 'Georgia');

    expect(result.storedMarks).toEqual(expect.objectContaining({ font: 'Georgia' }));
  });

  it('creates undo entry', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    const state = makeState(delta, 0, 5);

    const result = setFont(state, 'Inter');

    expect(result.history.undoStack).toHaveLength(1);
  });

  it('does not stamp font onto heading/table newlines or formula embeds (Ctrl+A)', () => {
    const delta = new Delta()
      .insert('Title')
      .insert('\n', { header: 2 })
      .insert({ formula: 'E=mc^2' })
      .insert('\n')
      .insert('A')
      .insert('\n', { 'table-row': 0, 'table-col': 0, 'table-header': true })
      .insert('B')
      .insert('\n', { 'table-row': 0, 'table-col': 1, 'table-header': true })
      .insert('After')
      .insert('\n');
    const state = makeState(delta, 0, delta.length());

    const result = setFont(state, 'Inter');

    for (const op of result.delta.ops) {
      const attrs = isInsert(op) ? op.attributes : undefined;
      if (isTextInsert(op) && op.insert.includes('\n')) {
        expect(attrs?.font).toBeUndefined();
      }
      if (
        isInsert(op) &&
        typeof op.insert === 'object' &&
        op.insert !== null &&
        'formula' in op.insert
      ) {
        expect(attrs?.font).toBeUndefined();
      }
    }

    expect(result.delta.ops).toEqual(
      expect.arrayContaining([
        { insert: 'Title', attributes: { font: 'Inter' } },
        { insert: '\n', attributes: { header: 2 } },
        { insert: { formula: 'E=mc^2' } },
        { insert: 'A', attributes: { font: 'Inter' } },
        {
          insert: '\n',
          attributes: { 'table-row': 0, 'table-col': 0, 'table-header': true },
        },
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// setFontSize
// ---------------------------------------------------------------------------

describe('setFontSize', () => {
  it('applies size to selection', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    const state = makeState(delta, 0, 5);

    const result = setFontSize(state, '14pt');

    expect(result.delta.ops[0]).toEqual({
      insert: 'Hello',
      attributes: { size: '14pt' },
    });
  });

  it('removes size with null', () => {
    const delta = new Delta().insert('Hello', { size: '18pt' }).insert('\n');
    const state = makeState(delta, 0, 5);

    const result = setFontSize(state, null);

    expect(result.delta.ops).toEqual([{ insert: 'Hello\n' }]);
  });

  it('sets storedMarks at caret', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    const state = makeState(delta, 3, 0);

    const result = setFontSize(state, '24pt');

    expect(result.storedMarks).toEqual(expect.objectContaining({ size: '24pt' }));
  });

  it('creates undo entry', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    const state = makeState(delta, 0, 5);

    const result = setFontSize(state, '16pt');

    expect(result.history.undoStack).toHaveLength(1);
  });

  it('applies size to the full heading line when only part is selected', () => {
    const delta = new Delta()
      .insert('Title', { size: '32pt' })
      .insert(' text', { size: '14pt' })
      .insert('\n', { header: 1 });
    const state = makeState(delta, 0, 5); // "Title"

    const result = setFontSize(state, '24pt');

    expect(result.delta.ops).toEqual([
      { insert: 'Title text', attributes: { size: '24pt' } },
      { insert: '\n', attributes: { header: 1 } },
    ]);
  });

  it('does not stamp size onto heading/table newlines or formula embeds (paste + Size)', () => {
    const delta = new Delta()
      .insert('Title')
      .insert('\n', { header: 2 })
      .insert({ formula: 'E=mc^2' })
      .insert('\n')
      .insert('A')
      .insert('\n', { 'table-row': 0, 'table-col': 0, 'table-header': true })
      .insert('B')
      .insert('\n', { 'table-row': 0, 'table-col': 1, 'table-header': true })
      .insert('After')
      .insert('\n');
    const state = makeState(delta, 0, delta.length());

    const result = setFontSize(state, '14pt');

    for (const op of result.delta.ops) {
      const attrs = isInsert(op) ? op.attributes : undefined;
      if (isTextInsert(op) && op.insert.includes('\n')) {
        expect(attrs?.size).toBeUndefined();
      }
      if (
        isInsert(op) &&
        typeof op.insert === 'object' &&
        op.insert !== null &&
        'formula' in op.insert
      ) {
        expect(attrs?.size).toBeUndefined();
      }
    }

    expect(result.delta.ops).toEqual(
      expect.arrayContaining([
        { insert: 'Title', attributes: { size: '14pt' } },
        { insert: '\n', attributes: { header: 2 } },
        { insert: { formula: 'E=mc^2' } },
        { insert: 'A', attributes: { size: '14pt' } },
        {
          insert: '\n',
          attributes: { 'table-row': 0, 'table-col': 0, 'table-header': true },
        },
      ]),
    );
  });

  it('applies size to the full heading line at caret', () => {
    const delta = new Delta()
      .insert('Hel', { size: '32pt' })
      .insert('lo', { size: '14pt' })
      .insert('\n', { header: 2 });
    const state = makeState(delta, 3, 0);

    const result = setFontSize(state, '20pt');

    expect(result.delta.ops).toEqual([
      { insert: 'Hello', attributes: { size: '20pt' } },
      { insert: '\n', attributes: { header: 2 } },
    ]);
    expect(result.storedMarks).toEqual(expect.objectContaining({ size: '20pt' }));
  });

  it('keeps body selection partial while expanding headings in mixed selection', () => {
    const delta = new Delta()
      .insert('Title', { size: '32pt' })
      .insert('\n', { header: 1 })
      .insert('Body text')
      .insert('\n');
    const state = makeState(delta, 3, 8); // "le\nBody"

    const result = setFontSize(state, '18pt');

    expect(result.delta.ops).toEqual([
      { insert: 'Title', attributes: { size: '18pt' } },
      { insert: '\n', attributes: { header: 1 } },
      { insert: 'Body ', attributes: { size: '18pt' } },
      { insert: 'text\n' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// removeFormat
// ---------------------------------------------------------------------------

describe('removeFormat', () => {
  it('removes all inline formats from selection', () => {
    const delta = new Delta()
      .insert('Hello', { bold: true, italic: true, color: '#ff0000' })
      .insert('\n');
    const state = makeState(delta, 0, 5);

    const result = removeFormat(state);

    expect(result.delta.ops).toEqual([{ insert: 'Hello\n' }]);
  });

  it('preserves block-level attributes on \\n', () => {
    const delta = new Delta().insert('Title', { bold: true }).insert('\n', { header: 2 });
    const state = makeState(delta, 0, 6); // includes \n

    const result = removeFormat(state);

    // Bold should be removed, header on \n should be preserved
    expect(result.delta.ops).toEqual([
      { insert: 'Title' },
      { insert: '\n', attributes: { header: 2 } },
    ]);
  });

  it('resets to detect mode in caret mode (storedMarks = null)', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    const state = makeState(delta, 3, 0);

    const result = removeFormat(state);

    // Reset to detect mode
    expect(result.storedMarks).toBeNull();
  });

  it('creates undo entry', () => {
    const delta = new Delta().insert('Hello', { bold: true }).insert('\n');
    const state = makeState(delta, 0, 5);

    const result = removeFormat(state);

    expect(result.history.undoStack).toHaveLength(1);
  });

  it('removes font and size from selection', () => {
    const delta = new Delta()
      .insert('Hello', { font: 'Arial', size: '14pt', bold: true })
      .insert('\n');
    const state = makeState(delta, 0, 5);

    const result = removeFormat(state);

    expect(result.delta.ops).toEqual([{ insert: 'Hello\n' }]);
  });

  it('returns unchanged state when no selection', () => {
    const state = createEditorState();
    const result = removeFormat(state);
    expect(result).toBe(state);
  });
});
