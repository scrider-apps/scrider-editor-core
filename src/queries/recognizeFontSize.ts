import type { AttributeMap } from '@scrider/delta';

import {
  BASE_FONT_SIZE_PT,
  getHeaderSize,
  isHeaderLevel,
  type HeaderSizePresetName,
} from './headerDefaults';

/** Settings that influence implicit (Auto) font-size recognition. */
export interface RecognizeFontSizeSettings {
  /** Active size-grid preset from Settings / host (Scrider when Auto-only). */
  headerSizePreset: HeaderSizePresetName;
  /**
   * Document body size (`scrider-metadata.defaultFontSize`, e.g. `14pt`).
   * Omitted → {@link BASE_FONT_SIZE_PT}. Headings ignore it: their size comes
   * from the preset grid.
   */
  baseFontSize?: string;
}

/**
 * Resolve the effective font size for toolbar display when inline `size`
 * is absent (Auto). Body text → document size or {@link BASE_FONT_SIZE_PT};
 * headings → preset grid or Scrider implicit defaults.
 *
 * Explicit inline `size` in Delta is returned as-is.
 */
const CSS_WIDE_SIZE_KEYWORDS = new Set([
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
  'medium',
  'smaller',
  'larger',
]);

export function recognizeFontSize(
  formats: AttributeMap,
  settings: RecognizeFontSizeSettings,
): string {
  const explicit = formats.size;
  if (typeof explicit === 'string' && explicit !== '') {
    // Rise/Articulate paste often stamps `font: inherit` → size "inherit".
    // Treat as Auto rather than showing the keyword in the toolbar face.
    if (CSS_WIDE_SIZE_KEYWORDS.has(explicit.trim().toLowerCase())) {
      // fall through to Auto resolution below
    } else {
      return explicit;
    }
  }

  const base = settings.baseFontSize || BASE_FONT_SIZE_PT;
  const headerLevel = formats.header;
  if (!isHeaderLevel(headerLevel)) {
    return base;
  }

  return getHeaderSize(headerLevel, settings.headerSizePreset) ?? base;
}
