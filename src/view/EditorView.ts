import type { SelectionRange } from '../state/SelectionRange';

/**
 * Abstract interface for the editor's DOM view layer.
 *
 * `editor-core` is DOM-free; this interface is the contract that
 * `@scrider/editor-react` (or any other UI adapter) must implement.
 */
export interface EditorView {
  /** Get the current HTML content of the editor. */
  getHTML(): string;

  /** Set the HTML content of the editor. */
  setHTML(html: string): void;

  /** Get the current selection / cursor position. */
  getSelection(): SelectionRange | null;

  /** Set the selection / cursor position. */
  setSelection(index: number, length: number): void;

  /** Focus the editor. */
  focus(): void;

  /** Blur (unfocus) the editor. */
  blur(): void;
}
