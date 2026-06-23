import { describe, expect, it, vi } from 'vitest';
import { cancelRunOnSignal, runWithCancellation } from './cancellable-run';

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

  it('reports cancellation failures without creating an unhandled rejection', async () => {
    const controller = new AbortController();
    const failure = new Error('cancel failed');
    const onError = vi.fn();
    const run = { cancel: vi.fn().mockRejectedValue(failure) };
    cancelRunOnSignal(run, { signal: controller.signal }, onError);
    controller.abort();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it('detaches the abort listener after the run settles', async () => {
    const controller = new AbortController();
    const run = { cancel: vi.fn().mockResolvedValue(undefined) };
    await expect(runWithCancellation(run, { signal: controller.signal }, async () => 'done')).resolves.toBe(
      'done',
    );
    controller.abort();
    expect(run.cancel).not.toHaveBeenCalled();
  });
});
