import { describe, expect, it, vi } from 'vitest';
import { cancelRunOnSignal } from './cancellable-run';

describe('cancelRunOnSignal', () => {
  it('cancels when the request signal aborts', () => {
    const controller = new AbortController();
    const run = { cancel: vi.fn().mockResolvedValue(undefined) };
    cancelRunOnSignal(run, { signal: controller.signal });
    controller.abort();
    expect(run.cancel).toHaveBeenCalledOnce();
  });

  it('cancels immediately for an already-aborted signal', () => {
    const controller = new AbortController();
    controller.abort();
    const run = { cancel: vi.fn().mockResolvedValue(undefined) };
    cancelRunOnSignal(run, { signal: controller.signal });
    expect(run.cancel).toHaveBeenCalledOnce();
  });
});
