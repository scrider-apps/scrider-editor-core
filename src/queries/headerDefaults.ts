/**
 * Default font and font-size mapping for heading blocks (h1-h6):
 * header font/size detection and size-grid presets.
 *
 * The Delta model encodes a heading as a line-level attribute (`header: N`
 * on the trailing `\n`); font and font-size are inline attributes on text
 * ops. When a heading has NO explicit `size`/`font` on its text, the
 * browser renders it via CSS rules, and the toolbar dropdowns historically
 * showed their fallback labels ("System" / "12") because there was nothing
 * in Delta to match.
 *
 * This file is the **single source of truth** for default heading sizes.
 * Four named presets are provided (`scrider` / `google` / `word` /
 * `browser`); the active preset is consulted by:
 *
 *   1. `EditorStore.getToolbarSnapshot` — to inject the visually-rendered
 *      size into `formats.size` (display only) so the dropdown lights up
 *      the right option.
 *
 *   2. `ScriderEditor.renderToDOM` — to set CSS variables
 *      `--scrider-h1-size`...`--scrider-h6-size` on the root, which the
 *      stylesheet then applies via `font-size: var(--scrider-h1-size)`.
 *
 * CSS variable defaults in the `@scrider/editor-react` stylesheet
 * (`.scrider-content h1`-`h6`) must stay in sync with `scrider` (the default
 * preset).
 */

export type HeaderLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type HeaderSizeMap = Readonly<Record<HeaderLevel, string>>;
export type HeaderSizePresetName = 'scrider' | 'google' | 'word' | 'browser' | 'githubEm';

/** Heading margin/decoration preset (CSS-only, Settings → editor presentation). */
export type HeadingDecorationPreset = 'none' | 'scrider' | 'github' | 'llm' | 'lage';

/**
 * Named size-grid presets. Each preset is a frozen map level → pt-string.
 *
 * Choosing rationale:
 *   - `scrider`  — bold "web/marketing" sizes (visible hierarchy at H1-H3).
 *   - `google`   — Google Docs (compact, document-style).
 *   - `word`     — MS Word default Title/Heading 1-6.
 *   - `browser`  — classic HTML5 default at 12pt base.
 *   - `githubEm`   — GitHub README/GFM heading scale (2em…0.85em at 16px → pt).
 *
 * IMPORTANT: every value in every preset MUST appear as a `formatValue` in
 * the fontSize dropdown options (`toolbarKeys.ts:DROPDOWN_KEYS.fontSize`),
 * otherwise the toolbar fails to detect the rendered size. The
 * `toolbarKeys.test.ts` "fontSize covers presets" test enforces this.
 */
export const HEADER_SIZE_PRESETS: Readonly<Record<HeaderSizePresetName, HeaderSizeMap>> =
  Object.freeze({
    scrider: Object.freeze({
      1: '32pt',
      2: '24pt',
      3: '20pt',
      4: '18pt',
      5: '16pt',
      6: '14pt',
    }),
    google: Object.freeze({
      1: '26pt',
      2: '20pt',
      3: '16pt',
      4: '14pt',
      5: '12pt',
      6: '11pt',
    }),
    word: Object.freeze({
      1: '22pt',
      2: '18pt',
      3: '16pt',
      4: '14pt',
      5: '12pt',
      6: '12pt',
    }),
    browser: Object.freeze({
      1: '24pt',
      2: '18pt',
      3: '14pt',
      4: '12pt',
      5: '10pt',
      6: '8pt',
    }),
    githubEm: Object.freeze({
      1: '32pt',
      2: '24pt',
      3: '20pt',
      4: '16pt',
      5: '14pt',
      6: '14pt',
    }),
  });

/**
 * Default preset name. The editor stylesheet ships with the same
 * numbers hard-coded as fallback so an editor with no preset prop still
 * renders correctly.
 */
export const DEFAULT_HEADER_SIZE_PRESET: HeaderSizePresetName = 'scrider';

/**
 * Backward-compatible alias for callers that just want "the default
 * heading sizes" (e.g. `EditorStore` enrichment when no preset prop
 * was passed). Equivalent to `HEADER_SIZE_PRESETS.scrider`.
 *
 * @deprecated Prefer `HEADER_SIZE_PRESETS[preset]` so the value follows
 *   the user-selected preset. Kept for old call sites that don't know
 *   about presets yet.
 */
export const HEADER_DEFAULT_SIZES: HeaderSizeMap = HEADER_SIZE_PRESETS[DEFAULT_HEADER_SIZE_PRESET];

/**
 * Base body font size — the rendered size when no inline `size`
 * attribute is set and the document has no `defaultFontSize`
 * (see `RecognizeFontSizeSettings.baseFontSize`).
 *
 * Used by toolbar enrichment: if a preset's heading-default size equals
 * this base, we **skip** injection — the visual result is the same as
 * having no `size` attribute.
 */
export const BASE_FONT_SIZE_PT = '12pt';

/**
 * True if `level` is a valid heading level (1..6). Convenience guard for
 * callers reading `attrs.header` (typed as `unknown` in `AttributeMap`).
 */
export function isHeaderLevel(level: unknown): level is HeaderLevel {
  return typeof level === 'number' && Number.isInteger(level) && level >= 1 && level <= 6;
}

/**
 * Look up the size for a given heading level under the chosen preset.
 * Returns `null` if the level is out of range (defensive — Delta level
 * is always validated by `setHeader` to be 1..6, but a third-party
 * Delta may not be). Falls back to the default preset when `preset` is
 * omitted, so existing callers keep working unchanged.
 */
export function getHeaderSize(
  level: unknown,
  preset: HeaderSizePresetName = DEFAULT_HEADER_SIZE_PRESET,
): string | null {
  if (!isHeaderLevel(level)) return null;
  return HEADER_SIZE_PRESETS[preset]?.[level] ?? null;
}

/**
 * @deprecated Use {@link getHeaderSize} which accepts a preset.
 * Equivalent to `getHeaderSize(level)` (default preset).
 */
export function getHeaderDefaultSize(level: unknown): string | null {
  return getHeaderSize(level);
}
