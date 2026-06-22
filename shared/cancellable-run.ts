export interface RunContext {
  signal?: AbortSignal;
}

interface CancellableRun {
  cancel(): Promise<void>;
}

export function cancelRunOnSignal(run: CancellableRun, context?: RunContext): void {
  const signal = context?.signal;
  if (!signal) return;
  const cancel = () => void run.cancel();
  if (signal.aborted) cancel();
  else signal.addEventListener('abort', cancel, { once: true });
}
