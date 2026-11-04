import type { InputRule } from './types';

/**
 * Default input rules — markdown-like shortcuts at the start of a line.
 *
 * Order matters — first match wins in `matchInputRule`.
 */
export const defaultInputRules: readonly InputRule[] = [
  // Headers: # … ######
  { pattern: /^######\s$/, command: 'setHeader', args: [6] },
  { pattern: /^#####\s$/, command: 'setHeader', args: [5] },
  { pattern: /^####\s$/, command: 'setHeader', args: [4] },
  { pattern: /^###\s$/, command: 'setHeader', args: [3] },
  { pattern: /^##\s$/, command: 'setHeader', args: [2] },
  { pattern: /^#\s$/, command: 'setHeader', args: [1] },

  // Lists — GFM task markers before generic `- ` / `* `, else those fire first.
  // `toggle: false`: shortcuts apply the list; they must not undo a line that
  // is already a list (Chrome auto-continues `<ol>` after Ctrl+Enter).
  { pattern: /^[-*+] \[x]\s$/i, command: 'setList', args: ['checked', { toggle: false }] },
  { pattern: /^[-*+] \[ ]\s$/, command: 'setList', args: ['unchecked', { toggle: false }] },
  { pattern: /^[-*+] \[]\s$/, command: 'setList', args: ['unchecked', { toggle: false }] },
  { pattern: /^[-*]\s$/, command: 'setList', args: ['bullet', { toggle: false }] },
  { pattern: /^\d+\.\s$/, command: 'setList', args: ['ordered', { toggle: false }] },
  { pattern: /^\[]\s$/, command: 'setList', args: ['unchecked', { toggle: false }] },
  { pattern: /^\[x]\s$/i, command: 'setList', args: ['checked', { toggle: false }] },

  // Blockquote
  { pattern: /^>\s$/, command: 'toggleBlockquote' },

  // Divider: --- + Space (consistent with other rules)
  { pattern: /^---\s$/, command: 'insertBlock', args: [{ divider: true }] },
];
