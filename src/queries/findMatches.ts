import type { EditorState } from '../state/EditorState';
import {
  buildPlainTextIndexMap,
  plainRangeToDeltaMatch,
  type PlainTextIndexMap,
} from './textIndexMap';

export interface FindMatch {
  index: number;
  length: number;
}

export interface FindOptions {
  caseSensitive?: boolean;
}

function findPlainOccurrences(text: string, query: string, caseSensitive: boolean): number[] {
  if (!query) return [];

  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const positions: number[] = [];
  let start = 0;

  while (start <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, start);
    if (idx === -1) break;
    positions.push(idx);
    start = idx + Math.max(needle.length, 1);
  }

  return positions;
}

export function findMatchesInMap(
  map: PlainTextIndexMap,
  query: string,
  options?: FindOptions,
): FindMatch[] {
  const caseSensitive = options?.caseSensitive ?? false;
  const positions = findPlainOccurrences(map.text, query, caseSensitive);
  const matches: FindMatch[] = [];

  for (const plainStart of positions) {
    const deltaMatch = plainRangeToDeltaMatch(map, plainStart, query.length);
    if (deltaMatch) matches.push(deltaMatch);
  }

  return matches;
}

export function findMatches(state: EditorState, query: string, options?: FindOptions): FindMatch[] {
  return findMatchesInMap(buildPlainTextIndexMap(state.delta), query, options);
}

/** Index of the first match at or after `deltaIndex`, or 0 if none / before first. */
export function findMatchIndexAtOrAfter(matches: readonly FindMatch[], deltaIndex: number): number {
  if (matches.length === 0) return 0;
  for (let i = 0; i < matches.length; i++) {
    if (matches[i]!.index >= deltaIndex) return i;
  }
  return 0;
}
