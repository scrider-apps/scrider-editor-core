// @scrider/editor-core — Public API

// State
export type {
  SelectionRange,
  HistoryConfig,
  HistoryEntry,
  HistoryState,
  EditorConfig,
  EditorState,
  CreateEditorStateOptions,
} from './state';
export {
  defaultHistoryConfig,
  createHistoryState,
  pushUndo,
  pushUndoSnapshot,
  popUndo,
  popRedo,
  pushRedo,
  defaultEditorConfig,
  createEditorState,
  applyEditorStateTransition,
} from './state';

// Document metadata (`scrider-metadata`) — concrete schema owned by @scrider/formatter
export type { ScriderDocumentMetadata } from '@scrider/formatter';
export type { ScriderDocument, ParsedScriderDocument } from '@scrider/delta';

// Queries
export {
  getActiveFormats,
  isFormatActive,
  getLinkInSelection,
  getPlainText,
  getLength,
  getContents,
  buildPlainTextIndexMap,
  plainRangeToDeltaMatch,
  findMatches,
  findMatchesInMap,
  findMatchIndexAtOrAfter,
  canUndo,
  canRedo,
  HEADER_SIZE_PRESETS,
  HEADER_DEFAULT_SIZES,
  BASE_FONT_SIZE_PT,
  DEFAULT_HEADER_SIZE_PRESET,
  isHeaderLevel,
  getHeaderSize,
  getHeaderDefaultSize,
  recognizeFontSize,
  recognizeFontFamily,
} from './queries';
export type {
  HeaderLevel,
  HeaderSizeMap,
  HeaderSizePresetName,
  HeadingDecorationPreset,
  RecognizeFontSizeSettings,
  RecognizeFontFamilySettings,
  PlainTextIndexMap,
  FindMatch,
  FindOptions,
} from './queries';
export type { SmartDashMode } from './commands/smartDashReplace';

// Selection Bridge
export type { SelectionBridge } from './selection';
export { StringBridge } from './selection';

// Commands
export type { Command, CommandResult } from './commands';
export {
  isCommandResult,
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
  setHeader,
  toggleBlockquote,
  toggleCodeBlock,
  setCodeBlockFenceLanguage,
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
  splitBlock,
  exitBlock,
  selectAll,
  deleteBackward,
  deleteForward,
  insertText,
  insertEmbed,
  insertSoftBreak,
  insertBlock,
  undo,
  redo,
  setDocumentMetadata,
  updateDocumentMetadata,
  normalizeDocumentMetadata,
  documentMetadataEquals,
  editorStateToScriderDocument,
  documentMetadataFromRecord,
  type SetDocumentMetadataOptions,
  type DocumentMetadataInput,
  prepareCopy,
  expandSelectionToIncludeBlockTerminator,
  isWholeDocumentSelection,
  handlePaste,
  insertPastedOps,
  handleCut,
  isStructuralPasteNewline,
  type PrepareCopyOptions,
  type DocumentPresentation,
  replaceMatch,
  replaceAllMatches,
  applySmartDashReplace,
  countSmartDashReplacements,
  findSpacedDashSpans,
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
  defaultCommands,
  executeCommand,
  applySettingsHeadingBoldToDelta,
  settingsHeadingBoldPreviewWouldPatchDelta,
  listHeadingLines,
  isHeadingLineTextFullyBold,
  type HeadingLineInfo,
  type ApplySettingsHeadingBoldResult,
  applySettingsHeadingAlignToDelta,
  settingsHeadingAlignPreviewWouldPatchDelta,
  type SettingsHeadingAlign,
  type ApplySettingsHeadingAlignResult,
  applySettingsHeadingSizeGridToDelta,
  settingsHeadingSizeGridPreviewWouldPatchDelta,
  isHeadingLineTextFullySized,
  type ApplySettingsHeadingSizeGridResult,
  applySettingsHeadingAutoToDelta,
  settingsHeadingAutoPreviewWouldPatchDelta,
  headingLineHasInlineSize,
  type ApplySettingsHeadingAutoResult,
  applySettingsLineSpacingToDelta,
  settingsLineSpacingPreviewWouldPatchDelta,
  listLineSpacingBlockNewlineIndices,
  isLineSpacingBlock,
  formatLineSpacingDeltaValue,
  SCRIDER_LINE_HEIGHT_KEY,
  type ApplySettingsLineSpacingResult,
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
  bakeDocumentSettingsOnPasteDelta,
  bakeDocumentSettingsOnSkeletonDelta,
  isSkeletonOnlyDelta,
  listNewlineIndicesInCharRange,
  resolvePasteBakeEndExclusive,
  type DocumentSettingsPasteBakeOptions,
  type BakeDocumentSettingsOnPasteResult,
  describeHeadingAlignPending,
  describeHeadingAutoPending,
  describeHeadingBoldPending,
  describeHeadingSizeGridPending,
  describeLineSpacingPending,
  describeParagraphSpacingPending,
  type SettingsPreviewMismatch,
  type SettingsPreviewPendingReason,
  computeNonHeadingRanges,
  collectInlineTextRanges,
  computeFontSizeApplyRanges,
  applyInlineFormatToRanges,
  type TextRange,
  type ApplyTableOfContentsResult,
  type HeadingAnchor,
  type TocPlacement,
} from './commands';

export {
  applyAttributePatchesAtNewlines,
  blockAttrsAtDeltaIndex,
  blockAttrsAtNewlineInOp,
  LIST_START_KEY,
} from './delta/newlineBlockAttributes';

export { splitTextOpsAtNewlines } from './delta/splitTextOpsAtNewlines';
export {
  deltaHasSimpleTableOps,
  normalizePastedSimpleTableCellOps,
  pastedOpsNeedSimpleTableCellNormalization,
} from './delta/normalizeSimpleTablePaste';
export { buildInsertChange, composePreservingInsertOps } from './delta/composePreservingInsertOps';
export {
  adjustPasteInsertIndex,
  adjustTextInsertIndex,
  dividerLineToDeleteBackward,
  dividerLineToDeleteForward,
  skipDividerLineOnArrow,
  canonicalizePasteOps,
  canonicalizePasteDeltaRange,
  ensureSeparatorLineAfterPastedTable,
  pasteCaretIndexInRange,
  pasteCaretIndexBelowBlockEmbed,
  pasteOpsContainBlockOwnedEmbed,
  pasteOpsContainTableGrid,
  stripGapBetweenTableAndBlockEmbed,
} from './delta/canonicalizePasteOps';

export { findCurrentLineNewline, isAtLineStart } from './commands/structure/lineHelpers';

// Behaviors
export type { BehaviorCommand, BehaviorHook, EditorBehavior } from './behavior';
export { runBehaviors, runIndentBehaviors } from './behavior';

// KeyMap
export type { KeyBinding, KeyEvent } from './keymap';
export { defaultKeyMap, matchKeyBinding } from './keymap';

// InputRules
export type { InputRule, InputRuleMatch } from './input-rules';
export { defaultInputRules, matchInputRule } from './input-rules';

// View
export type { EditorView } from './view';

// Plugin
export type {
  PluginContext,
  PostRenderHook,
  PostRenderOptions,
  DecorationFactory,
  CodeBlockRenderer,
} from './plugin';
export { PluginManager, postRenderQueryRoot } from './plugin';

// Registry
export type {
  EntityKind,
  ValidationError,
  ValidationResult,
  CoreTypeDef,
  EntityRegistry,
  Module,
  Plugin,
  DisabledWhenRule,
  ToolbarButtonItem,
  ToolbarDropdownOption,
  ToolbarDropdownItem,
  DropdownBehavior,
  DropdownLayout,
  ToolbarColorItem,
  ToolbarSeparatorItem,
  ToolbarCustomItem,
  ToolbarItem,
  ToolbarControl,
  ToolbarGroup,
  ToolbarConfig,
  ToolbarConfigInput,
  CompactResolve,
  CompactLevel,
  CompactToolbarOptions,
  GlobalResolve,
} from './registry';
export {
  BaseEntityRegistry,
  CORE_TYPES,
  isCoreType,
  getCoreType,
  getCoreTypeNames,
  ScriderRegistry,
  type ScriderRegistryOptions,
  type SchemaInput,
  ModuleRegistry,
  PluginRegistry,
  BUTTON_KEYS,
  DROPDOWN_KEYS,
  COLOR_KEYS,
  GROUP_KEYS,
  ToolbarModuleRegistry,
  sortGroupsByOrder,
  defaultToolbar,
  compactToolbarConfig,
} from './registry';

// Controlled pipeline — data-only; the UI adapter owns DOM apply
export type {
  ApplyStateOptions,
  BlockNormalization,
  BlockNormalizeHint,
  ControlledPipelinePayload,
  ControlledPipelineResult,
  ControlledTrigger,
  SingleTextBlockChange,
} from './pipeline';
export { detectSingleSimpleTextBlockChange, runControlledPipeline } from './pipeline';
