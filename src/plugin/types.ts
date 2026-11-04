import type { EditorState } from '../state/EditorState';
import type { PluginRegistry } from '../registry/PluginRegistry';

/**
 * Minimal context passed to plugins during initialization.
 * Allows plugins to interact with the editor without coupling
 * to React or any specific view layer.
 */
export interface PluginContext {
  /** Execute a named command (core or plugin). */
  executeCommand: (name: string, ...args: unknown[]) => void;
  /** Get current editor state snapshot. */
  getState: () => EditorState;
}

/**
 * Options for {@link PostRenderHook} / {@link PluginManager.runPostRender}.
 *
 * `scope`: limit DOM work to a subtree (e.g. one block after a single-block
 * morph). Document-wide cleanup from a prior full pass is **not** replaced
 * on scoped calls — plugins should treat scope as additive/idempotent.
 */
export interface PostRenderOptions {
  readonly scope?: Element;
}

/**
 * Post-render hook called after the editor DOM is updated.
 * Receives the editor container element for DOM manipulation
 * (syntax highlighting, formula rendering, etc.).
 *
 * When `options.scope` is set, prefer querying within that subtree
 * ({@link postRenderQueryRoot}). May return a cleanup function that is called
 * before the next **full** render cycle or on destroy — scoped calls do not
 * install/replace that cleanup.
 */
export type PostRenderHook = (
  container: Element,
  options?: PostRenderOptions,
) => void | (() => void);

/** Query root for post-render work: scoped subtree, else the editor container. */
export function postRenderQueryRoot(container: Element, options?: PostRenderOptions): Element {
  return options?.scope ?? container;
}

/**
 * Factory for a decoration element injected by a renderer into `<pre>`.
 * The orchestrator calls `create()` and appends the result with `DECORATION_ATTR`.
 */
export interface DecorationFactory {
  /** Which mode to apply in. Omit for both modes. */
  mode?: 'edit' | 'view';
  /** Create the decoration DOM element. Return null to skip. */
  create: (pre: Element, lang: string) => HTMLElement | null;
}

/**
 * Contract for a code-block renderer (Prism, KaTeX, Mermaid, etc.).
 *
 * Each renderer handles specific languages inside `<pre>` blocks.
 * `createCodeBlockPlugin` orchestrates multiple renderers via a
 * single DOM pass, routing each block to the matching renderer.
 *
 * Decorations (language label, copy button, custom controls) are
 * defined as factory functions in `registry` keys — the orchestrator
 * calls them generically, no hardcoded UI.
 */
export interface CodeBlockRenderer {
  /** Unique renderer name (e.g. "prism", "katex", "mermaid"). */
  readonly name: string;
  /**
   * Languages this renderer handles.
   * - Array of language strings: concrete match (e.g. `['math']`).
   * - `'*'`: wildcard fallback — used when no concrete match found.
   */
  readonly languages: string[] | '*';
  /** Registry with decoration factory keys (label, copyButton, custom). */
  readonly registry: PluginRegistry;
  /**
   * Render source text for the given language.
   * Returns highlighted HTML string, a DOM element, or a Promise (e.g. Mermaid, PlantUML).
   */
  render(text: string, lang: string): string | HTMLElement | Promise<string | HTMLElement>;
  /**
   * Optional: pretty-format source text (indentation, line breaks).
   * Called before `render()` when auto-format is enabled.
   * Returns formatted text or the original if formatting is not supported.
   */
  format?(text: string, lang: string): string;
  /**
   * Optional: validate source text for the given language.
   * Called alongside `format()` when auto-format is enabled.
   * Returns a human-readable error message, or null if valid.
   */
  validate?(text: string, lang: string): string | null;
}
