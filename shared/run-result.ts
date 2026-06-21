/**
 * Helpers for emitting the terminal `done` trace event and shaping the
 * RunResult return value from a Mastra WorkflowRunResult. Extracted from
 * the boilerplate tail block that used to live at the bottom of every
 * example's runOne().
 */

import { unwrapWorkflowOutput } from './workflow-helpers';
import type { Tracer } from './tracer';

export type RunResultStatus = 'success' | 'failed' | 'suspended';

export type RunResult<TInput = unknown, TOutput = unknown> = {
  status: RunResultStatus;
  input: TInput;
  output: TOutput | null;
  error: string | null;
};

/**
 * Finalise a workflow run result.
 *
 * @param result     The raw result from `run.start()`.
 * @param tracer     The tracer for emitting the `done` event.
 * @param t0         Timestamp from `startRun()` or `Date.now()`.
 * @param echoInput  The original input to echo back.
 * @param runId      Optional runId passed through to suspended output so the
 *                   caller (e.g. ex 06) can expose a resumption token.
 */
export function finalizeRunResult<TInput = unknown>(
  result: unknown,
  tracer: Tracer,
  t0: number,
  echoInput: TInput,
  runId?: string,
): RunResult<TInput, unknown> {
  // Narrow Mastra's broader status union to the tracer's expected set.
  const rawStatus = (result as { status?: string } | null)?.status;
  const status: RunResultStatus =
    rawStatus === 'success' || rawStatus === 'failed' || rawStatus === 'suspended' ? rawStatus : 'failed';

  let output: unknown;
  let error: string | null;

  if (status === 'suspended') {
    const r = result as {
      suspendedStep?: { id?: string };
      suspendPayload?: unknown;
    };
    output = { token: runId ?? null, suspendedStep: r.suspendedStep, suspendedPayload: r.suspendPayload };
    error = null;
  } else if (status === 'success') {
    output = unwrapWorkflowOutput((result as { result: unknown }).result);
    error = null;
  } else {
    output = null;
    error = JSON.stringify(result) ?? String(result);
  }

  tracer.emit({ type: 'done', status, output, totalMs: Date.now() - t0 });
  return { status, input: echoInput, output, error };
}
