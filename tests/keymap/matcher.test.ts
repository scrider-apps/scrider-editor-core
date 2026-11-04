import { describe, it, expect } from 'vitest';

import { matchKeyBinding } from '../../src/keymap/matcher';
import { defaultKeyMap } from '../../src/keymap/defaults';
import type { KeyEvent, KeyBinding } from '../../src/keymap/types';

/** Helper: build a KeyEvent. Unset modifiers default to false. */
function key(
  k: string,
  mods?: Partial<Pick<KeyEvent, 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>>,
): KeyEvent {
  return {
    key: k,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...mods,
  };
}

describe('matchKeyBinding — defaultKeyMap', () => {
  it('Ctrl+B → toggleBold', () => {
    const result = matchKeyBinding(key('b', { ctrlKey: true }), defaultKeyMap);
    expect(result?.command).toBe('toggleBold');
  });

  it('Ctrl+I → toggleItalic', () => {
    const result = matchKeyBinding(key('i', { ctrlKey: true }), defaultKeyMap);
    expect(result?.command).toBe('toggleItalic');
  });

  it('Ctrl+U → toggleUnderline', () => {
    const result = matchKeyBinding(key('u', { ctrlKey: true }), defaultKeyMap);
    expect(result?.command).toBe('toggleUnderline');
  });

  it('Ctrl+E → toggleCode', () => {
    const result = matchKeyBinding(key('e', { ctrlKey: true }), defaultKeyMap);
    expect(result?.command).toBe('toggleCode');
  });

  it('Ctrl+Shift+Z → redo (not undo)', () => {
    const result = matchKeyBinding(key('z', { ctrlKey: true, shiftKey: true }), defaultKeyMap);
    expect(result?.command).toBe('redo');
  });

  it('Ctrl+Y → redo', () => {
    const result = matchKeyBinding(key('y', { ctrlKey: true }), defaultKeyMap);
    expect(result?.command).toBe('redo');
  });

  it('Ctrl+Z → undo', () => {
    const result = matchKeyBinding(key('z', { ctrlKey: true }), defaultKeyMap);
    expect(result?.command).toBe('undo');
  });

  it('Enter → splitBlock', () => {
    const result = matchKeyBinding(key('Enter'), defaultKeyMap);
    expect(result?.command).toBe('splitBlock');
  });

  it('Shift+Enter → insertSoftBreak', () => {
    const result = matchKeyBinding(key('Enter', { shiftKey: true }), defaultKeyMap);
    expect(result?.command).toBe('insertSoftBreak');
  });

  it('Ctrl+Enter → exitBlock (Shift+Enter binding does not shadow it)', () => {
    const result = matchKeyBinding(key('Enter', { ctrlKey: true }), defaultKeyMap);
    expect(result?.command).toBe('exitBlock');
  });

  it('Ctrl+Shift+Enter → null (no binding; matcher requires exact modifier set)', () => {
    const result = matchKeyBinding(key('Enter', { ctrlKey: true, shiftKey: true }), defaultKeyMap);
    expect(result).toBeNull();
  });

  it('Backspace → deleteBackward', () => {
    const result = matchKeyBinding(key('Backspace'), defaultKeyMap);
    expect(result?.command).toBe('deleteBackward');
  });

  it('Delete → deleteForward', () => {
    const result = matchKeyBinding(key('Delete'), defaultKeyMap);
    expect(result?.command).toBe('deleteForward');
  });

  it('Tab → increaseIndent', () => {
    const result = matchKeyBinding(key('Tab'), defaultKeyMap);
    expect(result?.command).toBe('increaseIndent');
  });

  it('Shift+Tab → decreaseIndent', () => {
    const result = matchKeyBinding(key('Tab', { shiftKey: true }), defaultKeyMap);
    expect(result?.command).toBe('decreaseIndent');
  });

  it('plain letter "a" → null', () => {
    const result = matchKeyBinding(key('a'), defaultKeyMap);
    expect(result).toBeNull();
  });
});

describe('matchKeyBinding — edge cases', () => {
  it('empty keymap → null', () => {
    const result = matchKeyBinding(key('b', { ctrlKey: true }), []);
    expect(result).toBeNull();
  });

  it('case-insensitive key match', () => {
    const result = matchKeyBinding(key('B', { ctrlKey: true }), defaultKeyMap);
    expect(result?.command).toBe('toggleBold');
  });

  it('custom keymap works', () => {
    const custom: KeyBinding[] = [{ key: 'k', ctrl: true, command: 'myCustom', args: [42] }];
    const result = matchKeyBinding(key('k', { ctrlKey: true }), custom);
    expect(result?.command).toBe('myCustom');
    expect(result?.args).toEqual([42]);
  });

  it('first match wins (priority by order)', () => {
    const bindings: KeyBinding[] = [
      { key: 'x', ctrl: true, command: 'first' },
      { key: 'x', ctrl: true, command: 'second' },
    ];
    const result = matchKeyBinding(key('x', { ctrlKey: true }), bindings);
    expect(result?.command).toBe('first');
  });
});
