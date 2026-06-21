/**
 * CLI bootstrap helper for examples. Each `npm run example:0N` script
 * invokes `tsx examples/0N-name/index.ts`, and the file ends with a
 * `main()` block that runs a demo against a silent tracer. This helper
 * consolidates the boilerplate: the dynamic Tracer import, the entrypoint
 * guard, and the catch-to-exit-1 error handling.
 */

import type { Tracer } from './tracer.js';

export type CliDemo = (tracer: Tracer) => Promise<void>;

/**
 * Returns true if this module was invoked directly (vs imported). Use as
 * the entrypoint guard at the bottom of an example.
 */
export function isMain(metaUrl: string, argv1: string | undefined): boolean {
  return metaUrl === `file://${argv1}`;
}

/**
 * Run a demo function against a fresh silent Tracer. Catches errors,
 * logs to stderr, and exits 1. Intended to be called from a top-level
 * `if (isMain(...))` block.
 */
export async function runCliExample(name: string, demo: CliDemo): Promise<void> {
  const { Tracer } = await import('./tracer.js');
  const silentTracer = new Tracer();
  try {
    await demo(silentTracer);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
