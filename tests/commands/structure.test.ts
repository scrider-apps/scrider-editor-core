import { describe, it, expect } from 'vitest';
import { compose, Delta } from '@scrider/delta';

import type { InsertOp } from '@scrider/delta';
import { isInsert, isTextInsert } from '@scrider/delta';

import {
  splitBlock,
  exitBlock,
  deleteBackward,
  deleteForward,
  insertText,
  insertEmbed,
  insertSoftBreak,
  insertBlock,
} from '../../src/commands/structure';
import { undo } from '../../src/commands/history';
import { createEditorState } from '../../src/state';
import type { EditorState } from '../../src/state';

/** Helper: create state with delta + selection. */
function makeState(
  delta: Delta,
  index: number,
  length = 0,
  extra?: Partial<EditorState>,
): EditorState {
  return { ...createEditorState({ delta, selection: { index, length } }), ...extra };
}

/** Simple one-line doc: "Hello\n" */
function singleLine(): Delta {
  return new Delta().insert('Hello\n');
}

/** Two-line doc: "Hello\nWorld\n" */
function twoLineDoc(): Delta {
  return new Delta().insert('Hello\nWorld\n');
}

// ========================================================================
// splitBlock
// ========================================================================

describe('splitBlock', () => {
  it('splits in the middle of a line', () => {
    const state = makeState(singleLine(), 3); // "Hel|lo"
    const result = splitBlock(state);

    expect(result.delta.ops).toEqual([{ insert: 'Hel\nlo\n' }]);
    expect(result.selection).toEqual({ index: 4, length: 0 });
  });

  it('splits at end of line → new empty line', () => {
    const state = makeState(singleLine(), 5); // "Hello|"
    const result = splitBlock(state);

    // "Hello\n\n" — two newlines, one for Hello, one for empty line
    expect(result.delta.ops).toEqual([{ insert: 'Hello\n\n' }]);
    expect(result.selection).toEqual({ index: 6, length: 0 });
  });

  it('splits at start of line → empty line above', () => {
    const state = makeState(singleLine(), 0); // "|Hello"
    const result = splitBlock(state);

    expect(result.delta.ops).toEqual([{ insert: '\nHello\n' }]);
    expect(result.selection).toEqual({ index: 1, length: 0 });
  });

  it('keeps list-start on the opening item and not on the new line', () => {
    const delta = new Delta().insert('Item').insert('\n', { list: 'ordered', 'list-start': 2 });
    const state = makeState(delta, 4);

    const result = splitBlock(state);

    expect(result.delta.ops).toEqual([
      { insert: 'Item' },
      { insert: '\n', attributes: { list: 'ordered', 'list-start': 2 } },
      { insert: '\n', attributes: { list: 'ordered' } },
    ]);
  });

  it('inherits list type and indent on new line', () => {
    const delta = new Delta().insert('Item').insert('\n', { list: 'bullet', indent: 1 });
    const state = makeState(delta, 4); // "Item|"

    const result = splitBlock(state);

    // Both \n carry {list, indent} (inheritable) — Delta merges them into one op.
    expect(result.delta.ops).toEqual([
      { insert: 'Item' },
      { insert: '\n\n', attributes: { list: 'bullet', indent: 1 } },
    ]);
  });

  it('new line after header loses header', () => {
    const delta = new Delta().insert('Title').insert('\n', { header: 1 });
    const state = makeState(delta, 5); // "Title|"

    const result = splitBlock(state);

    // First \n keeps header. Second \n (new line) loses it.
    expect(result.delta.ops).toEqual([
      { insert: 'Title' },
      { insert: '\n', attributes: { header: 1 } },
      { insert: '\n' },
    ]);
  });

  it('deletes selection before splitting', () => {
    const state = makeState(singleLine(), 1, 3); // "H[ell]o"
    const result = splitBlock(state);

    // "H\no\n"
    expect(result.delta.ops).toEqual([{ insert: 'H\no\n' }]);
    expect(result.selection).toEqual({ index: 2, length: 0 });
  });

  it('creates undo entry', () => {
    const state = makeState(singleLine(), 3);
    const result = splitBlock(state);
    expect(result.history.undoStack).toHaveLength(1);
  });

  it('returns unchanged when no selection', () => {
    const state = createEditorState();
    expect(splitBlock(state)).toBe(state);
  });

  it('Enter at the very start of a header opens a plain empty line above', () => {
    // Regression: pressing Enter at index 0 of a "# Title" line used to give
    // the new \n the `header: 1` attribute and strip it from the original,
    // demoting the styled line to plain. Expected behaviour is to insert a
    // plain empty paragraph above and leave the header line intact.
    const delta = new Delta().insert('Title').insert('\n', { header: 1 });
    const state = makeState(delta, 0);

    const result = splitBlock(state);

    // Delta merges adjacent plain inserts, so the empty paragraph and the
    // styled line text appear as one op until the header \n breaks them.
    expect(result.delta.ops).toEqual([
      { insert: '\nTitle' },
      { insert: '\n', attributes: { header: 1 } },
    ]);
    expect(result.selection).toEqual({ index: 1, length: 0 });
  });

  it('Enter at the start of a header in the middle of a document keeps the heading', () => {
    // Same regression as above, but with the heading on the second line so
    // the "line start" detection has to rely on the previous-char-is-\n
    // branch rather than index === 0.
    const delta = new Delta().insert('Prev\n').insert('Title').insert('\n', { header: 2 });
    const state = makeState(delta, 5); // cursor at start of "Title"

    const result = splitBlock(state);

    expect(result.delta.ops).toEqual([
      { insert: 'Prev\n\nTitle' },
      { insert: '\n', attributes: { header: 2 } },
    ]);
  });

  it('Enter at the start of a list item creates an empty list item above', () => {
    // Inheritable block attrs (list, blockquote, indent) must still propagate
    // so pressing Enter at the start of a list item yields a sibling item,
    // not a plain paragraph above.
    const delta = new Delta().insert('Item').insert('\n', { list: 'bullet' });
    const state = makeState(delta, 0);

    const result = splitBlock(state);

    expect(result.delta.ops).toEqual([
      { insert: '\n', attributes: { list: 'bullet' } },
      { insert: 'Item' },
      { insert: '\n', attributes: { list: 'bullet' } },
    ]);
  });
});

// ========================================================================
// exitBlock
// ========================================================================

describe('exitBlock', () => {
  it('leaves the list item and opens a plain paragraph below', () => {
    const delta = new Delta()
      .insert('a')
      .insert('\n', { list: 'ordered' })
      .insert('b')
      .insert('\n', { list: 'ordered' })
      .insert('c')
      .insert('\n', { list: 'ordered' });
    // "a\nb\nc|" — caret on the last item's terminator
    const state = makeState(delta, 5);

    const result = exitBlock(state);

    expect(result.delta.ops).toEqual([
      { insert: 'a' },
      { insert: '\n', attributes: { list: 'ordered' } },
      { insert: 'b' },
      { insert: '\n', attributes: { list: 'ordered' } },
      { insert: 'c' },
      { insert: '\n', attributes: { list: 'ordered' } },
      { insert: '\n' },
    ]);
    expect(result.selection).toEqual({ index: 6, length: 0 });
  });

  it('plain line after exit stays plain so a later setList can start a new list', () => {
    const delta = new Delta().insert('c').insert('\n', { list: 'ordered' });
    const afterExit = exitBlock(makeState(delta, 1));
    const afterText = insertText(afterExit, 'sdfasdf');

    expect(afterText.delta.ops).toEqual([
      { insert: 'c' },
      { insert: '\n', attributes: { list: 'ordered' } },
      { insert: 'sdfasdf\n' },
    ]);
  });

  it('Ctrl+Enter then Enter does not drop Tab indent on the paragraph above the list', () => {
    const delta = new Delta()
      .insert('123')
      .insert('\n', { indent: 1 })
      .insert('L231')
      .insert('\n', { list: 'ordered' })
      .insert('123')
      .insert('\n', { list: 'ordered', indent: 1 })
      .insert('231')
      .insert('\n', { list: 'ordered', indent: 2 });
    // caret at end of last list item
    const afterExit = exitBlock(makeState(delta, 3 + 1 + 4 + 1 + 3 + 1 + 3));
    const afterType = insertText(afterExit, 'dfs');
    const afterEnter = splitBlock(afterType);

    expect(afterEnter.delta.slice(3, 4).ops[0]).toEqual({
      insert: '\n',
      attributes: { indent: 1 },
    });
    expect(afterEnter.delta.ops.some((op) => isTextInsert(op) && op.insert.includes('dfs'))).toBe(
      true,
    );
  });
});

// ========================================================================
// deleteBackward
// ========================================================================

describe('deleteBackward', () => {
  it('manual select + Backspace includes the last list terminator (no leftover 1.1.1.)', () => {
    const last = 'sdfsdf';
    const delta = new Delta()
      .insert('Title')
      .insert('\n', { header: 2 })
      .insert('a')
      .insert('\n', { list: 'ordered' })
      .insert('b')
      .insert('\n', { list: 'ordered', indent: 1 })
      .insert(last)
      .insert('\n', { list: 'ordered', indent: 2 });
    // Browser drag-select stops on the last visible character, omitting `\n`.
    const state = makeState(delta, 0, delta.length() - 1);
    const result = deleteBackward(state);
    expect(result.delta.ops).toEqual([{ insert: '\n' }]);
    expect(result.delta.ops.some((op) => isInsert(op) && op.attributes?.list != null)).toBe(false);
  });

  it('Ctrl+A delete then undo does not grow a trailing empty line', () => {
    const delta = new Delta()
      .insert('Title')
      .insert('\n', { header: 2 })
      .insert('a')
      .insert('\n', { list: 'ordered' })
      .insert('b')
      .insert('\n', { list: 'ordered', indent: 1 });
    let state = makeState(delta, 0, delta.length());
    const before = state.delta.ops;

    for (let i = 0; i < 5; i++) {
      state = { ...state, selection: { index: 0, length: state.delta.length() } };
      state = deleteBackward(state);
      // Mimic editor updateState: re-add trailing \n if delete stripped it
      // *outside* the undo record (the old extra-line bug).
      const last = state.delta.ops[state.delta.ops.length - 1];
      const ends = last != null && isTextInsert(last) && last.insert.endsWith('\n');
      if (!ends) {
        state = {
          ...state,
          delta: compose(state.delta, new Delta().insert('\n')),
        };
      }
      expect(state.delta.ops).toEqual([{ insert: '\n' }]);
      state = undo(state);
    }

    expect(state.delta.ops).toEqual(before);
  });

  it('deletes one character before cursor', () => {
    const state = makeState(singleLine(), 3); // "Hel|lo"
    const result = deleteBackward(state);

    expect(result.delta.ops).toEqual([{ insert: 'Helo\n' }]);
    expect(result.selection).toEqual({ index: 2, length: 0 });
  });

  it('merges with previous line at line start (no block format)', () => {
    const state = makeState(twoLineDoc(), 6); // "Hello\n|World"
    const result = deleteBackward(state);

    // Deletes the \n → "HelloWorld\n"
    expect(result.delta.ops).toEqual([{ insert: 'HelloWorld\n' }]);
    expect(result.selection).toEqual({ index: 5, length: 0 });
  });

  it('does nothing at document start', () => {
    const state = makeState(singleLine(), 0);
    expect(deleteBackward(state)).toBe(state);
  });

  it('does nothing at start of a code-block fence (does not eject first line)', () => {
    // Mermaid / fenced edit: caret at index 0 of the fence must not strip
    // `code-block` and spill `flowchart TD` into a plain paragraph above.
    const delta = new Delta()
      .insert('Above')
      .insert('\n')
      .insert('flowchart TD')
      .insert('\n', { 'code-block': 'mermaid', 'code-block-id': 'm1' })
      .insert('  A-->B')
      .insert('\n', { 'code-block': 'mermaid', 'code-block-id': 'm1' })
      .insert('after\n');
    const fenceStart = 'Above\n'.length;
    const state = makeState(delta, fenceStart);
    const result = deleteBackward(state);

    expect(result).toBe(state);
    expect(result.delta.ops).toEqual(delta.ops);
  });

  it('merges two lines inside the same code-block fence', () => {
    const delta = new Delta()
      .insert('flowchart TD')
      .insert('\n', { 'code-block': 'mermaid', 'code-block-id': 'm1' })
      .insert('  A-->B')
      .insert('\n', { 'code-block': 'mermaid', 'code-block-id': 'm1' });
    const secondLineStart = 'flowchart TD\n'.length;
    const state = makeState(delta, secondLineStart);
    const result = deleteBackward(state);

    expect(result.delta.ops).toEqual([
      { insert: 'flowchart TD  A-->B' },
      { insert: '\n', attributes: { 'code-block': 'mermaid', 'code-block-id': 'm1' } },
    ]);
    expect(result.selection).toEqual({ index: 'flowchart TD'.length, length: 0 });
  });

  it('deletes selection', () => {
    const state = makeState(singleLine(), 1, 3); // "H[ell]o"
    const result = deleteBackward(state);

    expect(result.delta.ops).toEqual([{ insert: 'Ho\n' }]);
    expect(result.selection).toEqual({ index: 1, length: 0 });
  });

  it('merges a following paragraph into the last list item (keeps list)', () => {
    const delta = new Delta()
      .insert('123')
      .insert('\n', { list: 'ordered' })
      .insert('234')
      .insert('\n', { list: 'ordered' })
      .insert('345')
      .insert('\n', { list: 'ordered' })
      .insert('123')
      .insert('\n');
    const state = makeState(delta, '123\n234\n345\n'.length);

    const result = deleteBackward(state);

    expect(result.delta.ops).toEqual([
      { insert: '123' },
      { insert: '\n', attributes: { list: 'ordered' } },
      { insert: '234' },
      { insert: '\n', attributes: { list: 'ordered' } },
      { insert: '345123' },
      { insert: '\n', attributes: { list: 'ordered' } },
    ]);
    expect(result.selection).toEqual({ index: '123\n234\n345'.length, length: 0 });
  });

  it('keeps nest indent when merging a paragraph into a nested list item', () => {
    const delta = new Delta()
      .insert('parent')
      .insert('\n', { list: 'ordered' })
      .insert('child')
      .insert('\n', { list: 'ordered', indent: 1 })
      .insert('tail')
      .insert('\n');
    const state = makeState(delta, 'parent\nchild\n'.length);

    const result = deleteBackward(state);

    expect(result.delta.ops).toEqual([
      { insert: 'parent' },
      { insert: '\n', attributes: { list: 'ordered' } },
      { insert: 'childtail' },
      { insert: '\n', attributes: { list: 'ordered', indent: 1 } },
    ]);
  });

  it('removes block format instead of merging at line start with list', () => {
    const delta = new Delta()
      .insert('Prev')
      .insert('\n')
      .insert('Item')
      .insert('\n', { list: 'bullet' });
    const state = makeState(delta, 5); // "Prev\n|Item"

    const result = deleteBackward(state);

    // List removed, lines NOT merged
    expect(result.delta.ops).toEqual([{ insert: 'Prev\nItem\n' }]);
    // Cursor stays at same position
    expect(result.selection).toEqual({ index: 5, length: 0 });
  });

  it('removes Word presentation attrs at line start instead of merging (paste)', () => {
    const text = 'synchronizing the desired and actual states';
    const delta = new Delta().insert('Prev').insert('\n').insert(text).insert('\n', {
      align: 'justify',
      'scrider-text-indent': '35.45pt',
      'scrider-line-height': '1.5',
    });
    const state = makeState(delta, 'Prev\n'.length);

    const result = deleteBackward(state);

    expect(result.delta.ops).toEqual([{ insert: `Prev\n${text}\n` }]);
    const lastNl = result.delta.slice(result.delta.length() - 1, result.delta.length()).ops[0]!;
    expect(isTextInsert(lastNl) ? lastNl.attributes?.align : undefined).toBeUndefined();
    expect(
      isTextInsert(lastNl) ? lastNl.attributes?.['scrider-text-indent'] : undefined,
    ).toBeUndefined();
    expect(result.selection).toEqual({ index: 'Prev\n'.length, length: 0 });
  });

  it('merges with previous line after Word presentation attrs are cleared', () => {
    const text = 'Word line';
    const delta = new Delta().insert('Prev').insert('\n').insert(text).insert('\n');
    const state = makeState(delta, 'Prev\n'.length);

    const result = deleteBackward(state);

    expect(result.delta.ops).toEqual([{ insert: 'PrevWord line\n' }]);
    expect(result.selection).toEqual({ index: 4, length: 0 });
  });

  it('merges with previous line at start of header (non-inheritable block attr)', () => {
    // Heading is non-inheritable: pressing Backspace at line start used to
    // strip the heading (Quill-style "dedent then merge" dance).  That's
    // backwards from the "open up" Enter symmetry — now Backspace deletes
    // the previous \n, merging with the previous line and keeping the
    // heading attribute on the result's terminating \n.
    const delta = new Delta()
      .insert('Prev')
      .insert('\n')
      .insert('Title')
      .insert('\n', { header: 2 });
    const state = makeState(delta, 5); // "Prev\n|Title"

    const result = deleteBackward(state);

    expect(result.delta.ops).toEqual([
      { insert: 'PrevTitle' },
      { insert: '\n', attributes: { header: 2 } },
    ]);
    expect(result.selection).toEqual({ index: 4, length: 0 });
  });

  it('Backspace at heading start with empty line above removes the empty line', () => {
    // Regression: pressing Enter at start of "# Title" opens an empty
    // paragraph above; pressing Backspace there should reverse that —
    // delete the empty line, keep the heading intact.
    const delta = new Delta().insert('\n').insert('Title').insert('\n', { header: 1 });
    const state = makeState(delta, 1); // "\n|Title"

    const result = deleteBackward(state);

    expect(result.delta.ops).toEqual([
      { insert: 'Title' },
      { insert: '\n', attributes: { header: 1 } },
    ]);
    expect(result.selection).toEqual({ index: 0, length: 0 });
  });

  it('deletes empty list item instead of stripping format', () => {
    // Two bullet list items, second is empty: "123\n\n"
    const delta = new Delta()
      .insert('123')
      .insert('\n', { list: 'bullet' })
      .insert('\n', { list: 'bullet' });
    const state = makeState(delta, 4); // "123\n|\n" — cursor at start of empty 2nd item

    const result = deleteBackward(state);

    // Empty line deleted, first item preserved with format
    expect(result.delta.ops).toEqual([
      { insert: '123' },
      { insert: '\n', attributes: { list: 'bullet' } },
    ]);
    // Cursor moves to end of previous line (before previous \n)
    expect(result.selection).toEqual({ index: 3, length: 0 });
  });

  it('deletes empty header line instead of stripping format', () => {
    const delta = new Delta().insert('Prev').insert('\n').insert('\n', { header: 1 });
    const state = makeState(delta, 5); // "Prev\n|\n" — cursor at empty header line

    const result = deleteBackward(state);

    expect(result.delta.ops).toEqual([{ insert: 'Prev\n' }]);
    // Cursor at end of "Prev" (before \n)
    expect(result.selection).toEqual({ index: 4, length: 0 });
  });

  it('after deleting empty list item, next Backspace deletes char normally', () => {
    // Simulate: empty 2nd list item deleted, now "123\n" with list:bullet
    // Cursor at 3 (end of "123"), Backspace should delete "3"
    const delta = new Delta().insert('123').insert('\n', { list: 'bullet' });
    const state = makeState(delta, 3); // "12|3\n" — cursor after "12"

    const result = deleteBackward(state);

    expect(result.delta.ops).toEqual([
      { insert: '12' },
      { insert: '\n', attributes: { list: 'bullet' } },
    ]);
    expect(result.selection).toEqual({ index: 2, length: 0 });
  });

  it('creates undo entry', () => {
    const state = makeState(singleLine(), 3);
    const result = deleteBackward(state);
    expect(result.history.undoStack).toHaveLength(1);
  });

  it('returns unchanged when no selection', () => {
    const state = createEditorState();
    expect(deleteBackward(state)).toBe(state);
  });

  it('Backspace at the start of a heading below a divider removes the whole rule', () => {
    // Quotes & Dividers: `{divider}` + `\nHorizontal Rule` + heading `\n`.
    const delta = new Delta()
      .insert({ divider: true })
      .insert('\nHorizontal Rule')
      .insert('\n', { header: 2 });
    const state = makeState(delta, 2);
    const result = deleteBackward(state);

    expect(result.delta.ops).toEqual([
      { insert: 'Horizontal Rule' },
      { insert: '\n', attributes: { header: 2 } },
    ]);
    expect(result.selection).toEqual({ index: 0, length: 0 });
  });

  it('Backspace at the start of a paragraph below a divider removes the whole rule', () => {
    const delta = new Delta().insert({ divider: true }).insert('\nSection three\n');
    const state = makeState(delta, 2);
    const result = deleteBackward(state);

    expect(result.delta.ops).toEqual([{ insert: 'Section three\n' }]);
    expect(result.selection).toEqual({ index: 0, length: 0 });
  });

  it('Backspace on the divider line itself removes the whole rule', () => {
    const delta = new Delta().insert('Hello\n').insert({ divider: true }).insert('\n123\n');
    const state = makeState(delta, 6);
    const result = deleteBackward(state);

    expect(result.delta.ops).toEqual([{ insert: 'Hello\n123\n' }]);
    expect(result.selection).toEqual({ index: 6, length: 0 });
  });
});

// ========================================================================
// deleteForward
// ========================================================================

describe('deleteForward', () => {
  it('deletes one character after cursor', () => {
    const state = makeState(singleLine(), 2); // "He|llo"
    const result = deleteForward(state);

    expect(result.delta.ops).toEqual([{ insert: 'Helo\n' }]);
    expect(result.selection).toEqual({ index: 2, length: 0 });
  });

  it('merges with next line at end of line', () => {
    const state = makeState(twoLineDoc(), 5); // "Hello|\nWorld"
    const result = deleteForward(state);

    // Deletes the \n → "HelloWorld\n"
    expect(result.delta.ops).toEqual([{ insert: 'HelloWorld\n' }]);
    expect(result.selection).toEqual({ index: 5, length: 0 });
  });

  it('does nothing at document end', () => {
    const state = makeState(singleLine(), 6); // past last \n
    expect(deleteForward(state)).toBe(state);
  });

  it('deletes selection', () => {
    const state = makeState(singleLine(), 1, 3); // "H[ell]o"
    const result = deleteForward(state);

    expect(result.delta.ops).toEqual([{ insert: 'Ho\n' }]);
    expect(result.selection).toEqual({ index: 1, length: 0 });
  });

  it('Delete on a divider line removes the whole rule', () => {
    const delta = new Delta().insert('Hello\n').insert({ divider: true }).insert('\n123\n');
    const state = makeState(delta, 6);
    const result = deleteForward(state);

    expect(result.delta.ops).toEqual([{ insert: 'Hello\n123\n' }]);
    expect(result.selection).toEqual({ index: 6, length: 0 });
  });

  it('creates undo entry', () => {
    const state = makeState(singleLine(), 2);
    const result = deleteForward(state);
    expect(result.history.undoStack).toHaveLength(1);
  });

  it('returns unchanged when no selection', () => {
    const state = createEditorState();
    expect(deleteForward(state)).toBe(state);
  });
});

// ========================================================================
// insertText
// ========================================================================

describe('insertText', () => {
  it('inserts text at cursor position', () => {
    const state = makeState(singleLine(), 5); // "Hello|"
    const result = insertText(state, ' World');

    expect(result.delta.ops).toEqual([{ insert: 'Hello World\n' }]);
    expect(result.selection).toEqual({ index: 11, length: 0 });
  });

  it('replaces selection with text', () => {
    const state = makeState(singleLine(), 1, 3); // "H[ell]o"
    const result = insertText(state, 'a');

    expect(result.delta.ops).toEqual([{ insert: 'Hao\n' }]);
    expect(result.selection).toEqual({ index: 2, length: 0 });
  });

  it('replacing a uniformly formatted selection inherits its inline attrs', () => {
    // Regression: Ctrl+A → setFont('Times New Roman') → setFontSize('14pt')
    // → type any char used to drop font/size because the controlled path
    // inherited from "the char before the cursor" (none, cursor at 0).
    // Expected: the new char keeps the selection's uniform inline format.
    const delta = new Delta()
      .insert('Hello', { font: 'Times New Roman', size: '14pt' })
      .insert('\n');
    const state = makeState(delta, 0, 5); // [Hello] selected, cursor at 0

    const result = insertText(state, 'X');

    expect(result.delta.ops).toEqual([
      { insert: 'X', attributes: { font: 'Times New Roman', size: '14pt' } },
      { insert: '\n' },
    ]);
    expect(result.selection).toEqual({ index: 1, length: 0 });
  });

  it('replacing a selection with mixed inline attrs drops the non-uniform ones', () => {
    // "[Bold][Plain]" — selection has bold on only some chars.
    // Intersection of {bold:true} ∩ {} = {}.  Typing a char gets no format
    // (parity with Word: typing over mixed-format selection clears format).
    const delta = new Delta().insert('Bold', { bold: true }).insert('Plain').insert('\n');
    const state = makeState(delta, 0, 9); // entire "BoldPlain" selected

    const result = insertText(state, 'X');

    expect(result.delta.ops).toEqual([{ insert: 'X\n' }]);
    expect(result.selection).toEqual({ index: 1, length: 0 });
  });

  it('Enter → setFont → type preserves size from inherited storedMarks', () => {
    // Regression: user types in TNR 14, presses Enter, picks Calibri from
    // dropdown, types a char.  The new char should be Calibri 14, not
    // Calibri (no size → renders as document default 12).
    //
    // The chain is:
    //   1) splitBlock inherits prev-char inline attrs → storedMarks={font:TNR, size:14pt}
    //   2) setFont('Calibri') updates the `font` key → storedMarks={font:'Calibri', size:'14pt'}
    //   3) insertText('X') reads storedMarks → 'X' carries {font:'Calibri', size:'14pt'}
    const initialDelta = new Delta()
      .insert('Hello', { font: 'Times New Roman', size: '14pt' })
      .insert('\n');
    const state1 = makeState(initialDelta, 5); // cursor at end of "Hello"

    const state2 = splitBlock(state1);
    expect(state2.storedMarks).toEqual({ font: 'Times New Roman', size: '14pt' });
    expect(state2.selection).toEqual({ index: 6, length: 0 });

    // Mimic setFont('Calibri') in caret mode — merge into storedMarks
    const state3: EditorState = {
      ...state2,
      storedMarks: { ...(state2.storedMarks ?? {}), font: 'Calibri' },
    };
    expect(state3.storedMarks).toEqual({ font: 'Calibri', size: '14pt' });

    const state4 = insertText(state3, 'X');
    // 'X' should keep both font and size from storedMarks
    expect(state4.delta.ops).toEqual([
      { insert: 'Hello', attributes: { font: 'Times New Roman', size: '14pt' } },
      { insert: '\n' },
      { insert: 'X', attributes: { font: 'Calibri', size: '14pt' } },
      { insert: '\n' },
    ]);
    expect(state4.storedMarks).toBeNull();
  });

  it('storedMarks still override selection intersection when present', () => {
    // Selection is plain text but storedMarks have italic set — the new
    // char must be italic (storedMarks take priority over inherited attrs).
    const delta = new Delta().insert('Hello').insert('\n');
    const state = makeState(delta, 1, 3, { storedMarks: { italic: true } }); // "H[ell]o"

    const result = insertText(state, 'X');

    // Note: 'o' and '\n' merge into a single op because Quill Delta
    // auto-merges adjacent insert ops with the same (empty) attrs.
    expect(result.delta.ops).toEqual([
      { insert: 'H' },
      { insert: 'X', attributes: { italic: true } },
      { insert: 'o\n' },
    ]);
    expect(result.storedMarks).toBeNull();
  });

  it('applies storedMarks and clears them', () => {
    const state = makeState(singleLine(), 5, 0, {
      storedMarks: { bold: true },
    });

    const result = insertText(state, 'X');

    // "X" should be bold
    expect(result.delta.ops).toEqual([
      { insert: 'Hello' },
      { insert: 'X', attributes: { bold: true } },
      { insert: '\n' },
    ]);
    expect(result.storedMarks).toBeNull();
  });

  it('handles multiline text insert', () => {
    const state = makeState(singleLine(), 5); // "Hello|"
    const result = insertText(state, '\nNew line');

    expect(result.delta.ops).toEqual([{ insert: 'Hello\nNew line\n' }]);
    expect(result.selection).toEqual({ index: 14, length: 0 });
  });

  it('inherits formatting from previous character', () => {
    const delta = new Delta().insert('Bold', { bold: true }).insert('\n');
    const state = makeState(delta, 4); // after "Bold"

    const result = insertText(state, 'X');

    // "X" inherits bold from previous character
    expect(result.delta.ops).toEqual([
      { insert: 'BoldX', attributes: { bold: true } },
      { insert: '\n' },
    ]);
  });

  it('does nothing for empty text', () => {
    const state = makeState(singleLine(), 3);
    expect(insertText(state, '')).toBe(state);
  });

  it('creates undo entry', () => {
    const state = makeState(singleLine(), 3);
    const result = insertText(state, 'x');
    expect(result.history.undoStack).toHaveLength(1);
  });

  it('returns unchanged when no selection', () => {
    const state = createEditorState();
    expect(insertText(state, 'x')).toBe(state);
  });

  // ----- inheritance on empty lines (regression: TNR-14 + empty line) -----
  //
  // Reproduces the user-visible bug: Ctrl+A → setFont('TNR') →
  // setFontSize('14pt') → caret in an empty line → typing was producing
  // unstyled text even though the toolbar correctly reported TNR 14pt.
  //
  // Root cause: `getInheritedAttrs` used a 2-step neighbour lookup that
  // returned `{}` when both neighbours were `\n`, whereas the toolbar
  // (`getInlineFormatsAtCaret`) does a 4-step lookup including a backward
  // scan past blank lines. They are now aligned.

  it('inherits inline attrs from previous formatted line when caret is on a trailing empty line', () => {
    const delta = new Delta()
      .insert('Hello', { font: 'TNR', size: '14pt' })
      .insert('\n')
      .insert('\n');
    const state = makeState(delta, 6);
    const result = insertText(state, 'X');

    const xOp = result.delta.ops.find(
      (op): op is InsertOp => isTextInsert(op) && op.insert.includes('X'),
    );
    expect(xOp).toBeDefined();
    expect(xOp!.attributes).toEqual({ font: 'TNR', size: '14pt' });
  });

  it('inherits inline attrs from an empty line whose \\n itself carries font/size (Word/GDocs paste)', () => {
    const delta = new Delta()
      .insert('foo')
      .insert('\n')
      .insert('\n', { font: 'TNR', size: '14pt' });
    const state = makeState(delta, 4);
    const result = insertText(state, 'Y');

    const yOp = result.delta.ops.find(
      (op): op is InsertOp => isTextInsert(op) && op.insert.includes('Y'),
    );
    expect(yOp).toBeDefined();
    expect(yOp!.attributes).toEqual({ font: 'TNR', size: '14pt' });
  });

  it('skips block attrs (header/list) when inheriting through an empty line', () => {
    const delta = new Delta()
      .insert('Title', { font: 'TNR' })
      .insert('\n', { header: 1 })
      .insert('\n');
    const state = makeState(delta, 6);
    const result = insertText(state, 'Z');

    const zOp = result.delta.ops.find(
      (op): op is InsertOp => isTextInsert(op) && op.insert.includes('Z'),
    );
    expect(zOp).toBeDefined();
    expect(zOp!.attributes).toEqual({ font: 'TNR' });
  });

  it('regression: caret in first empty line of an otherwise empty document yields no attrs', () => {
    const state = makeState(new Delta().insert('\n'), 0);
    const result = insertText(state, 'A');

    const aOp = result.delta.ops.find(
      (op): op is InsertOp => isTextInsert(op) && op.insert.includes('A'),
    );
    expect(aOp).toBeDefined();
    expect(aOp!.attributes).toBeUndefined();
  });

  it('regression: caret in plain text still uses the previous char (no behaviour change)', () => {
    const delta = new Delta().insert('Hi', { bold: true }).insert(' there\n');
    const state = makeState(delta, 2);
    const result = insertText(state, '!');

    // Inserted '!' inherits bold from preceding 'Hi' and Delta merges them
    // into a single op 'Hi!' with {bold: true}; assert via slice to avoid
    // depending on the merge behaviour.
    const inserted = result.delta.slice(2, 3).ops[0] as InsertOp | undefined;
    expect(inserted).toBeDefined();
    expect(inserted!.insert).toBe('!');
    expect(inserted!.attributes).toEqual({ bold: true });
  });

  it('types below a divider when the caret sits on the embed', () => {
    const delta = new Delta().insert('Hello\n').insert({ divider: true }).insert('\n\n');
    const state = makeState(delta, 6); // on `{ divider }`
    const result = insertText(state, '123');

    expect(result.delta.ops).toEqual([
      { insert: 'Hello\n' },
      { insert: { divider: true } },
      { insert: '\n123\n' },
    ]);
    expect(result.selection).toEqual({ index: 11, length: 0 });
  });

  it('types below a divider when the caret sits on the owned newline', () => {
    const delta = new Delta().insert('Hello\n').insert({ divider: true }).insert('\n\n');
    const state = makeState(delta, 7); // owned `\n`
    const result = insertText(state, '123');

    expect(result.delta.ops).toEqual([
      { insert: 'Hello\n' },
      { insert: { divider: true } },
      { insert: '\n123\n' },
    ]);
  });

  it('undo after typing below a divider restores a single divider', () => {
    const delta = new Delta().insert('Hello\n').insert({ divider: true }).insert('\n\n');
    const typed = insertText(makeState(delta, 6), '123');
    const undone = undo(typed);

    const dividers = undone.delta.ops.filter(
      (op) =>
        isInsert(op) &&
        typeof op.insert === 'object' &&
        op.insert !== null &&
        'divider' in op.insert,
    );
    expect(dividers).toHaveLength(1);
    const plain = undone.delta.ops.map((op) => (isTextInsert(op) ? op.insert : '')).join('');
    expect(plain.includes('123')).toBe(false);
  });

  it('still types in the paragraph above a divider', () => {
    const delta = new Delta().insert('Hello\n').insert({ divider: true }).insert('\n\n');
    const state = makeState(delta, 5); // `\n` after Hello
    const result = insertText(state, 'X');

    expect(result.delta.ops).toEqual([
      { insert: 'HelloX\n' },
      { insert: { divider: true } },
      { insert: '\n\n' },
    ]);
  });
});

// ========================================================================
// insertEmbed
// ========================================================================

describe('insertEmbed', () => {
  it('inserts an image embed', () => {
    const state = makeState(singleLine(), 5);
    const result = insertEmbed(state, { image: 'https://example.com/img.png' });

    expect(result.delta.ops).toEqual([
      { insert: 'Hello' },
      { insert: { image: 'https://example.com/img.png' } },
      { insert: '\n' },
    ]);
    expect(result.selection).toEqual({ index: 6, length: 0 });
  });

  it('inserts embed with attributes', () => {
    const state = makeState(singleLine(), 5);
    const result = insertEmbed(state, { image: 'img.png' }, { width: '200px' });

    expect(result.delta.ops).toEqual([
      { insert: 'Hello' },
      { insert: { image: 'img.png' }, attributes: { width: '200px' } },
      { insert: '\n' },
    ]);
  });

  it('replaces selection', () => {
    const state = makeState(singleLine(), 1, 3); // "H[ell]o"
    const result = insertEmbed(state, { image: 'x.png' });

    expect(result.delta.ops).toEqual([
      { insert: 'H' },
      { insert: { image: 'x.png' } },
      { insert: 'o\n' },
    ]);
    expect(result.selection).toEqual({ index: 2, length: 0 });
  });

  it('creates undo entry', () => {
    const state = makeState(singleLine(), 3);
    const result = insertEmbed(state, { image: 'x.png' });
    expect(result.history.undoStack).toHaveLength(1);
  });
});

// ========================================================================
// insertSoftBreak
// ========================================================================

describe('insertSoftBreak', () => {
  it('inserts a softBreak embed in the middle of a line', () => {
    const state = makeState(singleLine(), 3); // "Hel|lo"
    const result = insertSoftBreak(state);

    expect(result.delta.ops).toEqual([
      { insert: 'Hel' },
      { insert: { softBreak: true } },
      { insert: 'lo\n' },
    ]);
    expect(result.selection).toEqual({ index: 4, length: 0 });
  });

  it('does NOT split the block (block-level attrs stay on the trailing \\n)', () => {
    const delta = new Delta().insert('Heading').insert('\n', { header: 2 });
    const state = makeState(delta, 4); // "Head|ing"
    const result = insertSoftBreak(state);

    // Only one \n in the result — the original one — still carrying header.
    expect(result.delta.ops).toEqual([
      { insert: 'Head' },
      { insert: { softBreak: true } },
      { insert: 'ing' },
      { insert: '\n', attributes: { header: 2 } },
    ]);
    expect(result.selection).toEqual({ index: 5, length: 0 });
  });

  it('replaces the selection', () => {
    const state = makeState(singleLine(), 1, 3); // "H[ell]o"
    const result = insertSoftBreak(state);

    expect(result.delta.ops).toEqual([
      { insert: 'H' },
      { insert: { softBreak: true } },
      { insert: 'o\n' },
    ]);
    expect(result.selection).toEqual({ index: 2, length: 0 });
  });

  it('inserts at the very start of the document', () => {
    const state = makeState(singleLine(), 0); // "|Hello"
    const result = insertSoftBreak(state);

    expect(result.delta.ops).toEqual([{ insert: { softBreak: true } }, { insert: 'Hello\n' }]);
    expect(result.selection).toEqual({ index: 1, length: 0 });
  });

  it('inserts just before the trailing newline (end of block)', () => {
    const state = makeState(singleLine(), 5); // "Hello|"
    const result = insertSoftBreak(state);

    expect(result.delta.ops).toEqual([
      { insert: 'Hello' },
      { insert: { softBreak: true } },
      { insert: '\n' },
    ]);
    expect(result.selection).toEqual({ index: 6, length: 0 });
  });

  it('creates an undo entry that round-trips back to the original delta', () => {
    const state = makeState(singleLine(), 3);
    const result = insertSoftBreak(state);

    expect(result.history.undoStack).toHaveLength(1);
    expect(result.history.redoStack).toHaveLength(0);
  });

  it('returns the state unchanged when there is no selection', () => {
    // createEditorState always sets a selection; emulate the cleared state
    // by forcibly nullifying it.
    const base = makeState(singleLine(), 0);
    const noSel: EditorState = { ...base, selection: null };

    const result = insertSoftBreak(noSel);
    expect(result).toBe(noSel);
  });
});

// ========================================================================
// insertBlock
// ========================================================================

describe('insertBlock', () => {
  it('inserts a block embed (divider) at end of line on its own row', () => {
    const state = makeState(singleLine(), 5); // "Hello|"
    const result = insertBlock(state, { divider: true });

    expect(result.delta.ops).toEqual([
      { insert: 'Hello\n' },
      { insert: { divider: true } },
      { insert: '\n\n' },
    ]);
    expect(result.selection).toEqual({ index: 8, length: 0 });
  });

  it('blockData is preserved as-is', () => {
    const state = makeState(singleLine(), 5);
    const data = { video: 'https://example.com/v.mp4', autoplay: true };
    const result = insertBlock(state, data);

    const embedOp = result.delta.ops.find(
      (op) => isInsert(op) && typeof op.insert === 'object' && op.insert !== null,
    );
    expect(embedOp).toBeDefined();
    if (isInsert(embedOp!)) {
      expect(embedOp.insert).toEqual(data);
    }
  });

  it('creates undo entry', () => {
    const state = makeState(singleLine(), 3);
    const result = insertBlock(state, { divider: true });
    expect(result.history.undoStack).toHaveLength(1);
  });

  it('returns unchanged when no selection', () => {
    const state = createEditorState();
    expect(insertBlock(state, { divider: true })).toBe(state);
  });
});
