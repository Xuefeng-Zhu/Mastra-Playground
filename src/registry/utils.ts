/**
 * Shared utilities used by the React shell and the renderers.
 */

export function formatSec(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  return (ms / 1000).toFixed(2) + 's';
}

export function escapeText(s: unknown): string {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Tokenise SSE event data and return a list of message objects.
 * Used by the useSSE hook to parse `data:` lines into JSON.
 */
export interface TraceEvent {
  type: string;
  stepId?: string;
  step?: string;
  input?: unknown;
  output?: unknown;
  tool?: string;
  text?: string;
  model?: string;
  schema?: string;
  data?: unknown;
  predicate?: string;
  matched?: boolean;
  token?: string;
  payload?: unknown;
  decision?: string;
  status?: 'success' | 'failed' | 'suspended';
  totalMs?: number;
  result?: unknown;
  error?: string;
  index?: number;
  durationMs?: number;
  summary?: string;
  [key: string]: unknown;
}
