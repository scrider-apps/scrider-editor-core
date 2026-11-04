/** Block attributes NOT inherited by the new line on splitBlock. */
export const NON_INHERITABLE: ReadonlySet<string> = new Set([
  'header',
  'list-start',
  // Box belongs to the level-0 title, not to the line Enter splits off.
  'accordion-width',
  'accordion-float',
]);

/** All recognised block-level attribute names. */
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
  'accordion',
  'accordion-collapsed',
  'accordion-body',
  'accordion-width',
  'accordion-float',
  'quiz-id',
  'quiz-role',
  'quiz-view',
  'dialog-id',
  'dialog-role',
  'dialog-view',
  'voice-id',
  'voice-role',
  'voice-view',
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
