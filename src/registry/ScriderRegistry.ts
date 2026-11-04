import {
  createDefaultBlockHandlers,
  createDefaultRegistry,
  type BlockHandlerRegistry,
  type Registry,
} from '@scrider/formatter';
import type { EntityRegistry } from './EntityRegistry';
import type { EntityKind, ValidationResult } from './types';
import type { Module } from './Module';
import type { Plugin } from './Plugin';
import type { SchemaInput } from './schema';
import { getCoreTypeNames } from './coreTypes';

export interface ScriderRegistryOptions {
  /** Format registry for schema registration and conversions. Defaults to `createDefaultRegistry()`. */
  formatRegistry?: Registry;
  /** Block handler registry. Defaults to `createDefaultBlockHandlers()`. */
  blockHandlers?: BlockHandlerRegistry;
}

/**
 * Global registry — single source of truth for the Scrider ecosystem.
 *
 * Responsibilities:
 * - Atomically validate and register modules/plugins via registerModule()/registerPlugin()
 * - Resolve AppConfig via sublimation through registered entity registries
 * - Provide queries: available types, modules, plugins
 * - Stateless dev preflight via validateRegistry()
 */
export class ScriderRegistry {
  private readonly availableTypes: Set<string>;
  private readonly entityRegistries = new Map<string, EntityRegistry>();
  private readonly modules = new Map<string, Module>();
  private readonly plugins = new Map<string, Plugin>();
  private readonly allKeys = new Set<string>();
  private readonly registeredSchemaKeys = new Set<string>();

  /** Formatter format registry (schemas, validation, HTML/Markdown conversion). */
  readonly formatRegistry: Registry;
  /** Formatter block handler registry (container block embeds). */
  readonly blockHandlers: BlockHandlerRegistry;

  constructor(options?: ScriderRegistryOptions) {
    this.availableTypes = new Set(getCoreTypeNames());
    this.formatRegistry = options?.formatRegistry ?? createDefaultRegistry();
    this.blockHandlers = options?.blockHandlers ?? createDefaultBlockHandlers();
  }

  /**
   * Register a custom {@link Format} or {@link BlockHandler} in the formatter registries.
   * Delegates to `formatRegistry` / `blockHandlers` — single entry point for schema extensions.
   */
  registerSchema(input: SchemaInput): ValidationResult {
    const schemaKey =
      input.kind === 'format' ? `format:${input.format.name}` : `block:${input.handler.type}`;

    if (this.registeredSchemaKeys.has(schemaKey)) {
      return {
        ok: false,
        errors: [
          {
            code: 'DUPLICATE_SCHEMA',
            message: `Schema "${schemaKey}" is already registered on this ScriderRegistry.`,
          },
        ],
      };
    }

    try {
      if (input.kind === 'format') {
        this.formatRegistry.register(input.format);
      } else {
        this.blockHandlers.register(input.handler);
      }
      this.registeredSchemaKeys.add(schemaKey);
      return { ok: true, errors: [] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        errors: [{ code: 'REGISTER_SCHEMA_FAILED', message }],
      };
    }
  }

  /** Composite key: `kind:name` to allow same name for module and plugin. */
  private registryKey(registry: EntityRegistry): string {
    return `${registry.kind}:${registry.name}`;
  }

  /**
   * Stateless dev preflight — check whether a registry would pass validation
   * without mutating global state. Useful during iterative module development.
   */
  validateRegistry(registry: EntityRegistry): ValidationResult {
    return registry.validate(this.availableTypes, this.allKeys);
  }

  /**
   * Atomically validate module.registry and register both registry and module.
   * On success: registry stored, keys tracked, module available.
   * On failure: nothing changes.
   */
  registerModule(module: Module): ValidationResult {
    const rk = this.registryKey(module.registry);
    if (this.entityRegistries.has(rk)) {
      return {
        ok: false,
        errors: [
          {
            code: 'DUPLICATE_NAME',
            message: `${module.registry.kind} registry "${module.registry.name}" is already registered.`,
          },
        ],
      };
    }

    const result = module.registry.validate(this.availableTypes, this.allKeys);
    if (!result.ok) return result;

    this.entityRegistries.set(rk, module.registry);
    for (const key of module.registry.getKeys()) {
      this.allKeys.add(key);
    }

    this.modules.set(module.name, module);
    return result;
  }

  /**
   * Atomically validate plugin.registry and register both registry and plugin.
   * On success: registry stored, keys tracked, plugin available.
   * On failure: nothing changes.
   */
  registerPlugin(plugin: Plugin): ValidationResult {
    const rk = this.registryKey(plugin.registry);
    if (this.entityRegistries.has(rk)) {
      return {
        ok: false,
        errors: [
          {
            code: 'DUPLICATE_NAME',
            message: `${plugin.registry.kind} registry "${plugin.registry.name}" is already registered.`,
          },
        ],
      };
    }

    const result = plugin.registry.validate(this.availableTypes, this.allKeys);
    if (!result.ok) return result;

    this.entityRegistries.set(rk, plugin.registry);
    for (const key of plugin.registry.getKeys()) {
      this.allKeys.add(key);
    }

    this.plugins.set(plugin.name, plugin);
    return result;
  }

  /** Check if a type name is available (core type or registered). */
  isTypeAvailable(typeName: string): boolean {
    return this.availableTypes.has(typeName);
  }

  /** Get names of all registered modules. */
  getAvailableModules(): string[] {
    return Array.from(this.modules.keys());
  }

  /** Get names of all registered plugins. */
  getAvailablePlugins(): string[] {
    return Array.from(this.plugins.keys());
  }

  /** Get an entity registry by kind and name, or undefined. */
  getRegistry(name: string, kind?: EntityKind): EntityRegistry | undefined {
    if (kind) {
      return this.entityRegistries.get(`${kind}:${name}`);
    }
    return (
      this.entityRegistries.get(`module:${name}`) ?? this.entityRegistries.get(`plugin:${name}`)
    );
  }

  /** Get a registered module by name, or undefined. */
  getModule(name: string): Module | undefined {
    return this.modules.get(name);
  }

  /** Get a registered plugin by name, or undefined. */
  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /** Check whether a key is registered in any entity registry. */
  hasKey(key: string): boolean {
    return this.allKeys.has(key);
  }

  /**
   * Resolve a key by searching all registered entity registries.
   * Inline objects are returned unchanged (passthrough).
   */
  resolveKey(input: string | object): unknown {
    if (typeof input === 'object' && input !== null) return input;
    for (const registry of this.entityRegistries.values()) {
      if (registry.hasKey(input)) {
        return registry.resolveKey(input);
      }
    }
    return undefined;
  }
}
