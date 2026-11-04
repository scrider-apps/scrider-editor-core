/**
 * Abstract bridge for converting between HTML character offsets and Delta offsets.
 *
 * - `StringBridge` (this package): pure string-based, no DOM dependency.
 * - `DomBridge` (`@scrider/editor-react`): works with real DOM nodes.
 *
 * HTML offset = character position in the raw HTML string (including tags).
 * Delta index = logical character position in the Delta document (tags skipped, entities = 1 char).
 */
export interface SelectionBridge {
  /**
   * Convert an HTML string offset to a Delta character index.
   * Tags are skipped, HTML entities count as 1 character,
   * self-closing embed tags (img, br, hr) count as 1 Delta character.
   */
  htmlOffsetToDeltaIndex(html: string, offset: number): number;

  /**
   * Convert a Delta character index to an HTML string offset.
   * Inverse of `htmlOffsetToDeltaIndex`.
   */
  deltaIndexToHtmlOffset(html: string, index: number): number;
}
