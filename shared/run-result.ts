/**
 * Helpers for emitting the terminal `done` trace event and shaping the
 * RunResult return value from a Mastra WorkflowRunResult. Extracted from
 * the boilerplate tail block that used to live at the bottom of every
 * example's runOne().
 */

import { unwrapWorkflowOutput } from './workflow-helpers.js';
import type { Tracer } from './tracer.js';

export type RunResultStatus = 'success' | 'failed' | 'suspended';

export type RunResult<TInput = unknown, TOutput = unknown> = {
  status: RunResultStatus;
  input: TInput;
  output: TOutput | null;
  error: string | null;
};

export function finalizeRunResult<TInput = unknown>(
  result: unknown,
  tracer: Tracer,
  t0: number,
  echoInput: TInput,
): RunResult<TInput, unknown> {
  // Narrow Mastra's broader status union ('success' | 'failed' | 'suspended' | 'tripwire' | 'paused' | ...) to the tracer's expected set.
  const rawStatus = (result as { status?: string } | null)?.status;
  const status: RunResultStatus =
    rawStatus === 'success' || rawStatus === 'failed' || rawStatus === 'suspended' ? rawStatus : 'failed';
  const output = status === 'success' ? unwrapWorkflowOutput((result as { result: unknown }).result) : null;
  const error = status !== 'success' ? (JSON.stringify(result) ?? String(result)) : null;
  tracer.emit({ type: 'done', status, output, totalMs: Date.now() - t0 });
  return { status, input: echoInput, output, error };
}
