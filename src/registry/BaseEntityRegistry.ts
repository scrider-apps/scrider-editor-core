import type { EntityKind, ValidationResult, ValidationError } from './types';
import type { EntityRegistry } from './EntityRegistry';

/**
 * Base implementation of EntityRegistry.
 * Provides key storage, validation, and sublimation scaffolding.
 * ModuleRegistry and PluginRegistry extend this with domain-specific logic.
 */
export class BaseEntityRegistry implements EntityRegistry {
  readonly name: string;
  readonly kind: EntityKind;

  protected readonly keys = new Map<string, unknown>();
  protected readonly usedTypes = new Set<string>();

  constructor(name: string, kind: EntityKind) {
    this.name = name;
    this.kind = kind;
  }

  setKey(key: string, value: unknown): void {
    this.keys.set(key, value);
    this.trackUsedTypes(value);
  }

  resolveKey(input: string | object): unknown {
    if (typeof input === 'object' && input !== null) return input;
    return this.keys.get(input);
  }

  hasKey(key: string): boolean {
    return this.keys.has(key);
  }

  getKeys(): string[] {
    return Array.from(this.keys.keys());
  }

  getUsedTypes(): string[] {
    return Array.from(this.usedTypes);
  }

  /**
   * Default sublimation: resolve string keys to full objects,
   * pass through objects unchanged.
   * Subclasses can override for domain-specific logic.
   */
  sublimate(shortConfig: unknown): unknown {
    if (typeof shortConfig === 'string') {
      return this.resolveKey(shortConfig) ?? shortConfig;
    }
    if (Array.isArray(shortConfig)) {
      return shortConfig.map((item) => this.sublimate(item));
    }
    return shortConfig;
  }

  validate(
    availableTypes: ReadonlySet<string>,
    registeredKeys: ReadonlySet<string>,
  ): ValidationResult {
    const errors: ValidationError[] = [];

    for (const typeName of this.usedTypes) {
      if (!availableTypes.has(typeName)) {
        errors.push({
          code: 'UNKNOWN_TYPE',
          message: `Registry "${this.name}" references unknown type "${typeName}"`,
        });
      }
    }

    for (const key of this.keys.keys()) {
      if (registeredKeys.has(key)) {
        errors.push({
          code: 'KEY_CONFLICT',
          message: `Registry "${this.name}" key "${key}" conflicts with an already registered key`,
        });
      }
    }

    return { ok: errors.length === 0, errors };
  }

  /**
   * Extract type name from a registered value and track it.
   * Looks for a `type` property on objects.
   */
  private trackUsedTypes(value: unknown): void {
    if (
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      typeof (value as Record<string, unknown>)['type'] === 'string'
    ) {
      this.usedTypes.add((value as Record<string, unknown>)['type'] as string);
    }
  }
}
