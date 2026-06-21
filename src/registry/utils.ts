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

// Map example.num → the API id the server's EXAMPLES map expects. Lives
// here (not inside useWorkspace) so it's easy to grep when adding a new
// example, and so the kebab-case id only exists in one place per app.
//
// MUST stay in sync with `server/server.ts` EXAMPLES map keys.
const NUM_TO_API_ID: Record<number, string> = {
  1: 'support-triage',
  2: 'research',
  3: 'code-review',
  4: 'parallel-research',
  5: 'multi-turn-chat',
  6: 'hitl-approval',
  7: 'streaming-chat',
  8: 'critic-loop',
  9: 'multi-agent-handoff',
  10: 'mastra-memory',
  11: 'content-pipeline',
};

export function exampleNameToId(num: number, fallback = ''): string {
  return NUM_TO_API_ID[num] ?? fallback;
}
