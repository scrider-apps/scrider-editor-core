import { compose, invert, isInsert, isTextInsert } from '@scrider/delta';
import type { AttributeMap, Delta, Op } from '@scrider/delta';
import { Delta as DeltaClass } from '@scrider/delta';
import { slugifyWithDedup } from '@scrider/formatter';

import type { EditorState } from '../state/EditorState';
import { pushUndo } from '../state/HistoryState';

const MAX_TOC_INDENT = 4;
const CONTENTS_LIST_MAX_LEVEL = 3;

export const TOC_TOP_ID = 'toc';
export const TOC_BOTTOM_ID = 'toc-bottom';
export const TOC_HEADING_TEXT = 'Table of contents';

export type TocPlacement = 'off' | 'top' | 'bottom' | 'both';

export interface HeadingAnchor {
  readonly lineStart: number;
  readonly newlineIndex: number;
  readonly level: number;
  readonly text: string;
  readonly id: string;
  readonly customId: boolean;
}

export interface ApplyTableOfContentsResult {
  readonly delta: Delta;
  readonly changed: boolean;
}

interface DocumentLine {
  readonly lineStart: number;
  readonly newlineIndex: number;
  readonly attrs: AttributeMap;
}

function rawNewlineAttrs(
  op: { insert: string; attributes?: AttributeMap },
  newlineCharIndex: number,
): AttributeMap {
  if (op.insert[newlineCharIndex] !== '\n') return {};
  const attrs = op.attributes ?? {};
  if (newlineCharIndex === 0 || /^\n+$/.test(op.insert)) return attrs;
  for (let j = newlineCharIndex + 1; j < op.insert.length; j++) {
    if (op.insert[j] === '\n') return {};
  }
  return attrs;
}

function listDocumentLines(delta: Delta): DocumentLine[] {
  const lines: DocumentLine[] = [];
  let pos = 0;
  let lineStart = 0;

  for (const op of delta.ops) {
    if (isTextInsert(op)) {
      for (let i = 0; i < op.insert.length; i++) {
        if (op.insert[i] === '\n') {
          lines.push({
            lineStart,
            newlineIndex: pos + i,
            attrs: rawNewlineAttrs(op, i),
          });
          lineStart = pos + i + 1;
        }
      }
      pos += op.insert.length;
      continue;
    }
    if (isInsert(op)) {
      pos += 1;
      lineStart = pos;
    }
  }

  return lines;
}

function linePlainText(delta: Delta, lineStart: number, newlineIndex: number): string {
  if (lineStart >= newlineIndex) return '';
  let text = '';
  for (const op of delta.slice(lineStart, newlineIndex).ops) {
    if (isTextInsert(op)) text += op.insert;
  }
  return text;
}

function headerLevel(attrs: AttributeMap): number | null {
  const raw = attrs.header;
  return typeof raw === 'number' && raw >= 1 && raw <= 6 ? raw : null;
}

function isTocChromeId(id: string): boolean {
  return id === TOC_TOP_ID || id === TOC_BOTTOM_ID;
}

/**
 * Headings in document order. Custom `header-id` wins; otherwise GitHub slug
 * with the same dedup rules as formatter `anchorLinks`.
 */
export function collectHeadingAnchors(delta: Delta): HeadingAnchor[] {
  const usedSlugs = new Map<string, number>();
  const result: HeadingAnchor[] = [];

  for (const line of listDocumentLines(delta)) {
    const level = headerLevel(line.attrs);
    if (level == null) continue;

    const text = linePlainText(delta, line.lineStart, line.newlineIndex);
    const custom = line.attrs['header-id'];
    const customId = typeof custom === 'string' && custom.length > 0 ? custom : null;
    const id = customId ?? slugifyWithDedup(text, usedSlugs);
    if (!id) continue;

    result.push({
      lineStart: line.lineStart,
      newlineIndex: line.newlineIndex,
      level,
      text,
      id,
      customId: customId != null,
    });
  }

  return result;
}

/** Hash targets from inline `link` attrs (`#getting-started`, not draft `#`). */
export function collectHeadingLinkTargets(ops: readonly Op[]): Set<string> {
  const targets = new Set<string>();
  for (const op of ops) {
    if (!isInsert(op)) continue;
    const href = op.attributes?.link;
    if (typeof href !== 'string') continue;
    const id = parseDocumentHashHref(href);
    if (id) targets.add(id);
  }
  return targets;
}

/** `#slug` / `#caf%C3%A9…` → decoded id. External URLs and draft `#` → null. */
export function parseDocumentHashHref(href: string): string | null {
  const value = href.trim();
  if (value.length < 2 || !value.startsWith('#') || value.includes('://')) return null;
  try {
    return decodeURIComponent(value.slice(1));
  } catch {
    return value.slice(1);
  }
}

function isHashLinkListLine(delta: Delta, line: DocumentLine): boolean {
  if (line.attrs.list == null) return false;
  const slice = delta.slice(line.lineStart, line.newlineIndex);
  let hasText = false;
  for (const op of slice.ops) {
    if (!isTextInsert(op) || op.insert.length === 0) {
      if (isInsert(op) && !isTextInsert(op)) return false;
      continue;
    }
    hasText = true;
    const href = op.attributes?.link;
    if (typeof href !== 'string' || parseDocumentHashHref(href) == null) return false;
  }
  return hasText;
}

function isEmptyParagraph(delta: Delta, line: DocumentLine): boolean {
  if (headerLevel(line.attrs) != null) return false;
  if (line.attrs.list != null) return false;
  if (line.attrs.blockquote != null || line.attrs['code-block'] != null) return false;
  return linePlainText(delta, line.lineStart, line.newlineIndex).length === 0;
}

function findTocRegion(delta: Delta, id: string): { start: number; end: number } | null {
  const lines = listDocumentLines(delta);
  const heading = lines.find(
    (line) => headerLevel(line.attrs) != null && line.attrs['header-id'] === id,
  );
  if (!heading) return null;

  let end = heading.newlineIndex + 1;
  let i = lines.indexOf(heading) + 1;
  while (i < lines.length && isHashLinkListLine(delta, lines[i]!)) {
    end = lines[i]!.newlineIndex + 1;
    i += 1;
  }
  if (i < lines.length && isEmptyParagraph(delta, lines[i]!)) {
    end = lines[i]!.newlineIndex + 1;
  }
  return { start: heading.lineStart, end };
}

function deleteRange(delta: Delta, start: number, end: number): Delta {
  if (end <= start) return delta;
  return compose(delta, new DeltaClass().retain(start).delete(end - start));
}

function insertOpsAt(delta: Delta, index: number, ops: Op[]): Delta {
  if (ops.length === 0) return delta;
  let change = new DeltaClass().retain(index);
  for (const op of ops) {
    if (!isTextInsert(op)) continue;
    change = op.attributes ? change.insert(op.insert, op.attributes) : change.insert(op.insert);
  }
  return compose(delta, change);
}

function firstHeadingInsertIndex(delta: Delta): number {
  const first = collectHeadingAnchors(delta)[0];
  if (!first || first.level !== 1 || isTocChromeId(first.id)) return 0;

  const lines = listDocumentLines(delta);
  const headingLine = lines.find((line) => line.newlineIndex === first.newlineIndex);
  if (!headingLine) return first.newlineIndex + 1;

  const next = lines[lines.indexOf(headingLine) + 1];
  if (next && isEmptyParagraph(delta, next)) return next.newlineIndex + 1;
  return first.newlineIndex + 1;
}

/** Bullet list of H1–H3 heading links below the caret (toolbar Content). */
export function buildContentsListOps(headings: readonly HeadingAnchor[]): Op[] {
  const usable = headings.filter(
    (heading) =>
      heading.level >= 1 &&
      heading.level <= CONTENTS_LIST_MAX_LEVEL &&
      heading.id &&
      !isTocChromeId(heading.id),
  );
  if (usable.length === 0) return [];

  const minLevel = Math.min(...usable.map((heading) => heading.level));
  const ops: Op[] = [];
  for (const heading of usable) {
    const label = heading.text.trim() || heading.id;
    ops.push({ insert: label, attributes: { link: `#${heading.id}` } });
    const indent = Math.min(MAX_TOC_INDENT, Math.max(0, heading.level - minLevel));
    const lineAttrs: AttributeMap = { list: 'bullet' };
    if (indent > 0) lineAttrs.indent = indent;
    ops.push({ insert: '\n', attributes: lineAttrs });
  }
  ops.push({ insert: '\n' });
  return ops;
}

function opsInsertLength(ops: readonly Op[]): number {
  let length = 0;
  for (const op of ops) {
    if (isTextInsert(op)) length += op.insert.length;
  }
  return length;
}

function lineAtIndex(delta: Delta, index: number): DocumentLine | undefined {
  return listDocumentLines(delta).find(
    (entry) => entry.lineStart <= index && index <= entry.newlineIndex,
  );
}

function headingsBelowCurrentLine(delta: Delta, selection: { index: number }): HeadingAnchor[] {
  const line = lineAtIndex(delta, selection.index);
  const after = line ? line.newlineIndex : selection.index;
  return collectHeadingAnchors(delta).filter((heading) => heading.lineStart > after);
}

function contentsListInsertIndex(
  delta: Delta,
  selection: { index: number; length: number },
): { index: number; deleteCount: number } {
  if (selection.length > 0) return { index: selection.index, deleteCount: selection.length };

  const line = lineAtIndex(delta, selection.index);
  if (!line) return { index: selection.index, deleteCount: 0 };
  if (isEmptyParagraph(delta, line)) return { index: line.lineStart, deleteCount: 1 };
  return { index: line.newlineIndex + 1, deleteCount: 0 };
}

/** Insert a contents bullet list of headings below the current line. */
export function insertContentsList(state: EditorState): EditorState {
  const { delta, selection, history, config } = state;
  if (!selection) return state;

  const ops = buildContentsListOps(headingsBelowCurrentLine(delta, selection));
  if (ops.length === 0) return state;

  const { index, deleteCount } = contentsListInsertIndex(delta, selection);
  let change = new DeltaClass().retain(index);
  if (deleteCount > 0) change = change.delete(deleteCount);
  for (const op of ops) {
    if (!isTextInsert(op)) continue;
    change = op.attributes ? change.insert(op.insert, op.attributes) : change.insert(op.insert);
  }

  const newDelta = compose(delta, change);
  return {
    ...state,
    delta: newDelta,
    selection: { index: index + opsInsertLength(ops), length: 0 },
    history: pushUndo(history, invert(change, delta), selection, config.history),
  };
}

export function buildTocOps(headings: readonly HeadingAnchor[], id: string): Op[] {
  const ops: Op[] = [
    { insert: TOC_HEADING_TEXT },
    { insert: '\n', attributes: { header: 2, 'header-id': id } },
  ];

  const usable = headings.filter((heading) => heading.id && !isTocChromeId(heading.id));
  if (usable.length === 0) {
    ops.push({ insert: '\n' });
    return ops;
  }

  const minLevel = Math.min(...usable.map((heading) => heading.level));
  for (const heading of usable) {
    const label = heading.text.trim() || heading.id;
    ops.push({ insert: label, attributes: { link: `#${heading.id}` } });
    const indent = Math.min(MAX_TOC_INDENT, Math.max(0, heading.level - minLevel));
    const lineAttrs: AttributeMap = { list: 'bullet' };
    if (indent > 0) lineAttrs.indent = indent;
    ops.push({ insert: '\n', attributes: lineAttrs });
  }
  ops.push({ insert: '\n' });
  return ops;
}

/**
 * Insert or replace TOC lists at the top, bottom, both, or remove them.
 * TOC chrome uses `header-id` `toc` / `toc-bottom` so a later Update can find it.
 */
export function applyTableOfContentsToDelta(
  delta: Delta,
  placement: TocPlacement,
): ApplyTableOfContentsResult {
  const anchors = collectHeadingAnchors(delta).filter((heading) => !isTocChromeId(heading.id));
  const items = anchors[0]?.level === 1 ? anchors.slice(1) : anchors;

  let next = delta;
  for (const id of [TOC_BOTTOM_ID, TOC_TOP_ID]) {
    const region = findTocRegion(next, id);
    if (region) next = deleteRange(next, region.start, region.end);
  }

  if (placement === 'off') {
    return { delta: next, changed: next !== delta };
  }

  if (placement === 'top' || placement === 'both') {
    next = insertOpsAt(next, firstHeadingInsertIndex(next), buildTocOps(items, TOC_TOP_ID));
  }
  if (placement === 'bottom' || placement === 'both') {
    next = insertOpsAt(next, next.length(), buildTocOps(items, TOC_BOTTOM_ID));
  }

  return { delta: next, changed: true };
}
