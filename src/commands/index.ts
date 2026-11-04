export type { Command, CommandResult } from './types';
export { isCommandResult } from './types';

export {
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  toggleCode,
  toggleMark,
  toggleSubscript,
  toggleSuperscript,
  toggleKbd,
  setColor,
  setBackground,
  setFont,
  setFontSize,
  setLink,
  removeFormat,
} from './inline';

export {
  setHeader,
  toggleBlockquote,
  toggleCodeBlock,
  setCodeBlockFenceLanguage,
  setList,
  type SetListOptions,
  increaseIndent,
  decreaseIndent,
  setAlign,
  setLineSpacing,
  toggleTextIndent,
  SCRIDER_TEXT_INDENT_KEY,
  DEFAULT_SCRIDER_TEXT_INDENT,
  getAffectedLines,
  isPlainParagraphLine,
  type AffectedLineInfo,
} from './block';

export {
  buildCodeBlockBoxChange,
  findCodeBlockFenceAt,
  listCodeBlockFences,
  CODE_BLOCK_FLOAT_KEY,
  CODE_BLOCK_HEIGHT_KEY,
  CODE_BLOCK_MIN_HEIGHT_PX,
  CODE_BLOCK_MIN_WIDTH_PX,
  CODE_BLOCK_WIDTH_KEY,
  type CodeBlockBox,
  type CodeBlockBoxPatch,
  type CodeBlockFence,
  type CodeBlockFloat,
} from './codeBlockBox';

export {
  splitBlock,
  exitBlock,
  deleteBackward,
  deleteForward,
  insertText,
  insertEmbed,
  insertSoftBreak,
  insertBlock,
  selectAll,
} from './structure';

export {
  applySettingsHeadingBoldToDelta,
  settingsHeadingBoldPreviewWouldPatchDelta,
  listHeadingLines,
  isHeadingLineTextFullyBold,
  type HeadingLineInfo,
  type ApplySettingsHeadingBoldResult,
} from './settingsHeadingBold';

export {
  applySettingsHeadingAlignToDelta,
  settingsHeadingAlignPreviewWouldPatchDelta,
  type SettingsHeadingAlign,
  type ApplySettingsHeadingAlignResult,
} from './settingsHeadingAlign';

export {
  applySettingsHeadingSizeGridToDelta,
  settingsHeadingSizeGridPreviewWouldPatchDelta,
  isHeadingLineTextFullySized,
  type ApplySettingsHeadingSizeGridResult,
} from './settingsHeadingSizeGrid';

export {
  applySettingsHeadingAutoToDelta,
  settingsHeadingAutoPreviewWouldPatchDelta,
  headingLineHasInlineSize,
  type ApplySettingsHeadingAutoResult,
} from './settingsHeadingAuto';

export {
  applySettingsLineSpacingToDelta,
  settingsLineSpacingPreviewWouldPatchDelta,
  listLineSpacingBlockNewlineIndices,
  isLineSpacingBlock,
  formatLineSpacingDeltaValue,
  SCRIDER_LINE_HEIGHT_KEY,
  type ApplySettingsLineSpacingResult,
} from './settingsLineSpacing';

export {
  applySettingsParagraphSpacingToDelta,
  settingsParagraphSpacingPreviewWouldPatchDelta,
  listParagraphSpacingBlockNewlineIndices,
  isParagraphSpacingBlock,
  formatParagraphSpacingDeltaValue,
  parseScriderMarginAfterEm,
  parseScriderMarginBeforeEm,
  parseScriderMarginEm,
  SCRIDER_MARGIN_AFTER_KEY,
  SCRIDER_MARGIN_BEFORE_KEY,
  type ApplySettingsParagraphSpacingResult,
} from './settingsParagraphSpacing';

export {
  describeHeadingAlignPending,
  describeHeadingAutoPending,
  describeHeadingBoldPending,
  describeHeadingSizeGridPending,
  describeLineSpacingPending,
  describeParagraphSpacingPending,
  type SettingsPreviewMismatch,
  type SettingsPreviewPendingReason,
} from './settingsPreviewPending';

export {
  computeNonHeadingRanges,
  collectInlineTextRanges,
  computeFontSizeApplyRanges,
  applyInlineFormatToRanges,
  type TextRange,
} from './headingFontSize';

export { undo, redo } from './history';

export {
  setDocumentMetadata,
  updateDocumentMetadata,
  normalizeDocumentMetadata,
  documentMetadataEquals,
  editorStateToScriderDocument,
  documentMetadataFromRecord,
  type SetDocumentMetadataOptions,
  type DocumentMetadataInput,
} from './documentMetadata';

export {
  prepareCopy,
  expandSelectionToIncludeBlockTerminator,
  isWholeDocumentSelection,
  handlePaste,
  insertPastedOps,
  handleCut,
  isStructuralPasteNewline,
  type PrepareCopyOptions,
  type DocumentPresentation,
  type HandlePasteOptions,
} from './clipboard';

export {
  bakeDocumentSettingsOnPasteDelta,
  bakeDocumentSettingsOnSkeletonDelta,
  isSkeletonOnlyDelta,
  listNewlineIndicesInCharRange,
  resolvePasteBakeEndExclusive,
  type DocumentSettingsPasteBakeOptions,
  type BakeDocumentSettingsOnPasteResult,
} from './bakeDocumentSettingsOnPaste';

export { replaceMatch, replaceAllMatches } from './findReplace';

export {
  applySmartDashReplace,
  countSmartDashReplacements,
  findSpacedDashSpans,
  spacedDashSpansToDeltaReplacements,
  type SmartDashMode,
  type SpacedDashSpan,
  type DeltaReplacement,
} from './smartDashReplace';

export {
  applyTableOfContentsToDelta,
  buildContentsListOps,
  buildTocOps,
  collectHeadingAnchors,
  collectHeadingLinkTargets,
  insertContentsList,
  parseDocumentHashHref,
  TOC_BOTTOM_ID,
  TOC_HEADING_TEXT,
  TOC_TOP_ID,
  type ApplyTableOfContentsResult,
  type HeadingAnchor,
  type TocPlacement,
} from './tableOfContents';

export { defaultCommands, executeCommand } from './registry';
