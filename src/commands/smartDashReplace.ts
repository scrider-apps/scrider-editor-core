import { Delta, compose, invert, isTextInsert } from '@scrider/delta';

import type { EditorState } from '../state/EditorState';
import { pushUndo } from '../state/HistoryState';
import { buildPlainTextIndexMap, plainRangeToDeltaMatch } from '../queries/textIndexMap';

export type SmartDashMode = 'academic' | 'literary';

/** Space or non-breaking space (edge of spaced dash). */
const EDGE = '[ \\u00A0]';

const ACADEMIC_REPLACEMENT = '\u00A0\u2013\u00A0';
const LITERARY_REPLACEMENT = ' \u2014 ';

export type SpacedDashSpan = {
  plainStart: number;
  plainLength: number;
  replacement: string;
};

type PlainRange = { start: number; end: number };

/**
 * Markdown inline `` `code` `` spans (inclusive of delimiter backticks).
 * Spaced-dash replacement must not touch content inside these ranges.
 */
export function findBacktickCodeRanges(text: string): PlainRange[] {
  const ranges: PlainRange[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '`') {
      i += 1;
      continue;
    }
    if (i > 0 && text[i - 1] === '\\') {
      i += 1;
      continue;
    }
    const open = i;
    i += 1;
    while (i < text.length) {
      if (text[i] === '`' && text[i - 1] !== '\\') break;
      i += 1;
    }
    ranges.push({ start: open, end: i < text.length ? i + 1 : text.length });
    if (i < text.length) i += 1;
  }
  return ranges;
}

/** Opening/closing quote pairs (typographic and ASCII). */
const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["'", "'"],
  ['"', '"'],
  ['\u2018', '\u2019'], // ‘ ’
  ['\u201C', '\u201D'], // “ ”
  ['\u00AB', '\u00BB'], // « »
  ['\u201E', '\u201D'], // „ ”
];

function isEscapedAt(text: string, index: number): boolean {
  return index > 0 && text[index - 1] === '\\';
}

/**
 * Spans inside paired quotes (delimiters included). Spaced-dash replacement skips these.
 */
export function findQuotedRanges(text: string): PlainRange[] {
  const ranges: PlainRange[] = [];
  let i = 0;
  while (i < text.length) {
    if (isEscapedAt(text, i)) {
      i += 1;
      continue;
    }

    let advanced = false;
    for (const [open, close] of QUOTE_PAIRS) {
      if (!text.startsWith(open, i)) continue;

      const start = i;
      i += open.length;
      let closeAt = -1;
      for (let j = i; j < text.length; j++) {
        if (isEscapedAt(text, j)) continue;
        if (text.startsWith(close, j)) {
          closeAt = j;
          break;
        }
      }

      if (closeAt === -1) {
        ranges.push({ start, end: text.length });
        i = text.length;
      } else {
        ranges.push({ start, end: closeAt + close.length });
        i = closeAt + close.length;
      }
      advanced = true;
      break;
    }

    if (!advanced) i += 1;
  }
  return ranges;
}

function findProtectedPlainRanges(text: string): PlainRange[] {
  return [...findBacktickCodeRanges(text), ...findQuotedRanges(text)];
}

function spanOverlapsRange(span: SpacedDashSpan, range: PlainRange): boolean {
  const spanEnd = span.plainStart + span.plainLength;
  return span.plainStart < range.end && spanEnd > range.start;
}

/** True when [index, index+length) overlaps any `{ code: true }` text insert. */
function deltaRangeOverlapsCodeAttribute(delta: Delta, index: number, length: number): boolean {
  if (length <= 0) return false;
  const end = index + length;
  let pos = 0;
  for (const op of delta.ops) {
    if (!isTextInsert(op)) {
      pos += 1;
      continue;
    }
    const opEnd = pos + op.insert.length;
    if (op.attributes?.code === true) {
      if (index < opEnd && end > pos) return true;
    }
    pos = opEnd;
  }
  return false;
}

/** Collect non-overlapping plain-text spans to replace (longest match wins on overlap). */
export function findSpacedDashSpans(text: string, mode: SmartDashMode): SpacedDashSpan[] {
  const protectedRanges = findProtectedPlainRanges(text);
  const patterns: { re: RegExp; replacement: string }[] =
    mode === 'academic'
      ? [
          { re: new RegExp(`${EDGE}-${EDGE}`, 'g'), replacement: ACADEMIC_REPLACEMENT },
          { re: new RegExp(`${EDGE}\u2014${EDGE}`, 'g'), replacement: ACADEMIC_REPLACEMENT },
        ]
      : [
          { re: new RegExp(`${EDGE}-${EDGE}`, 'g'), replacement: LITERARY_REPLACEMENT },
          { re: new RegExp(`${EDGE}\u2013${EDGE}`, 'g'), replacement: LITERARY_REPLACEMENT },
        ];

  const raw: SpacedDashSpan[] = [];
  for (const { re, replacement } of patterns) {
    for (const m of text.matchAll(re)) {
      if (m.index === undefined) continue;
      if (m[0] === replacement) continue;
      const span: SpacedDashSpan = {
        plainStart: m.index,
        plainLength: m[0].length,
        replacement,
      };
      if (protectedRanges.some((r) => spanOverlapsRange(span, r))) continue;
      raw.push(span);
    }
  }

  raw.sort((a, b) => a.plainStart - b.plainStart || b.plainLength - a.plainLength);

  const merged: SpacedDashSpan[] = [];
  let end = 0;
  for (const span of raw) {
    if (span.plainStart < end) continue;
    merged.push(span);
    end = span.plainStart + span.plainLength;
  }
  return merged;
}

export type DeltaReplacement = {
  index: number;
  length: number;
  replacement: string;
};

export function spacedDashSpansToDeltaReplacements(
  delta: Delta,
  mode: SmartDashMode,
): DeltaReplacement[] {
  const map = buildPlainTextIndexMap(delta);
  const spans = findSpacedDashSpans(map.text, mode);
  const out: DeltaReplacement[] = [];

  for (const span of spans) {
    const dm = plainRangeToDeltaMatch(map, span.plainStart, span.plainLength);
    if (!dm) continue;
    if (deltaRangeOverlapsCodeAttribute(delta, dm.index, dm.length)) continue;
    out.push({
      index: dm.index,
      length: dm.length,
      replacement: span.replacement,
    });
  }

  return out.sort((a, b) => a.index - b.index);
}

export function countSmartDashReplacements(state: EditorState, mode: SmartDashMode): number {
  return spacedDashSpansToDeltaReplacements(state.delta, mode).length;
}

/**
 * Replace spaced hyphens/en-dashes/em-dashes document-wide (single undo step).
 */
export function applySmartDashReplace(state: EditorState, mode: SmartDashMode): EditorState {
  const { delta, history, config, selection } = state;
  const replacements = spacedDashSpansToDeltaReplacements(delta, mode);
  if (replacements.length === 0) return state;

  let change = new Delta();
  let pos = 0;
  for (const r of replacements) {
    if (r.index > pos) change = change.retain(r.index - pos);
    change = change.delete(r.length).insert(r.replacement);
    pos = r.index + r.length;
  }
  const tail = delta.length() - pos;
  if (tail > 0) change = change.retain(tail);

  const newDelta = compose(delta, change);
  const inverseDelta = invert(change, delta);

  return {
    ...state,
    delta: newDelta,
    selection,
    storedMarks: null,
    history: pushUndo(history, inverseDelta, selection, config.history),
  };
}
