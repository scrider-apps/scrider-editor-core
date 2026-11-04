import type { KeyBinding } from './types';

/**
 * Default keyboard shortcuts.
 *
 * Order matters — first match wins in `matchKeyBinding`.
 * More specific bindings (with more modifiers) should come first.
 */
export const defaultKeyMap: readonly KeyBinding[] = [
  // Inline formatting
  { key: 'b', ctrl: true, command: 'toggleBold' },
  { key: 'i', ctrl: true, command: 'toggleItalic' },
  { key: 'u', ctrl: true, command: 'toggleUnderline' },
  { key: 'e', ctrl: true, command: 'toggleCode' },

  // History
  { key: 'z', ctrl: true, shift: true, command: 'redo' },
  { key: 'y', ctrl: true, command: 'redo' },
  { key: 'z', ctrl: true, command: 'undo' },

  // Selection
  { key: 'a', ctrl: true, command: 'selectAll' },

  // Structural
  { key: 'Enter', ctrl: true, command: 'exitBlock' },
  // Shift+Enter inserts a soft line break embed inside the current block.
  // The matcher requires modifiers to match exactly, so
  // this binding does NOT shadow the plain Enter → splitBlock binding
  // below; both coexist deterministically.
  //
  // NB: in the React layer this command is routed via the browser-driven
  // path (native `insertLineBreak` → htmlToDelta → softBreak embed), so
  // the React key handler performs an early-return for this
  // command without `preventDefault`. The binding is kept here as the
  // canonical (and programmatically reusable) Delta-side fallback.
  { key: 'Enter', shift: true, command: 'insertSoftBreak' },
  { key: 'Enter', command: 'splitBlock' },
  { key: 'Backspace', command: 'deleteBackward' },
  { key: 'Delete', command: 'deleteForward' },

  // Indent
  { key: 'Tab', shift: true, command: 'decreaseIndent' },
  { key: 'Tab', command: 'increaseIndent' },
];
