export { getActiveFormats, isFormatActive, getLinkInSelection } from './formats';
export { getPlainText, getLength, getContents } from './content';
export {
  buildPlainTextIndexMap,
  plainRangeToDeltaMatch,
  type PlainTextIndexMap,
} from './textIndexMap';
export {
  findMatches,
  findMatchesInMap,
  findMatchIndexAtOrAfter,
  type FindMatch,
  type FindOptions,
} from './findMatches';
export { canUndo, canRedo } from './history';
export {
  HEADER_SIZE_PRESETS,
  HEADER_DEFAULT_SIZES,
  HEADER_DEFAULT_FONT,
  BASE_FONT_SIZE_PT,
  DEFAULT_HEADER_SIZE_PRESET,
  isHeaderLevel,
  getHeaderSize,
  getHeaderDefaultSize,
} from './headerDefaults';
export type {
  HeaderLevel,
  HeaderSizeMap,
  HeaderSizePresetName,
  HeadingDecorationPreset,
} from './headerDefaults';
export { recognizeFontSize, type RecognizeFontSizeSettings } from './recognizeFontSize';
export { recognizeFontFamily, type RecognizeFontFamilySettings } from './recognizeFontFamily';
