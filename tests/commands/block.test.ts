import { describe, it, expect } from 'vitest';
import { Delta, compose, isTextInsert } from '@scrider/delta';
import type { AttributeMap } from '@scrider/delta';

import {
  setHeader,
  toggleBlockquote,
  toggleCodeBlock,
  setCodeBlockFenceLanguage,
  setList,
  increaseIndent,
  decreaseIndent,
  setAlign,
  toggleTextIndent,
  setLineSpacing,
  DEFAULT_SCRIDER_TEXT_INDENT,
  SCRIDER_TEXT_INDENT_KEY,
} from '../../src/commands/block';
import { undo } from '../../src/commands/history';
import { createEditorState } from '../../src/state';
import type { EditorState } from '../../src/state';

/** Helper: create state with delta + selection. */
function makeState(delta: Delta, index: number, length: number): EditorState {
  return createEditorState({ delta, selection: { index, length } });
}

/**
 * Two-line document: "Line 1\nLine 2\n"
 * Note: Delta merges adjacent text with same attrs, so ops = [{ insert: 'Line 1\nLine 2\n' }]
 */
function twoLineDoc(): Delta {
  return new Delta().insert('Line 1\nLine 2\n');
}

function newlineAttrAt(delta: Delta, newlineIndex: number): AttributeMap | undefined {
  let pos = 0;
  for (const op of delta.ops) {
    if (isTextInsert(op)) {
      for (let i = 0; i < op.insert.length; i++) {
        if (op.insert[i] === '\n' && pos + i === newlineIndex) {
          return op.attributes;
        }
      }
      pos += op.insert.length;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// setHeader
// ---------------------------------------------------------------------------

describe('setHeader', () => {
  it('sets H2 on the current line (caret)', () => {
    const state = makeState(twoLineDoc(), 3, 0); // caret in "Line 1"
    const result = setHeader(state, 2);

    expect(result.delta.ops).toEqual([
      { insert: 'Line 1' },
      { insert: '\n', attributes: { header: 2 } },
      { insert: 'Line 2' },
      { insert: '\n' },
    ]);
  });

  it('removes header with null', () => {
    const delta = new Delta().insert('Title').insert('\n', { header: 1 });
    const state = makeState(delta, 0, 5);

    const result = setHeader(state, null);

    expect(result.delta.ops).toEqual([{ insert: 'Title' }, { insert: '\n' }]);
  });

  it('removes header with 0', () => {
    const delta = new Delta().insert('Title').insert('\n', { header: 1 });
    const state = makeState(delta, 0, 5);

    const result = setHeader(state, 0);

    expect(result.delta.ops).toEqual([{ insert: 'Title' }, { insert: '\n' }]);
  });

  it('applies to all lines in multi-line selection', () => {
    const state = makeState(twoLineDoc(), 0, 14);

    const result = setHeader(state, 3);

    expect(result.delta.ops).toEqual([
      { insert: 'Line 1' },
      { insert: '\n', attributes: { header: 3 } },
      { insert: 'Line 2' },
      { insert: '\n', attributes: { header: 3 } },
    ]);
  });

  it('creates undo entry', () => {
    const state = makeState(twoLineDoc(), 0, 0);
    const result = setHeader(state, 1);
    expect(result.history.undoStack).toHaveLength(1);
  });

  it('returns unchanged when no selection', () => {
    const state = createEditorState();
    expect(setHeader(state, 1)).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// toggleBlockquote
// ---------------------------------------------------------------------------

describe('toggleBlockquote', () => {
  it('enables blockquote on current line', () => {
    const state = makeState(twoLineDoc(), 3, 0);

    const result = toggleBlockquote(state);

    expect(result.delta.ops[0]).toEqual({ insert: 'Line 1' });
    expect(result.delta.ops[1]).toEqual({
      insert: '\n',
      attributes: { blockquote: true },
    });
    expect(result.delta.ops[2]).toEqual({ insert: 'Line 2' });
    expect(result.delta.ops[3]).toEqual({ insert: '\n' });
  });

  it('removes blockquote when already active', () => {
    const delta = new Delta().insert('Quote').insert('\n', { blockquote: true });
    const state = makeState(delta, 0, 5);

    const result = toggleBlockquote(state);

    expect(result.delta.ops).toEqual([{ insert: 'Quote' }, { insert: '\n' }]);
  });

  it('applies to all lines when multi-line selection and not all have it', () => {
    const delta = new Delta()
      .insert('Line 1')
      .insert('\n', { blockquote: true })
      .insert('Line 2')
      .insert('\n');
    const state = makeState(delta, 0, 14);

    const result = toggleBlockquote(state);

    // Both lines should get blockquote (not all had it → apply)
    expect(result.delta.ops).toEqual([
      { insert: 'Line 1' },
      { insert: '\n', attributes: { blockquote: true } },
      { insert: 'Line 2' },
      { insert: '\n', attributes: { blockquote: true } },
    ]);
  });
});

// ---------------------------------------------------------------------------
// toggleCodeBlock
// ---------------------------------------------------------------------------

describe('toggleCodeBlock', () => {
  it('enables code-block', () => {
    const state = makeState(twoLineDoc(), 3, 0);

    const result = toggleCodeBlock(state);

    expect(result.delta.ops[1]).toEqual({
      insert: '\n',
      attributes: { 'code-block': true },
    });
  });

  it('enables code-block with language', () => {
    const state = makeState(twoLineDoc(), 3, 0);

    const result = toggleCodeBlock(state, 'javascript');

    expect(result.delta.ops[1]).toEqual({
      insert: '\n',
      attributes: { 'code-block': 'javascript' },
    });
  });

  it('removes code-block when exact language matches', () => {
    const delta = new Delta().insert('code').insert('\n', { 'code-block': 'python' });
    const state = makeState(delta, 0, 4);

    const result = toggleCodeBlock(state, 'python');

    expect(result.delta.ops).toEqual([{ insert: 'code' }, { insert: '\n' }]);
  });

  it('setCodeBlockFenceLanguage rewrites every line of the fence and keeps the id', () => {
    const delta = new Delta()
      .insert('flowchart TD')
      .insert('\n', { 'code-block': 'mermaid-code', 'code-block-id': 'm1' })
      .insert('A --> B')
      .insert('\n', { 'code-block': 'mermaid-code', 'code-block-id': 'm1' })
      .insert('let x = 1')
      .insert('\n', { 'code-block': 'javascript', 'code-block-id': 'j1' });
    const state = makeState(delta, 14, 0);

    const result = setCodeBlockFenceLanguage(state, 'mermaid');

    expect(result.delta.ops).toEqual([
      { insert: 'flowchart TD' },
      { insert: '\n', attributes: { 'code-block': 'mermaid', 'code-block-id': 'm1' } },
      { insert: 'A --> B' },
      { insert: '\n', attributes: { 'code-block': 'mermaid', 'code-block-id': 'm1' } },
      { insert: 'let x = 1' },
      { insert: '\n', attributes: { 'code-block': 'javascript', 'code-block-id': 'j1' } },
    ]);
    expect(result.selection).toEqual({ index: 14, length: 0 });
  });

  it('setCodeBlockFenceLanguage does not add a trailing paragraph', () => {
    const delta = new Delta()
      .insert('A')
      .insert('\n', { 'code-block': 'mermaid-code', 'code-block-id': 'm1' });
    const result = setCodeBlockFenceLanguage(makeState(delta, 0, 0), 'mermaid');

    expect(result.delta.ops).toEqual([
      { insert: 'A' },
      { insert: '\n', attributes: { 'code-block': 'mermaid', 'code-block-id': 'm1' } },
    ]);
  });

  it('setCodeBlockFenceLanguage uses atIndex when the caret is outside the fence', () => {
    const delta = new Delta()
      .insert('A')
      .insert('\n', { 'code-block': 'mermaid-code', 'code-block-id': 'm1' })
      .insert('after')
      .insert('\n');
    const result = setCodeBlockFenceLanguage(makeState(delta, 3, 0), 'mermaid', 0);

    expect(result.delta.ops[1]).toEqual({
      insert: '\n',
      attributes: { 'code-block': 'mermaid', 'code-block-id': 'm1' },
    });
    expect(result.selection).toEqual({ index: 0, length: 0 });
  });

  it('setCodeBlockFenceLanguage leaves a plain paragraph unchanged', () => {
    const state = makeState(twoLineDoc(), 0, 0);
    expect(setCodeBlockFenceLanguage(state, 'mermaid')).toBe(state);
  });

  it('changes language when different language is passed', () => {
    const delta = new Delta().insert('code').insert('\n', { 'code-block': 'python' });
    const state = makeState(delta, 0, 4);

    const result = toggleCodeBlock(state, 'javascript');

    expect(result.delta.ops[1]).toEqual({
      insert: '\n',
      attributes: { 'code-block': 'javascript' },
    });
    expect(result.delta.ops[2]).toEqual({ insert: '\n' });
  });

  it('appends one plain paragraph when the new code block is the document tail', () => {
    const delta = new Delta().insert('code').insert('\n');
    const state = makeState(delta, 4, 0);

    const result = toggleCodeBlock(state);

    expect(result.delta.ops).toEqual([
      { insert: 'code' },
      { insert: '\n', attributes: { 'code-block': true } },
      { insert: '\n' },
    ]);
    expect(result.selection).toEqual({ index: 4, length: 0 });
  });

  it('does not append a paragraph when a line already follows the code block', () => {
    const state = makeState(twoLineDoc(), 3, 0);

    const result = toggleCodeBlock(state);

    expect(result.delta.ops).toEqual([
      { insert: 'Line 1' },
      { insert: '\n', attributes: { 'code-block': true } },
      { insert: 'Line 2' },
      { insert: '\n' },
    ]);
  });

  it('undo drops the code block and the appended paragraph together', () => {
    const delta = new Delta().insert('code').insert('\n');
    const state = makeState(delta, 4, 0);

    const reverted = undo(toggleCodeBlock(state));

    expect(reverted.delta.ops).toEqual([{ insert: 'code\n' }]);
  });

  it('does not stack a second blank paragraph when the tail line is already empty', () => {
    const delta = new Delta().insert('code').insert('\n').insert('\n');
    const state = makeState(delta, 2, 0);

    const result = toggleCodeBlock(state);

    expect(result.delta.ops).toEqual([
      { insert: 'code' },
      { insert: '\n', attributes: { 'code-block': true } },
      { insert: '\n' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// setList
// ---------------------------------------------------------------------------

describe('setList', () => {
  it('sets bullet list', () => {
    const state = makeState(twoLineDoc(), 3, 0);

    const result = setList(state, 'bullet');

    expect(result.delta.ops[1]).toEqual({
      insert: '\n',
      attributes: { list: 'bullet' },
    });
  });

  it('sets ordered list', () => {
    const state = makeState(twoLineDoc(), 3, 0);

    const result = setList(state, 'ordered');

    expect(result.delta.ops[1]).toEqual({
      insert: '\n',
      attributes: { list: 'ordered' },
    });
  });

  it('sets checked list', () => {
    const state = makeState(twoLineDoc(), 3, 0);

    const result = setList(state, 'checked');

    expect(result.delta.ops[1]).toEqual({
      insert: '\n',
      attributes: { list: 'checked' },
    });
  });

  it('removes list with null', () => {
    const delta = new Delta().insert('Item').insert('\n', { list: 'bullet' });
    const state = makeState(delta, 0, 4);

    const result = setList(state, null);

    expect(result.delta.ops).toEqual([{ insert: 'Item' }, { insert: '\n' }]);
  });

  it('applies to multiple lines', () => {
    const state = makeState(twoLineDoc(), 0, 14);

    const result = setList(state, 'ordered');

    expect(result.delta.ops).toEqual([
      { insert: 'Line 1' },
      { insert: '\n', attributes: { list: 'ordered' } },
      { insert: 'Line 2' },
      { insert: '\n', attributes: { list: 'ordered' } },
    ]);
  });

  it('toggles ordered off when the line is already ordered', () => {
    const delta = new Delta().insert('1.').insert('\n', { list: 'ordered' });
    const state = makeState(delta, 2, 0);

    const result = setList(state, 'ordered');

    expect(result.delta.ops).toEqual([{ insert: '1.' }, { insert: '\n' }]);
  });

  it('keeps ordered when markdown shortcut passes toggle: false', () => {
    const delta = new Delta().insert('\n', { list: 'ordered' });
    const state = makeState(delta, 0, 0);

    const result = setList(state, 'ordered', { toggle: false });

    expect(result.delta.ops).toEqual([{ insert: '\n', attributes: { list: 'ordered' } }]);
  });

  it('stores a non-1 shortcut marker as list-start', () => {
    const state = makeState(new Delta().insert('Item\n'), 0, 0);

    const result = setList(state, 'ordered', { toggle: false, start: 2 });

    expect(result.delta.ops[1]).toEqual({
      insert: '\n',
      attributes: { list: 'ordered', 'list-start': 2 },
    });
  });

  it('does not restart an item that is already ordered', () => {
    const delta = new Delta().insert('4.').insert('\n', { list: 'ordered' });
    const state = makeState(delta, 2, 0);

    const result = setList(state, 'ordered', { toggle: false, start: 4 });

    expect(result.delta.ops).toEqual([
      { insert: '4.' },
      { insert: '\n', attributes: { list: 'ordered' } },
    ]);
  });
});

// ---------------------------------------------------------------------------
// increaseIndent / decreaseIndent
// ---------------------------------------------------------------------------

describe('increaseIndent', () => {
  it('sets indent to 1 when no indent', () => {
    const state = makeState(twoLineDoc(), 3, 0);

    const result = increaseIndent(state);

    expect(result.delta.ops[1]).toEqual({
      insert: '\n',
      attributes: { indent: 1 },
    });
  });

  it('increments existing indent', () => {
    const delta = new Delta().insert('Item').insert('\n', { indent: 2 });
    const state = makeState(delta, 0, 4);

    const result = increaseIndent(state);

    expect(result.delta.ops[1]).toEqual({
      insert: '\n',
      attributes: { indent: 3 },
    });
  });

  it('does not exceed max indent (8)', () => {
    const delta = new Delta().insert('Item').insert('\n', { indent: 8 });
    const state = makeState(delta, 0, 4);

    const result = increaseIndent(state);

    // Should stay at 8 — no change applied
    expect(result.delta.ops[1]).toEqual({
      insert: '\n',
      attributes: { indent: 8 },
    });
  });

  it('Tab at end of a list item nests that item, not the next', () => {
    const delta = new Delta()
      .insert('123')
      .insert('\n', { list: 'ordered' })
      .insert('\n', { list: 'ordered' });
    const state = makeState(delta, 3, 0); // "1. 123|"

    const result = increaseIndent(state);

    expect(result.delta.ops).toEqual([
      { insert: '123' },
      { insert: '\n', attributes: { list: 'ordered', indent: 1 } },
      { insert: '\n', attributes: { list: 'ordered' } },
    ]);
  });

  it('Tab at the start of the next list item still nests that item', () => {
    const delta = new Delta()
      .insert('123')
      .insert('\n', { list: 'ordered' })
      .insert('\n', { list: 'ordered' });
    const state = makeState(delta, 4, 0); // empty "2. |"

    const result = increaseIndent(state);

    expect(result.delta.ops).toEqual([
      { insert: '123' },
      { insert: '\n', attributes: { list: 'ordered' } },
      { insert: '\n', attributes: { list: 'ordered', indent: 1 } },
    ]);
  });
});

describe('decreaseIndent', () => {
  it('decreases indent by 1', () => {
    const delta = new Delta().insert('Item').insert('\n', { indent: 3 });
    const state = makeState(delta, 0, 4);

    const result = decreaseIndent(state);

    expect(result.delta.ops[1]).toEqual({
      insert: '\n',
      attributes: { indent: 2 },
    });
  });

  it('removes indent when at 1', () => {
    const delta = new Delta().insert('Item').insert('\n', { indent: 1 });
    const state = makeState(delta, 0, 4);

    const result = decreaseIndent(state);

    expect(result.delta.ops).toEqual([{ insert: 'Item' }, { insert: '\n' }]);
  });

  it('does nothing when no indent', () => {
    const state = makeState(twoLineDoc(), 3, 0);

    const result = decreaseIndent(state);

    // No change — indent was already 0
    expect(result.delta.ops).toEqual(state.delta.ops);
  });

  it('Shift+Tab at end of a nested list item outdents that item, not the next', () => {
    const delta = new Delta()
      .insert('123')
      .insert('\n', { list: 'ordered', indent: 1 })
      .insert('\n', { list: 'ordered' });
    const state = makeState(delta, 3, 0);

    const result = decreaseIndent(state);

    expect(result.delta.ops).toEqual([
      { insert: '123' },
      { insert: '\n', attributes: { list: 'ordered' } },
      { insert: '\n', attributes: { list: 'ordered' } },
    ]);
  });
});

// ---------------------------------------------------------------------------
// setAlign
// ---------------------------------------------------------------------------

describe('setAlign', () => {
  it('sets center alignment', () => {
    const state = makeState(twoLineDoc(), 3, 0);

    const result = setAlign(state, 'center');

    expect(result.delta.ops[1]).toEqual({
      insert: '\n',
      attributes: { align: 'center' },
    });
  });

  it('sets right alignment', () => {
    const state = makeState(twoLineDoc(), 3, 0);

    const result = setAlign(state, 'right');

    expect(result.delta.ops[1]).toEqual({
      insert: '\n',
      attributes: { align: 'right' },
    });
  });

  it('removes alignment with null', () => {
    const delta = new Delta().insert('Text').insert('\n', { align: 'center' });
    const state = makeState(delta, 0, 4);

    const result = setAlign(state, null);

    expect(result.delta.ops).toEqual([{ insert: 'Text' }, { insert: '\n' }]);
  });

  it('treats "left" as null (remove)', () => {
    const delta = new Delta().insert('Text').insert('\n', { align: 'center' });
    const state = makeState(delta, 0, 4);

    const result = setAlign(state, 'left');

    expect(result.delta.ops).toEqual([{ insert: 'Text' }, { insert: '\n' }]);
  });

  it('creates undo entry', () => {
    const state = makeState(twoLineDoc(), 3, 0);
    const result = setAlign(state, 'center');
    expect(result.history.undoStack).toHaveLength(1);
  });

  it('returns unchanged when no selection', () => {
    const state = createEditorState();
    expect(setAlign(state, 'center')).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// toggleTextIndent
// ---------------------------------------------------------------------------

describe('toggleTextIndent', () => {
  it('indents the current line when caret is at line start (not the line above)', () => {
    const delta = new Delta().insert('Line 1\nLine 2\n');
    const state = makeState(delta, 7, 0); // start of "Line 2"

    const result = toggleTextIndent(state);

    expect(newlineAttrAt(result.delta, 6)?.[SCRIDER_TEXT_INDENT_KEY]).toBeUndefined();
    expect(newlineAttrAt(result.delta, 13)?.[SCRIDER_TEXT_INDENT_KEY]).toBe(
      DEFAULT_SCRIDER_TEXT_INDENT,
    );
  });

  it('caret on a lone paragraph \\n still indents the line below', () => {
    const delta = new Delta().insert('Line 1\nLine 2\n');
    const state = makeState(delta, 6, 0); // on the \\n after "Line 1"

    const result = toggleTextIndent(state);

    expect(newlineAttrAt(result.delta, 6)?.[SCRIDER_TEXT_INDENT_KEY]).toBeUndefined();
    expect(newlineAttrAt(result.delta, 13)?.[SCRIDER_TEXT_INDENT_KEY]).toBe(
      DEFAULT_SCRIDER_TEXT_INDENT,
    );
  });

  it('indents empty line between double newlines', () => {
    const delta = new Delta().insert('A\n\nB\n');
    const state = makeState(delta, 2, 0); // on the empty line's `\n`

    const result = toggleTextIndent(state);

    expect(newlineAttrAt(result.delta, 1)?.[SCRIDER_TEXT_INDENT_KEY]).toBeUndefined();
    expect(newlineAttrAt(result.delta, 2)?.[SCRIDER_TEXT_INDENT_KEY]).toBe(
      DEFAULT_SCRIDER_TEXT_INDENT,
    );
  });

  it('indents last paragraph when caret is in its text', () => {
    const delta = new Delta().insert('First\nLast line\n');
    const state = makeState(delta, 7, 0); // "L" of "Last line"

    const result = toggleTextIndent(state);

    expect(newlineAttrAt(result.delta, 5)?.[SCRIDER_TEXT_INDENT_KEY]).toBeUndefined();
    expect(newlineAttrAt(result.delta, 15)?.[SCRIDER_TEXT_INDENT_KEY]).toBe(
      DEFAULT_SCRIDER_TEXT_INDENT,
    );
  });

  it('sets scrider-text-indent on plain paragraph', () => {
    const delta = new Delta().insert('Body').insert('\n', { align: 'justify' });
    const state = makeState(delta, 0, 4);

    const result = toggleTextIndent(state);

    expect(result.delta.ops[1]).toEqual({
      insert: '\n',
      attributes: { align: 'justify', [SCRIDER_TEXT_INDENT_KEY]: DEFAULT_SCRIDER_TEXT_INDENT },
    });
  });

  it('removes scrider-text-indent when all affected plain lines have it', () => {
    const delta = new Delta()
      .insert('A')
      .insert('\n', { [SCRIDER_TEXT_INDENT_KEY]: DEFAULT_SCRIDER_TEXT_INDENT })
      .insert('B')
      .insert('\n', { [SCRIDER_TEXT_INDENT_KEY]: '35.45pt' });
    const state = makeState(delta, 0, delta.length() - 1);

    const result = toggleTextIndent(state);

    expect(result.delta.ops).toEqual([
      { insert: 'A' },
      { insert: '\n' },
      { insert: 'B' },
      { insert: '\n' },
    ]);
  });

  it('indents headings and body, skips list lines in selection', () => {
    const delta = new Delta()
      .insert('Title')
      .insert('\n', { header: 1 })
      .insert('Item')
      .insert('\n', { list: 'bullet' })
      .insert('Body')
      .insert('\n');
    const state = makeState(delta, 0, delta.length() - 1);

    const result = toggleTextIndent(state);

    const bodyNl = result.delta.ops[5];
    expect(bodyNl).toEqual({
      insert: '\n',
      attributes: { [SCRIDER_TEXT_INDENT_KEY]: DEFAULT_SCRIDER_TEXT_INDENT },
    });
    const titleNl = result.delta.ops[1];
    const listNl = result.delta.ops[3];
    expect(titleNl).toEqual({
      insert: '\n',
      attributes: { header: 1, [SCRIDER_TEXT_INDENT_KEY]: DEFAULT_SCRIDER_TEXT_INDENT },
    });
    expect(listNl).toEqual({ insert: '\n', attributes: { list: 'bullet' } });
  });

  it('toggles indent on a heading line', () => {
    const delta = new Delta().insert('H').insert('\n', { header: 2 });
    const on = toggleTextIndent(makeState(delta, 0, 0), '2cm');
    expect(on.delta.ops[1]).toEqual({
      insert: '\n',
      attributes: { header: 2, [SCRIDER_TEXT_INDENT_KEY]: '2cm' },
    });
    const off = toggleTextIndent({ ...on, selection: { index: 0, length: 0 } });
    expect(off.delta.ops[1]).toEqual({ insert: '\n', attributes: { header: 2 } });
  });

  it('returns unchanged when selection is only list lines', () => {
    const delta = new Delta().insert('I').insert('\n', { list: 'bullet' });
    const state = makeState(delta, 0, 2);

    expect(toggleTextIndent(state)).toBe(state);
  });

  it('creates undo entry', () => {
    const delta = new Delta().insert('Text').insert('\n');
    const state = makeState(delta, 0, 4);
    const result = toggleTextIndent(state);
    expect(result.history.undoStack).toHaveLength(1);
  });

  it('undo restores paragraph without indent', () => {
    const delta = new Delta().insert('Text').insert('\n');
    const state = makeState(delta, 0, 4);
    const after = toggleTextIndent(state);
    const entry = after.history.undoStack[0]!;
    const undone = compose(after.delta, entry.changeDelta);
    expect(undone.ops).toEqual(delta.ops);
  });
});

// ---------------------------------------------------------------------------
// setLineSpacing
// ---------------------------------------------------------------------------

describe('setLineSpacing', () => {
  it('sets scrider-line-height on a plain paragraph', () => {
    const delta = new Delta().insert('Body').insert('\n');
    const state = makeState(delta, 0, 0);

    const result = setLineSpacing(state, '2');

    expect(newlineAttrAt(result.delta, 4)?.['scrider-line-height']).toBe('2');
  });

  it('switches 1.5 → 2 → 1.15 on the same line', () => {
    const delta = new Delta().insert('Body').insert('\n', { 'scrider-line-height': '1.5' });
    const first = setLineSpacing(makeState(delta, 0, 0), '2');
    expect(newlineAttrAt(first.delta, 4)?.['scrider-line-height']).toBe('2');

    const second = setLineSpacing(makeState(first.delta, 0, 0), '1.15');
    expect(newlineAttrAt(second.delta, 4)?.['scrider-line-height']).toBe('1.15');
  });

  it('clears scrider-line-height on Inherit (null)', () => {
    const delta = new Delta().insert('Body').insert('\n', { 'scrider-line-height': '2' });
    const result = setLineSpacing(makeState(delta, 0, 0), null);
    expect(newlineAttrAt(result.delta, 4)?.['scrider-line-height']).toBeUndefined();
  });

  it('skips headings', () => {
    const delta = new Delta().insert('Title').insert('\n', { header: 2 });
    const state = makeState(delta, 0, 0);
    expect(setLineSpacing(state, '2')).toBe(state);
  });
});
