import type { Op } from '@scrider/delta';

import type { EditorState } from '../state/EditorState';

/**
 * Why the wrapper entered the controlled path.
 * Classifier stays in the framework layer for now; core only dispatches.
 */
export type ControlledTrigger =
  'insertText' | 'paste' | 'drop' | 'command' | 'inputRule' | 'contextualKey';

/**
 * Data-only payload for {@link runControlledPipeline}.
 * `insertText` uses `text`; other fields are reserved for future triggers.
 */
export interface ControlledPipelinePayload {
  readonly text?: string;
  readonly html?: string;
  readonly pasteTarget?: 'document' | 'code-block' | 'block-embed';
  readonly commandName?: string;
}

/**
 * Hint for BlockNormalization / scoped render.
 * - `full` — wrapper runs the whole-document morph path.
 * - `singleBlock` — morph only the block at `startDeltaIndex` (ops included).
 */
export type BlockNormalizeHint =
  | { readonly kind: 'full' }
  | {
      readonly kind: 'singleBlock';
      readonly startDeltaIndex: number;
      readonly newBlockOps: readonly Op[];
    };

/**
 * Per-block normalization protocol. Stub — strip/patch hooks are not
 * implemented yet.
 */
export interface BlockNormalization {
  readonly blockType: string;
  stripBeforeHtmlToDelta?(html: string): string;
}

export interface ControlledPipelineResult {
  readonly state: EditorState;
  /** Optional HTML for wrapper apply — unused while `renderToDOM` owns DOM. */
  readonly html?: string;
  readonly normalizeHint?: BlockNormalizeHint;
}

/** Optional second arg for the host's `applyState`. */
export interface ApplyStateOptions {
  readonly normalizeHint?: BlockNormalizeHint;
}
