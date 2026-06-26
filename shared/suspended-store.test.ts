import { describe, expect, it, vi } from 'vitest';
import { registerSuspendedRun, takeSuspendedRun } from './suspended-store';

describe('suspended-store', () => {
  it('registers suspended runs with a timestamp and consumes them once', async () => {
    const resume = vi.fn().mockResolvedValue({ status: 'success' });
    const token = `token-${crypto.randomUUID()}`;

    registerSuspendedRun(token, {
      run: { resume },
      step: 'gate',
      workflow: 'hitl',
      mastra: null,
    });

    const first = takeSuspendedRun(token);
    expect(first).toMatchObject({ step: 'gate', workflow: 'hitl' });
    expect(first?.suspendedAt).toEqual(expect.any(Number));
    expect(takeSuspendedRun(token)).toBeUndefined();
  });
});
