import { describe, it, expect } from 'vitest';
import { Delta } from '@scrider/delta';

import { createEditorState } from '../../src/state';
import { getPlainText } from '../../src/queries';
import { replaceMatch, replaceAllMatches } from '../../src/commands/findReplace';

describe('findReplace commands', () => {
  it('replaceMatch swaps one range', () => {
    const state = createEditorState({
      delta: new Delta().insert('foo bar\n'),
      selection: { index: 0, length: 0 },
    });
    const next = replaceMatch(state, { index: 4, length: 3 }, 'baz');
    expect(getPlainText(next)).toBe('foo baz\n');
    expect(next.selection).toEqual({ index: 7, length: 0 });
  });

  it('replaceAllMatches replaces every occurrence', () => {
    const state = createEditorState({ delta: new Delta().insert('aa aa\n') });
    const next = replaceAllMatches(state, 'aa', 'b');
    expect(getPlainText(next)).toBe('b b\n');
  });
});
