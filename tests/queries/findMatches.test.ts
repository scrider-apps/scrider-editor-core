import { describe, it, expect } from 'vitest';
import { Delta } from '@scrider/delta';

import { createEditorState } from '../../src/state';
import {
  buildPlainTextIndexMap,
  findMatches,
  findMatchIndexAtOrAfter,
  plainRangeToDeltaMatch,
} from '../../src/queries';

describe('findMatches', () => {
  it('finds all case-insensitive occurrences', () => {
    const delta = new Delta().insert('Hello hello\n');
    const state = createEditorState({ delta });
    const matches = findMatches(state, 'HEL');
    expect(matches).toEqual([
      { index: 0, length: 3 },
      { index: 6, length: 3 },
    ]);
  });

  it('returns empty for empty query', () => {
    const state = createEditorState({ delta: new Delta().insert('abc\n') });
    expect(findMatches(state, '')).toEqual([]);
  });

  it('skips plain matches split by an embed', () => {
    const delta = new Delta().insert('ab').insert({ image: 'x.png' }).insert('ab\n');
    const map = buildPlainTextIndexMap(delta);
    expect(map.text).toBe('abab\n');
    expect(plainRangeToDeltaMatch(map, 0, 4)).toBeNull();
    expect(findMatches(createEditorState({ delta }), 'abab')).toEqual([]);
    expect(findMatches(createEditorState({ delta }), 'ab')).toEqual([
      { index: 0, length: 2 },
      { index: 3, length: 2 },
    ]);
  });

  it('findMatchIndexAtOrAfter picks the next match', () => {
    const matches = [
      { index: 0, length: 1 },
      { index: 5, length: 1 },
      { index: 10, length: 1 },
    ];
    expect(findMatchIndexAtOrAfter(matches, 0)).toBe(0);
    expect(findMatchIndexAtOrAfter(matches, 6)).toBe(2);
    expect(findMatchIndexAtOrAfter(matches, 99)).toBe(0);
  });
});
