/**
 * Kind of entity registry: module (state/structure) or plugin (behavior).
 */
export type EntityKind = 'module' | 'plugin';

/**
 * A single validation error with a machine-readable code and human-readable message.
 */
export interface ValidationError {
  code:
    | 'UNKNOWN_TYPE'
    | 'KEY_CONFLICT'
    | 'DUPLICATE_NAME'
    | 'MISSING_DEPENDENCY'
    | 'INVALID_STRUCTURE'
    | 'DUPLICATE_SCHEMA'
    | 'REGISTER_SCHEMA_FAILED';
  message: string;
}

/**
 * Result of registry validation against the global registry.
 */
export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

/**
 * Definition of a core element type (button, dropdown, separator, etc.).
 * Core types are immutable and available from ScriderRegistry initialization.
 */
export interface CoreTypeDef {
  /** Unique type name, e.g. "button", "dropdown", "separator" */
  readonly name: string;
  /** Required fields for objects of this type */
  readonly requiredFields: readonly string[];
}
