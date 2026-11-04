import type { EntityKind, ValidationResult } from './types';

/**
 * Base interface for module and plugin registries.
 *
 * Every registry stores key→value mappings (pseudo-types / sublimation keys)
 * and knows how to expand short config syntax into full structures.
 *
 * ModuleRegistry and PluginRegistry are specializations of EntityRegistry
 * with the same mechanics but different semantics:
 *   - ModuleRegistry: state, configuration, UI structure
 *   - PluginRegistry: behavior, commands, schema extensions
 */
export interface EntityRegistry {
  /** Unique name of this registry (e.g. "toolbar", "export-pdf"). */
  readonly name: string;

  /** Kind: 'module' for state/structure, 'plugin' for behavior. */
  readonly kind: EntityKind;

  /** Register a key (pseudo-type) with its full object representation. */
  setKey(key: string, value: unknown): void;

  /** Resolve a key to its full object, or passthrough inline objects. */
  resolveKey(input: string | object): unknown;

  /** Check whether a key is registered. */
  hasKey(key: string): boolean;

  /** Get all registered keys. */
  getKeys(): string[];

  /**
   * Return the core type names that this registry's entries reference.
   * Used by the global registry to validate availability.
   */
  getUsedTypes(): string[];

  /**
   * Expand a short config (string key, array of keys, partial object)
   * into a fully resolved config object using registered keys.
   */
  sublimate(shortConfig: unknown): unknown;

  /**
   * Validate this registry against the global registry.
   * Checks that all referenced types are available and keys are correct.
   *
   * @param availableTypes - set of type names available in the global registry
   * @param registeredKeys - set of keys already registered by other registries (for conflict detection)
   */
  validate(
    availableTypes: ReadonlySet<string>,
    registeredKeys: ReadonlySet<string>,
  ): ValidationResult;
}
