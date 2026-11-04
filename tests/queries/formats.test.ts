import { describe, it, expect } from 'vitest';
import { Delta } from '@scrider/delta';

import { getActiveFormats, isFormatActive } from '../../src/queries';
import { createEditorState } from '../../src/state';
import type { EditorState } from '../../src/state';

/** Helper: create state with given delta, selection, and optional storedMarks. */
function makeState(
  delta: Delta,
  index: number,
  length: number,
  storedMarks?: Record<string, unknown> | null,
): EditorState {
  const state = createEditorState({ delta, selection: { index, length } });
  if (storedMarks !== undefined) {
    return { ...state, storedMarks: storedMarks };
  }
  return state;
}

// ---------------------------------------------------------------------------
// getActiveFormats
// ---------------------------------------------------------------------------

describe('getActiveFormats', () => {
  it('returns empty object when no selection', () => {
    const state = createEditorState();
    expect(getActiveFormats(state)).toEqual({});
  });

  it('returns inline format at caret position (char before caret)', () => {
    // "Hello" with bold, then newline
    const delta = new Delta().insert('Hello', { bold: true }).insert('\n');
    const state = makeState(delta, 3, 0); // caret inside "Hello"

    expect(getActiveFormats(state)).toEqual(expect.objectContaining({ bold: true }));
  });

  it('returns inline formats from char after caret at position 0', () => {
    const delta = new Delta().insert('Hello', { bold: true }).insert('\n');
    const state = makeState(delta, 0, 0);

    // At position 0 there's no char before caret, so look forward
    const formats = getActiveFormats(state);
    expect(formats.bold).toBe(true);
  });

  it('returns block format at caret position', () => {
    const delta = new Delta().insert('Title').insert('\n', { header: 2 });
    const state = makeState(delta, 3, 0); // caret inside "Title"

    expect(getActiveFormats(state)).toEqual(expect.objectContaining({ header: 2 }));
  });

  it('merges inline and block formats at caret', () => {
    const delta = new Delta().insert('Title', { bold: true }).insert('\n', { header: 1 });
    const state = makeState(delta, 3, 0);

    const formats = getActiveFormats(state);
    expect(formats.bold).toBe(true);
    expect(formats.header).toBe(1);
  });

  it('returns intersection of inline formats for selection', () => {
    const delta = new Delta()
      .insert('Hel', { bold: true, italic: true })
      .insert('lo', { bold: true })
      .insert('\n');
    const state = makeState(delta, 0, 5); // select "Hello"

    const formats = getActiveFormats(state);
    expect(formats.bold).toBe(true);
    expect(formats.italic).toBeUndefined(); // not on all chars
  });

  it('storedMarks override inferred formats', () => {
    const delta = new Delta().insert('Hello', { bold: true }).insert('\n');
    const state = makeState(delta, 3, 0, { bold: null, italic: true });

    const formats = getActiveFormats(state);
    expect(formats.bold).toBeUndefined(); // removed by storedMarks
    expect(formats.italic).toBe(true); // added by storedMarks
  });

  it('storedMarks add formats to selection result', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    const state = makeState(delta, 0, 5, { bold: true });

    const formats = getActiveFormats(state);
    expect(formats.bold).toBe(true);
  });

  it('returns font for selection with font attribute', () => {
    const delta = new Delta().insert('Hello', { font: 'Georgia' }).insert('\n');
    const state = makeState(delta, 0, 5);

    const formats = getActiveFormats(state);
    expect(formats.font).toBe('Georgia');
  });

  it('returns size for selection with size attribute', () => {
    const delta = new Delta().insert('Hello', { size: '18pt' }).insert('\n');
    const state = makeState(delta, 0, 5);

    const formats = getActiveFormats(state);
    expect(formats.size).toBe('18pt');
  });

  it('returns font from char before caret (collapsed selection)', () => {
    const delta = new Delta().insert('Hello', { font: 'Arial' }).insert('\n');
    const state = makeState(delta, 3, 0);

    const formats = getActiveFormats(state);
    expect(formats.font).toBe('Arial');
  });

  it('returns font and size from storedMarks', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    const state = makeState(delta, 3, 0, { font: 'Inter', size: '24pt' });

    const formats = getActiveFormats(state);
    expect(formats.font).toBe('Inter');
    expect(formats.size).toBe('24pt');
  });
});

// ---------------------------------------------------------------------------
// isFormatActive
// ---------------------------------------------------------------------------

describe('isFormatActive', () => {
  it('returns true when entire selection has the format', () => {
    const delta = new Delta().insert('Hello', { bold: true }).insert('\n');

    expect(isFormatActive(delta, { index: 0, length: 5 }, 'bold')).toBe(true);
  });

  it('returns false when only part of selection has the format', () => {
    const delta = new Delta().insert('Hel', { bold: true }).insert('lo').insert('\n');

    expect(isFormatActive(delta, { index: 0, length: 5 }, 'bold')).toBe(false);
  });

  it('returns false when selection has no format', () => {
    const delta = new Delta().insert('Hello').insert('\n');

    expect(isFormatActive(delta, { index: 0, length: 5 }, 'bold')).toBe(false);
  });

  it('skips newline ops when checking inline format', () => {
    // "Hello\n" — "Hello" is bold, \n is not
    const delta = new Delta().insert('Hello', { bold: true }).insert('\n');

    // Select "Hello\n" — should still be true (ignores \n for inline check)
    expect(isFormatActive(delta, { index: 0, length: 6 }, 'bold')).toBe(true);
  });

  it('returns true at position 0 when char after caret has the format', () => {
    const delta = new Delta().insert('Hello', { bold: true }).insert('\n');

    // At position 0, look forward — 'H' is bold
    expect(isFormatActive(delta, { index: 0, length: 0 }, 'bold')).toBe(true);
  });

  it('checks char before caret for length=0 selection', () => {
    const delta = new Delta().insert('Hello', { bold: true }).insert('\n');

    // Caret at position 3 — char before is 'l' (bold)
    expect(isFormatActive(delta, { index: 3, length: 0 }, 'bold')).toBe(true);
  });

  it('returns false for caret after non-formatted text', () => {
    const delta = new Delta().insert('Hello').insert('\n');

    expect(isFormatActive(delta, { index: 3, length: 0 }, 'bold')).toBe(false);
  });

  it('works with block format on \\n ops', () => {
    const delta = new Delta().insert('Title').insert('\n', { header: 2 });

    // Select includes the \n — header is on \n, not on text
    // isFormatActive checks non-\n text, so header won't be found on text ops
    expect(isFormatActive(delta, { index: 0, length: 5 }, 'header')).toBe(false);
  });

  it('returns false when selection has no text ops (only newlines)', () => {
    const delta = new Delta().insert('\n').insert('\n');

    expect(isFormatActive(delta, { index: 0, length: 2 }, 'bold')).toBe(false);
  });
});
