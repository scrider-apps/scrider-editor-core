import type { BlockHandler, Format } from '@scrider/formatter';

/**
 * Input for {@link ScriderRegistry.registerSchema} — registers a custom
 * {@link Format} or {@link BlockHandler} in the formatter registries.
 */
export type SchemaInput =
  { kind: 'format'; format: Format } | { kind: 'block-handler'; handler: BlockHandler };
