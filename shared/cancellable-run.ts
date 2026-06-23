import type { CustomLlmConfig } from './llm';
import { logger } from './logger';

export interface RunContext {
  signal?: AbortSignal;
  /** Request-scoped custom LLM configuration (browser-supplied, never logged). */
  customLlm?: CustomLlmConfig;
}

interface CancellableRun {
  cancel(): Promise<void>;
}

export function cancelRunOnSignal(
  run: CancellableRun,
  context?: RunContext,
  onError: (error: unknown) => void = (error) =>
    logger.warn('workflow_cancel_failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
): () => void {
  const signal = context?.signal;
  if (!signal) return () => undefined;
  const cancel = () => {
    void run.cancel().catch(onError);
  };
  if (signal.aborted) cancel();
  else signal.addEventListener('abort', cancel, { once: true });
  return () => signal.removeEventListener('abort', cancel);
}

export async function runWithCancellation<T>(
  run: CancellableRun,
  context: RunContext | undefined,
  start: () => Promise<T>,
  onCancelError?: (error: unknown) => void,
): Promise<T> {
  const detach = cancelRunOnSignal(run, context, onCancelError);
  try {
    return await start();
  } finally {
    detach();
  }
}
