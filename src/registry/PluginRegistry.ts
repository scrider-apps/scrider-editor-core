import { BaseEntityRegistry } from './BaseEntityRegistry';

/**
 * Registry for a plugin (behavior, commands, schema extensions).
 *
 * Stores keys mapping short names to command descriptors, schema
 * extensions, lifecycle bindings. Provides sublimation for plugin config.
 */
export class PluginRegistry extends BaseEntityRegistry {
  constructor(name: string) {
    super(name, 'plugin');
  }
}
