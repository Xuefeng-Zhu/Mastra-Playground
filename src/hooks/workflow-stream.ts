import type { TraceEvent } from '../registry/utils';
import { createTraceEventParser } from './sse';

interface StreamWorkflowOptions {
  slug: string;
  requestBody: Record<string, unknown>;
  signal: AbortSignal;
  onEvent: (event: TraceEvent) => void;
}

async function streamEvents(
  endpoint: string,
  requestBody: Record<string, unknown>,
  signal: AbortSignal,
  onEvent: (event: TraceEvent) => void,
) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(requestBody),
    signal,
  });
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(problem?.error ?? `Workflow request failed (${response.status}).`);
  }
  if (!response.body) throw new Error('The workflow response did not include a stream.');

  let completed = false;
  const parser = createTraceEventParser((event) => {
    if (event.type === 'done') completed = true;
    onEvent(event);
  });
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.push(decoder.decode());
  parser.finish();
  if (!completed) throw new Error('The workflow stream disconnected before it completed.');
}

export async function streamWorkflow({ slug, requestBody, signal, onEvent }: StreamWorkflowOptions) {
  await streamEvents(`/api/stream/${encodeURIComponent(slug)}`, requestBody, signal, onEvent);
}

export async function streamCustomWorkflow({
  requestBody,
  signal,
  onEvent,
}: Omit<StreamWorkflowOptions, 'slug'>) {
  await streamEvents('/api/custom-workflow/stream', requestBody, signal, onEvent);
}
