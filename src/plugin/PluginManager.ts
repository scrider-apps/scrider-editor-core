import type { EditorBehavior } from '../behavior/types';
import type { Plugin } from '../registry/Plugin';
import type { Command } from '../commands/types';
import type { PluginContext, PostRenderOptions } from './types';

/**
 * Orchestrates plugin lifecycle, merges commands, and manages
 * post-render hooks. Error isolation: a failing plugin never
 * breaks other plugins.
 */
export class PluginManager {
  private readonly plugins: readonly Plugin[];
  private readonly cleanups = new Map<string, () => void>();
  private initialized = false;

  constructor(plugins: Plugin[]) {
    this.plugins = plugins;
  }

  /**
   * Merge commands from all plugins into a single record.
   * Later plugins override earlier ones on name collision.
   */
  getMergedCommands(): Record<string, Command> {
    const merged: Record<string, Command> = {};
    for (const plugin of this.plugins) {
      if (plugin.commands) {
        Object.assign(merged, plugin.commands);
      }
    }
    return merged;
  }

  /** Behaviors from all plugins, in plugin order, for `config.behaviors`. */
  getBehaviors(): EditorBehavior[] {
    const behaviors: EditorBehavior[] = [];
    for (const plugin of this.plugins) {
      if (plugin.behavior) behaviors.push(plugin.behavior);
    }
    return behaviors;
  }

  /**
   * Initialize all plugins with the given context.
   * Calls `onInit` on each plugin that defines it.
   */
  init(context: PluginContext): void {
    if (this.initialized) return;
    this.initialized = true;

    for (const plugin of this.plugins) {
      if (plugin.onInit) {
        try {
          plugin.onInit(context);
        } catch (err) {
          console.error(`[PluginManager] onInit failed for "${plugin.name}":`, err);
        }
      }
    }
  }

  /**
   * Destroy all plugins. Calls `onDestroy` on each plugin,
   * then runs any remaining post-render cleanups.
   */
  destroy(): void {
    if (!this.initialized) return;

    for (const plugin of this.plugins) {
      if (plugin.onDestroy) {
        try {
          plugin.onDestroy();
        } catch (err) {
          console.error(`[PluginManager] onDestroy failed for "${plugin.name}":`, err);
        }
      }
    }

    for (const cleanup of this.cleanups.values()) {
      try {
        cleanup();
      } catch (err) {
        console.error('[PluginManager] cleanup failed:', err);
      }
    }
    this.cleanups.clear();
    this.initialized = false;
  }

  /**
   * Run post-render hooks for all plugins.
   *
   * Full pass (`options.scope` omitted): previous cleanup is called before
   * running the hook again; returned cleanup is stored.
   *
   * Scoped pass: runs `onRender(container, { scope })` without invoking or
   * replacing document-wide cleanups — safe after a single-block morph.
   */
  runPostRender(container: Element, options?: PostRenderOptions): void {
    const scoped = options?.scope != null;

    for (const plugin of this.plugins) {
      if (!plugin.onRender) continue;

      if (!scoped) {
        const prev = this.cleanups.get(plugin.name);
        if (prev) {
          try {
            prev();
          } catch (err) {
            console.error(`[PluginManager] cleanup failed for "${plugin.name}":`, err);
          }
          this.cleanups.delete(plugin.name);
        }
      }

      try {
        const scope = options?.scope;
        const cleanup =
          scope != null ? plugin.onRender(container, { scope }) : plugin.onRender(container);
        if (!scoped && typeof cleanup === 'function') {
          this.cleanups.set(plugin.name, cleanup);
        }
      } catch (err) {
        console.error(`[PluginManager] onRender failed for "${plugin.name}":`, err);
      }
    }
  }
}
