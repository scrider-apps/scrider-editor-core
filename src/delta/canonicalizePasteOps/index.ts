export { canonicalizePasteOps, canonicalizePasteDeltaRange } from './canonicalize';
export { stripGapBetweenTableAndBlockEmbed } from './tableGaps';
export {
  splitLineBeforeContainerBlockEmbeds,
  stripGapBetweenHeadingAndContainerBlockEmbed,
} from './blockEmbedLines';
export type { AdjustPasteInsertIndexOptions } from './pasteIndex';
export {
  adjustPasteInsertIndex,
  adjustTextInsertIndex,
  dividerLineToDeleteBackward,
  dividerLineToDeleteForward,
  skipDividerLineOnArrow,
  ensureSeparatorLineAfterPastedTable,
  pasteCaretIndexBelowBlockEmbed,
  pasteCaretIndexInRange,
  pasteOpsContainBlockOwnedEmbed,
  pasteOpsContainTableGrid,
} from './pasteIndex';
