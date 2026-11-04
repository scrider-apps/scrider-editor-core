export type { SelectionRange } from './SelectionRange';

export type { HistoryConfig, HistoryEntry, HistoryState } from './HistoryState';
export {
  defaultHistoryConfig,
  createHistoryState,
  pushUndo,
  pushUndoSnapshot,
  popUndo,
  popRedo,
  pushRedo,
} from './HistoryState';

export type { EditorConfig, EditorState, CreateEditorStateOptions } from './EditorState';
export { defaultEditorConfig, createEditorState, applyEditorStateTransition } from './EditorState';
