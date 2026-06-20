import { describe, it, expect } from 'vitest';
import { Tracer } from './tracer.js';
import { finalizeRunResult } from './run-result.js';

describe('finalizeRunResult', () => {
  it('returns success status, output, null error for success result', () => {
    const tracer = new Tracer();
    const events: unknown[] = [];
    tracer.subscribe((e) => events.push(e));
    // multi-key so unwrapWorkflowOutput does not single-key-flatten it
    const result = { status: 'success', result: { foo: 'bar', n: 1 } };
    const r = finalizeRunResult(result, tracer, 100, { msg: 'hi' });
    expect(r.status).toBe('success');
    expect(r.output).toEqual({ foo: 'bar', n: 1 });
    expect(r.error).toBeNull();
    expect(r.input).toEqual({ msg: 'hi' });
    expect(events.some((e) => (e as { type: string }).type === 'done')).toBe(true);
  });

  it('returns failed status with JSON.stringify of result as error', () => {
    const tracer = new Tracer();
    const r = finalizeRunResult({ status: 'failed', reason: 'oops' }, tracer, 0, null);
    expect(r.status).toBe('failed');
    expect(r.error).toContain('oops');
    expect(r.output).toBeNull();
  });

  it('narrows unknown statuses (e.g. tripwire, paused) to failed', () => {
    const tracer = new Tracer();
    expect(finalizeRunResult({ status: 'tripwire' }, tracer, 0, null).status).toBe('failed');
    expect(finalizeRunResult({ status: 'paused' }, tracer, 0, null).status).toBe('failed');
  });

  it('emits done event with computed totalMs', () => {
    const tracer = new Tracer();
    const events: unknown[] = [];
    tracer.subscribe((e) => events.push(e));
    finalizeRunResult({ status: 'success', result: {} }, tracer, 1000, null);
    const done = events.find((e) => (e as { type: string }).type === 'done') as
      | { totalMs: number }
      | undefined;
    expect(done).toBeDefined();
    expect(done!.totalMs).toBeGreaterThanOrEqual(0);
  });
});
