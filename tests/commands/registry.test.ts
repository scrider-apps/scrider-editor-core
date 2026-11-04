import { describe, it, expect, vi } from 'vitest';
import { Delta } from '@scrider/delta';

import { defaultCommands, executeCommand } from '../../src/commands/registry';
import { isCommandResult } from '../../src/commands/types';
import { createEditorState } from '../../src/state';
import type { EditorState } from '../../src/state';
import type { Command, CommandResult } from '../../src/commands/types';

function makeState(): EditorState {
  return createEditorState({
    delta: new Delta().insert('Hello\n'),
    selection: { index: 0, length: 5 },
  });
}

describe('defaultCommands', () => {
  it('contains the built-in commands', () => {
    const expected = [
      // Inline
      'toggleBold',
      'toggleItalic',
      'toggleUnderline',
      'toggleStrike',
      'toggleCode',
      'toggleMark',
      'toggleSubscript',
      'toggleSuperscript',
      'toggleKbd',
      'setColor',
      'setBackground',
      'setLink',
      'removeFormat',
      // Block
      'setHeader',
      'toggleBlockquote',
      'toggleCodeBlock',
      'setList',
      'increaseIndent',
      'decreaseIndent',
      'setAlign',
      // Structural
      'splitBlock',
      'deleteBackward',
      'deleteForward',
      'insertText',
      'insertEmbed',
      'insertSoftBreak',
      'insertBlock',
      'insertContentsList',
      'selectAll',
      // History
      'undo',
      'redo',
    ];

    for (const name of expected) {
      expect(defaultCommands).toHaveProperty(name);
      expect(typeof defaultCommands[name]).toBe('function');
    }
  });

  it('has exactly 36 commands', () => {
    expect(Object.keys(defaultCommands)).toHaveLength(36);
  });

  it('has no extension-package commands', () => {
    for (const name of ['toggleAccordion', 'insertQuiz', 'setDialogView', 'setVoiceView']) {
      expect(defaultCommands).not.toHaveProperty(name);
    }
  });
});

describe('executeCommand', () => {
  it('executes a pure command and wraps result in CommandResult', () => {
    const state = makeState();
    const result = executeCommand(defaultCommands, 'toggleBold', state);

    expect(result).not.toBeNull();
    expect(result!.state).toBeDefined();
    expect(result!.state).not.toBe(state);
    expect(result!.sideEffect).toBeUndefined();
  });

  it('returns null for non-existent command', () => {
    const state = makeState();
    const result = executeCommand(defaultCommands, 'nonExistent', state);
    expect(result).toBeNull();
  });

  it('passes extra args to the command', () => {
    const state = makeState();
    const result = executeCommand(defaultCommands, 'setHeader', state, 2);

    expect(result).not.toBeNull();
    expect(result!.state.delta).toBeDefined();
  });

  it('works with extended pure commands', () => {
    const custom: Command = (s) => ({ ...s, storedMarks: { custom: true } });
    const commands = { ...defaultCommands, myCustom: custom };

    const state = makeState();
    const result = executeCommand(commands, 'myCustom', state);

    expect(result).not.toBeNull();
    expect(result!.state.storedMarks).toEqual({ custom: true });
  });

  it('handles side-effect command returning CommandResult', () => {
    const sideEffectFn = vi.fn();
    const sideEffectCmd: Command = (s) => ({
      state: s,
      sideEffect: sideEffectFn,
    });
    const commands = { ...defaultCommands, exportPdf: sideEffectCmd };

    const state = makeState();
    const result = executeCommand(commands, 'exportPdf', state);

    expect(result).not.toBeNull();
    expect(result!.state).toBe(state);
    expect(result!.sideEffect).toBe(sideEffectFn);
    expect(sideEffectFn).not.toHaveBeenCalled();
  });

  it('side effect can be executed by caller after state is applied', () => {
    const sideEffectFn = vi.fn();
    const sideEffectCmd: Command = (s) => ({
      state: s,
      sideEffect: sideEffectFn,
    });
    const commands = { exportPdf: sideEffectCmd };

    const state = makeState();
    const result = executeCommand(commands, 'exportPdf', state)!;

    void result.sideEffect?.();
    expect(sideEffectFn).toHaveBeenCalledOnce();
  });
});

describe('isCommandResult', () => {
  it('returns true for CommandResult', () => {
    const state = makeState();
    const cr: CommandResult = { state };
    expect(isCommandResult(cr)).toBe(true);
  });

  it('returns false for plain EditorState', () => {
    const state = makeState();
    expect(isCommandResult(state)).toBe(false);
  });

  it('returns true for CommandResult with sideEffect', () => {
    const state = makeState();
    const cr: CommandResult = { state, sideEffect: () => {} };
    expect(isCommandResult(cr)).toBe(true);
  });
});
