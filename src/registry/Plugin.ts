import type { PluginRegistry } from './PluginRegistry';
import type { EditorBehavior } from '../behavior/types';
import type { Command } from '../commands/types';
import type { PluginContext, PostRenderHook } from '../plugin/types';

/**
 * A plugin — entity responsible for behavior (commands, schema
 * extensions, lifecycle hooks). Self-sufficient: can live without UI,
 * controlled from code.
 */
export interface Plugin {
  /** Unique plugin name (e.g. "export-pdf"). */
  readonly name: string;
  /** Plugin's own registry with keys and command descriptors. */
  readonly registry: PluginRegistry;
  /** Named commands provided by this plugin. */
  commands?: Record<string, Command>;
  /** Hooks into built-in structural commands; the host puts them in `config.behaviors`. */
  behavior?: EditorBehavior;
  /** Called once when the plugin is initialized with editor context. */
  onInit?: (context: PluginContext) => void;
  /** Called when the plugin is being destroyed (cleanup resources). */
  onDestroy?: () => void;
  /** Post-render hook for DOM manipulation after editor updates. */
  onRender?: PostRenderHook;
}
