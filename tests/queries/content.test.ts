import { describe, it, expect } from 'vitest';
import { Delta } from '@scrider/delta';

import { getPlainText, getLength, getContents } from '../../src/queries';
import { createEditorState } from '../../src/state';

describe('getPlainText', () => {
  it('returns text from simple document', () => {
    const delta = new Delta().insert('Hello World\n');
    const state = createEditorState({ delta });

    expect(getPlainText(state)).toBe('Hello World\n');
  });

  it('strips formatting attributes', () => {
    const delta = new Delta()
      .insert('Hello', { bold: true })
      .insert(' ')
      .insert('World', { italic: true })
      .insert('\n');
    const state = createEditorState({ delta });

    expect(getPlainText(state)).toBe('Hello World\n');
  });

  it('skips embed inserts', () => {
    const delta = new Delta().insert('Before').insert({ image: 'photo.png' }).insert('After\n');
    const state = createEditorState({ delta });

    expect(getPlainText(state)).toBe('BeforeAfter\n');
  });

  it('returns single newline for empty document', () => {
    const state = createEditorState();

    expect(getPlainText(state)).toBe('\n');
  });

  it('handles multiple lines', () => {
    const delta = new Delta().insert('Line 1').insert('\n').insert('Line 2').insert('\n');
    const state = createEditorState({ delta });

    expect(getPlainText(state)).toBe('Line 1\nLine 2\n');
  });
});

describe('getLength', () => {
  it('returns correct length for text', () => {
    const delta = new Delta().insert('Hello\n');
    const state = createEditorState({ delta });

    expect(getLength(state)).toBe(6);
  });

  it('counts embeds as 1', () => {
    const delta = new Delta().insert('Hi').insert({ image: 'photo.png' }).insert('\n');
    const state = createEditorState({ delta });

    // "Hi" (2) + image (1) + "\n" (1) = 4
    expect(getLength(state)).toBe(4);
  });

  it('returns 1 for empty document (just newline)', () => {
    const state = createEditorState();

    expect(getLength(state)).toBe(1);
  });
});

describe('getContents', () => {
  it('returns full document when no arguments', () => {
    const delta = new Delta().insert('Hello\n');
    const state = createEditorState({ delta });

    const result = getContents(state);
    expect(result.ops).toEqual(delta.ops);
  });

  it('returns slice from index to end', () => {
    const delta = new Delta().insert('Hello').insert('\n');
    const state = createEditorState({ delta });

    const result = getContents(state, 3);
    expect(result.ops).toEqual([{ insert: 'lo\n' }]);
  });

  it('returns slice for index + length', () => {
    const delta = new Delta().insert('Hello World').insert('\n');
    const state = createEditorState({ delta });

    const result = getContents(state, 6, 5);
    expect(result.ops).toEqual([{ insert: 'World' }]);
  });

  it('preserves attributes in slice', () => {
    const delta = new Delta().insert('Hello', { bold: true }).insert(' World').insert('\n');
    const state = createEditorState({ delta });

    const result = getContents(state, 0, 5);
    expect(result.ops).toEqual([{ insert: 'Hello', attributes: { bold: true } }]);
  });
});
