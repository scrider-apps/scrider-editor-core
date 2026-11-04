/**
 * Cursor position / selection range in Delta offset space.
 * index = start offset, length = 0 means caret with no selection.
 */
export interface SelectionRange {
  readonly index: number;
  readonly length: number;
}
