/**
 * Traced workflow helpers.
 *
 * Provides:
 *   - tracedExecute: wraps a step's `execute` to emit start/end events
 *   - traceStep: declares a step in the tracer's "steps" registry (for the DAG)
 *   - LLM helpers that emit `llm:structured` events
 *
 * The tracer is passed into each step's execute. Steps call:
 *   tracer.emit({ type: 'step:start', stepId, input })
 *   ... do the work ...
 *   tracer.emit({ type: 'step:end', stepId, output, durationMs })
 */

import type { Tracer, TraceEvent } from './tracer.js';

export type StepKind = 'llm' | 'tool' | 'branch' | 'passthrough';

export interface StepSpec {
  id: string;
  label: string;
  kind: StepKind;
}

export function stepStart(tracer: Tracer, stepId: string, input?: unknown) {
  tracer.emit({ type: 'step:start', stepId, input });
}

export function stepEnd(tracer: Tracer, stepId: string, output?: unknown) {
  tracer.emit({ type: 'step:end', stepId, output });
}

export function llmStructured(
  tracer: Tracer,
  stepId: string,
  schema: string,
  data: unknown,
  tokens?: { prompt: number; completion: number },
) {
  tracer.emit({ type: 'llm:structured', stepId, schema, data, tokens });
}

export function toolCall(
  tracer: Tracer,
  stepId: string,
  tool: string,
  input: unknown,
  output: unknown,
) {
  tracer.emit({ type: 'tool:call', stepId, tool, input, output });
}

export function branchEvaluate(
  tracer: Tracer,
  stepId: string,
  matched: boolean,
  predicate?: string,
) {
  tracer.emit({ type: 'branch:evaluate', stepId, matched, predicate });
}

/** Helper: time a step's execute. Returns a wrapped execute that emits events. */
export async function timed<T>(
  tracer: Tracer,
  stepId: string,
  input: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  stepStart(tracer, stepId, input);
  try {
    const out = await fn();
    const durationMs = Date.now() - t0;
    stepEnd(tracer, stepId, { ...(out as object), durationMs });
    return out;
  } catch (err) {
    const errorDetail = err instanceof Error
      ? { message: err.message, name: err.name, stack: err.stack }
      : { message: String(err) };
    tracer.emit({ type: 'step:end', stepId, output: { error: errorDetail } });
    throw err;
  }
}
