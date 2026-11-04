import { isTextInsert } from '@scrider/delta';
import type { Delta } from '@scrider/delta';

/**
 * Plain-text view of a Delta (text inserts only) plus per-character delta indices.
 * `plainToDelta[i]` is the delta index of plain-text code unit `i`.
 */
export interface PlainTextIndexMap {
  text: string;
  plainToDelta: number[];
}

export function buildPlainTextIndexMap(delta: Delta): PlainTextIndexMap {
  let text = '';
  const plainToDelta: number[] = [];
  let deltaIndex = 0;

  for (const op of delta.ops) {
    if (isTextInsert(op)) {
      const chunk = op.insert;
      for (let i = 0; i < chunk.length; i++) {
        plainToDelta.push(deltaIndex + i);
      }
      text += chunk;
      deltaIndex += chunk.length;
    } else {
      deltaIndex += 1;
    }
  }

  return { text, plainToDelta };
}

/**
 * Map a plain-text range to a delta range. Returns null when embeds sit between
 * the matched characters (plain match is not contiguous in delta coordinates).
 */
export function plainRangeToDeltaMatch(
  map: PlainTextIndexMap,
  plainStart: number,
  plainLength: number,
): { index: number; length: number } | null {
  if (plainLength <= 0) return null;

  const deltaStart = map.plainToDelta[plainStart];
  const deltaEnd = map.plainToDelta[plainStart + plainLength - 1];
  if (deltaStart === undefined || deltaEnd === undefined) return null;

  const deltaLength = deltaEnd - deltaStart + 1;
  if (deltaLength !== plainLength) return null;

  return { index: deltaStart, length: deltaLength };
}
