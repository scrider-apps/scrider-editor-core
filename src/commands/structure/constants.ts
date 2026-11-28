import { defaultBlockFormats } from '@scrider/formatter';

/** Block attributes NOT inherited by the new line on splitBlock. */
export const NON_INHERITABLE: ReadonlySet<string> = new Set([
  'header',
  'list-start',
  // Box belongs to the level-0 title, not to the line Enter splits off.
  'accordion-width',
  'accordion-float',
  // Quiz box and the reader's attempt stay on the line that owns them.
  'quiz-width',
  'quiz-float',
  'quiz-pick',
  'quiz-phase',
  'quiz-limit',
  'quiz-time',
  // Dialog and Voice box stays on the title, not on the line Enter opens.
  'dialog-width',
  'dialog-float',
  'voice-width',
  'voice-float',
  // SoundBox: every line keeps the id, the sound and the rest stay on the first line.
  'soundbox-src',
  'soundbox-model',
  'soundbox-voice',
  'soundbox-lang',
  'soundbox-hash',
  'soundbox-width',
  'soundbox-float',
]);

/**
 * Interactive plates: every key the formatter schema registers for an accordion,
 * quiz, dialog, voice or soundbox line (role, box, attempt, language, model, voice…).
 */
const PLATE_BLOCK_FORMATS: readonly string[] = defaultBlockFormats
  .map((format) => format.name)
  .filter((name) => /^(accordion|quiz|dialog|voice|soundbox)(-|$)/.test(name));

/**
 * All recognised block-level attribute names. Ctrl+Enter clears them from the
 * new line, and they never become inline marks.
 */
export const BLOCK_FORMATS: readonly string[] = [
  'header',
  'blockquote',
  'code-block',
  'code-block-id',
  'code-block-width',
  'code-block-float',
  'code-block-height',
  'list',
  'list-start',
  'indent',
  'align',
  ...PLATE_BLOCK_FORMATS,
];

/**
 * Block attrs stripped by Backspace at line start before merging with the line above.
 *
 * `code-block` / `code-block-id` are intentionally excluded: Backspace at the
 * start of a fenced line must NOT eject content out of the fence (edit-mode
 * mermaid/code). Merge within the same fence is handled separately in
 * `deleteBackward`; at the fence boundary Backspace is a no-op.
 */
export const BACKSPACE_DEDENT_KEYS: readonly string[] = [
  'header',
  'blockquote',
  'list',
  'list-start',
  'indent',
  'align',
  'scrider-text-indent',
  'scrider-line-height',
  'scrider-margin-after',
  'scrider-margin-before',
];
