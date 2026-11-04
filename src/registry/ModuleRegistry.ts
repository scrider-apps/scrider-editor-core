import { BaseEntityRegistry } from './BaseEntityRegistry';

/**
 * Registry for a module (state, configuration, UI structure).
 *
 * Stores keys (pseudo-types) mapping short names to full structural
 * descriptions (e.g. "undo" → full button object). Provides sublimation
 * to expand short config syntax into resolved structures.
 */
export class ModuleRegistry extends BaseEntityRegistry {
  constructor(name: string) {
    super(name, 'module');
  }
}
