import type { ModuleRegistry } from './ModuleRegistry';

/**
 * A module — configurable part of the application responsible for
 * state and UI structure (e.g. toolbar layout, status bar widgets).
 */
export interface Module {
  /** Unique module name (e.g. "toolbar"). */
  readonly name: string;
  /** Configuration: full object or string key resolved through registry. */
  readonly config: unknown;
  /** Module's own registry with keys, pseudo-types, sublimation rules. */
  readonly registry: ModuleRegistry;
}
