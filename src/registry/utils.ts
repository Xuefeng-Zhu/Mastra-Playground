/**
 * Shared utilities used by the React shell and the renderers.
 *
 * `TraceEvent` is re-exported from the canonical `shared/tracer.ts` union
 * so we don't drift from the SSE contract. `exampleNameToId` maps the
 * per-example numeric `num` to the kebab-case API id registered with the
 * server.
 */

export { formatSec, escapeText } from './utils-shared';

// Re-export the canonical TraceEvent union. The browser switches on
// `event.type`, so the union members' shape is load-bearing. Importing it
// from shared/ keeps the SSE contract authoritative in one place.
export type { TraceEvent } from '../../shared/tracer';
import { EXAMPLE_ID_BY_NUMBER } from '../../shared/example-manifest';

export function exampleNameToId(num: number, fallback = ''): string {
  return EXAMPLE_ID_BY_NUMBER.get(num) ?? fallback;
}
