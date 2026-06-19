/**
 * Tracer — a tiny event emitter used to stream workflow progress to the
 * browser via Server-Sent Events. Each step in a workflow calls tracer.emit()
 * to mark a checkpoint. The tracer serializes events as SSE `data:` lines.
 *
 * This is intentionally simpler than hooking into Mastra's observability:
 *   - Works without @mastra/observability (which is a separate package)
 *   - Events are explicit in the code — easy to read
 *   - Browser side gets a clear, ordered stream of "what just happened"
 */

export type TraceEvent =
  | {
      type: 'start';
      workflow: string;
      input: unknown;
      steps: { id: string; label: string; kind: 'llm' | 'tool' | 'branch' | 'passthrough' | 'input' }[];
    }
  | { type: 'step:start'; stepId: string; input?: unknown }
  | { type: 'step:end'; stepId: string; output?: unknown; durationMs?: number }
  | { type: 'branch:evaluate'; stepId: string; matched: boolean; predicate?: string }
  | {
      type: 'llm:structured';
      stepId: string;
      schema: string;
      data: unknown;
      tokens?: { prompt: number; completion: number };
    }
  | { type: 'tool:call'; stepId: string; tool: string; input: unknown; output: unknown }
  | { type: 'suspend'; token: string; payload: unknown }
  | { type: 'resume'; decision: string; payload: unknown }
  | { type: 'done'; status: 'success' | 'failed' | 'suspended'; output: unknown; totalMs: number };

import { logger } from './logger.js';

export class Tracer {
  private listeners: Array<(e: TraceEvent) => void> = [];

  emit(event: TraceEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch (err) {
        // Never let a misbehaving subscriber kill the workflow. Log and move on.
        logger.warn('tracer_subscriber_threw', {
          eventType: event.type,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  subscribe(fn: (e: TraceEvent) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }
}

/** Serialize a TraceEvent to an SSE data line. */
export function sseLine(event: TraceEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
