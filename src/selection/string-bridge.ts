import type { SelectionBridge } from './types';

/**
 * Set of self-closing (void) HTML elements that represent
 * an embed in Delta (each counts as 1 Delta character).
 */
const VOID_ELEMENTS = new Set([
  'img',
  'br',
  'hr',
  'input',
  'embed',
  'source',
  'wbr',
  'area',
  'col',
  'track',
]);

/** Named HTML entities → decoded single character. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00A0',
};

/**
 * Decode a single HTML entity reference (without the leading `&` and trailing `;`).
 * Supports named entities (&amp; &lt; &gt; &quot; &apos; &nbsp;)
 * and numeric entities (&#123; &#x1A;).
 * Returns the decoded character, or the raw entity string if unknown.
 */
function decodeEntity(entity: string): string {
  if (entity.startsWith('#')) {
    const code =
      entity.startsWith('#x') || entity.startsWith('#X')
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
    return Number.isNaN(code) ? `&${entity};` : String.fromCodePoint(code);
  }
  return NAMED_ENTITIES[entity] ?? `&${entity};`;
}

/**
 * Extract the tag name from an opening/closing/self-closing tag.
 * e.g. `<strong class="x">` → `strong`, `</em>` → `em`, `<br/>` → `br`
 */
function getTagName(tag: string): string {
  const match = /^<\/?([a-zA-Z][a-zA-Z0-9-]*)/.exec(tag);
  return match?.[1]?.toLowerCase() ?? '';
}

/**
 * Check if a tag string represents a self-closing void element.
 */
function isVoidTag(tag: string): boolean {
  return VOID_ELEMENTS.has(getTagName(tag));
}

// ---------------------------------------------------------------------------
// StringBridge
// ---------------------------------------------------------------------------

/**
 * Pure string-based implementation of SelectionBridge.
 *
 * Parses HTML as a string (no DOM), skipping tags and decoding entities.
 * Self-closing void elements (img, br, hr) count as 1 Delta character.
 *
 * Limitations:
 * - Does not handle malformed HTML gracefully.
 * - Does not handle CDATA, comments, or processing instructions.
 * - Nested attribute quotes with `>` inside may confuse the tag parser.
 */
export class StringBridge implements SelectionBridge {
  htmlOffsetToDeltaIndex(html: string, offset: number): number {
    let deltaIndex = 0;
    let i = 0;

    while (i < html.length && i < offset) {
      if (html[i] === '<') {
        // Find the end of the tag
        const tagEnd = html.indexOf('>', i);
        if (tagEnd === -1) break; // malformed — stop

        const tag = html.slice(i, tagEnd + 1);
        if (isVoidTag(tag)) {
          deltaIndex += 1; // void element = 1 embed character
        }
        // Skip the entire tag (opening, closing, or self-closing)
        i = tagEnd + 1;
      } else if (html[i] === '&') {
        // HTML entity
        const semiIdx = html.indexOf(';', i);
        if (semiIdx === -1 || semiIdx - i > 10) {
          // Not a valid entity — treat as literal '&'
          deltaIndex += 1;
          i += 1;
        } else {
          const decoded = decodeEntity(html.slice(i + 1, semiIdx));
          deltaIndex += decoded.length;
          i = semiIdx + 1;
        }
      } else {
        deltaIndex += 1;
        i += 1;
      }
    }

    return deltaIndex;
  }

  deltaIndexToHtmlOffset(html: string, index: number): number {
    let deltaIndex = 0;
    let i = 0;

    while (i < html.length) {
      if (html[i] === '<') {
        const tagEnd = html.indexOf('>', i);
        if (tagEnd === -1) break;

        const tag = html.slice(i, tagEnd + 1);
        if (isVoidTag(tag)) {
          // Void element occupies this delta position
          if (deltaIndex === index) return i;
          deltaIndex += 1;
        }
        i = tagEnd + 1;
        continue;
      }

      // Text character or entity — check if we've reached the target delta index
      if (deltaIndex === index) return i;

      if (html[i] === '&') {
        const semiIdx = html.indexOf(';', i);
        if (semiIdx === -1 || semiIdx - i > 10) {
          deltaIndex += 1;
          i += 1;
        } else {
          const decoded = decodeEntity(html.slice(i + 1, semiIdx));
          deltaIndex += decoded.length;
          i = semiIdx + 1;
        }
      } else {
        deltaIndex += 1;
        i += 1;
      }
    }

    return i;
  }
}
