import { describe, it, expect } from 'vitest';

describe('@scrider/editor-core — smoke test', () => {
  it('exports all public API symbols', async () => {
    const mod = await import('../src/index.js');

    // State
    expect(mod.createEditorState).toBeTypeOf('function');
    expect(mod.createHistoryState).toBeTypeOf('function');
    expect(mod.defaultEditorConfig).toBeDefined();
    expect(mod.defaultHistoryConfig).toBeDefined();
    expect(mod.pushUndo).toBeTypeOf('function');
    expect(mod.popUndo).toBeTypeOf('function');
    expect(mod.popRedo).toBeTypeOf('function');
    expect(mod.pushRedo).toBeTypeOf('function');

    // Queries
    expect(mod.getActiveFormats).toBeTypeOf('function');
    expect(mod.isFormatActive).toBeTypeOf('function');
    expect(mod.getPlainText).toBeTypeOf('function');
    expect(mod.getLength).toBeTypeOf('function');
    expect(mod.getContents).toBeTypeOf('function');
    expect(mod.canUndo).toBeTypeOf('function');
    expect(mod.canRedo).toBeTypeOf('function');

    // Selection Bridge
    expect(mod.StringBridge).toBeTypeOf('function');

    // Inline Commands (13)
    expect(mod.toggleBold).toBeTypeOf('function');
    expect(mod.toggleItalic).toBeTypeOf('function');
    expect(mod.toggleUnderline).toBeTypeOf('function');
    expect(mod.toggleStrike).toBeTypeOf('function');
    expect(mod.toggleCode).toBeTypeOf('function');
    expect(mod.toggleMark).toBeTypeOf('function');
    expect(mod.toggleSubscript).toBeTypeOf('function');
    expect(mod.toggleSuperscript).toBeTypeOf('function');
    expect(mod.toggleKbd).toBeTypeOf('function');
    expect(mod.setColor).toBeTypeOf('function');
    expect(mod.setBackground).toBeTypeOf('function');
    expect(mod.setLink).toBeTypeOf('function');
    expect(mod.removeFormat).toBeTypeOf('function');

    // Block Commands (7)
    expect(mod.setHeader).toBeTypeOf('function');
    expect(mod.toggleBlockquote).toBeTypeOf('function');
    expect(mod.toggleCodeBlock).toBeTypeOf('function');
    expect(mod.setList).toBeTypeOf('function');
    expect(mod.increaseIndent).toBeTypeOf('function');
    expect(mod.decreaseIndent).toBeTypeOf('function');
    expect(mod.setAlign).toBeTypeOf('function');

    // Structural Commands (6)
    expect(mod.splitBlock).toBeTypeOf('function');
    expect(mod.deleteBackward).toBeTypeOf('function');
    expect(mod.deleteForward).toBeTypeOf('function');
    expect(mod.insertText).toBeTypeOf('function');
    expect(mod.insertEmbed).toBeTypeOf('function');
    expect(mod.insertBlock).toBeTypeOf('function');

    // History Commands (2)
    expect(mod.undo).toBeTypeOf('function');
    expect(mod.redo).toBeTypeOf('function');

    // Clipboard Commands (3)
    expect(mod.prepareCopy).toBeTypeOf('function');
    expect(mod.handlePaste).toBeTypeOf('function');
    expect(mod.handleCut).toBeTypeOf('function');

    // Registry
    expect(mod.defaultCommands).toBeDefined();
    expect(mod.executeCommand).toBeTypeOf('function');

    // KeyMap
    expect(mod.defaultKeyMap).toBeDefined();
    expect(mod.matchKeyBinding).toBeTypeOf('function');

    // InputRules
    expect(mod.defaultInputRules).toBeDefined();
    expect(mod.matchInputRule).toBeTypeOf('function');
  });
});
