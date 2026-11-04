import type { AttributeMap } from '@scrider/delta';

/**
 * Settings for toolbar font-family recognition.
 * `knownFamilies` are concrete dropdown values (not System / null).
 */
export interface RecognizeFontFamilySettings {
  /** Canonical family names from the font dropdown (e.g. `"Inter"`, `"Arial"`). */
  knownFamilies: readonly string[];
}

/** CSS generic / system UI families — not useful as a toolbar face label. */
const GENERIC_OR_SYSTEM_FONTS = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
  '-apple-system',
  'blinkmacsystemfont',
  'segoe ui',
  'segoe ui emoji',
  'segoe ui symbol',
  'apple color emoji',
  'noto color emoji',
]);

/** CSS-wide keywords sometimes pasted as literal `font-family` / shorthand. */
const CSS_WIDE_KEYWORDS = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);

/** Split a CSS `font-family` list into individual family tokens. */
function splitFontFamilyList(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let depth = 0;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') {
      depth++;
      current += ch;
      continue;
    }
    if (ch === ')') {
      depth = Math.max(0, depth - 1);
      current += ch;
      continue;
    }
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function stripFontQuotes(family: string): string {
  const t = family.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function isSkippableFontFamily(family: string): boolean {
  if (!family) return true;
  const lower = family.toLowerCase();
  if (CSS_WIDE_KEYWORDS.has(lower)) return true;
  if (/^var\s*\(/i.test(family)) return true;
  if (GENERIC_OR_SYSTEM_FONTS.has(lower)) return true;
  if (family.startsWith('-')) return true;
  return false;
}

/**
 * Resolve the effective font family for toolbar display.
 *
 * - No inline `font` → `null` (System).
 * - Exact match against {@link RecognizeFontFamilySettings.knownFamilies} → that name.
 * - CSS stack (paste) → first known family in the stack.
 * - Unknown custom family → first non-generic token (face shows it; may not match an option).
 */
export function recognizeFontFamily(
  formats: AttributeMap,
  settings: RecognizeFontFamilySettings,
): string | null {
  const raw = formats.font;
  if (typeof raw !== 'string' || raw.trim() === '') return null;

  const byLower = new Map<string, string>();
  for (const family of settings.knownFamilies) {
    byLower.set(family.toLowerCase(), family);
  }

  const trimmed = raw.trim();
  const direct = byLower.get(trimmed.toLowerCase());
  if (direct) return direct;

  let firstConcrete: string | null = null;
  for (const token of splitFontFamilyList(trimmed)) {
    const family = stripFontQuotes(token);
    if (isSkippableFontFamily(family)) continue;
    if (firstConcrete == null) firstConcrete = family;
    const match = byLower.get(family.toLowerCase());
    if (match) return match;
  }

  return firstConcrete;
}
