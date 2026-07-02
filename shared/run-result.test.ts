import { describe, it, expect } from 'vitest';
import { Tracer } from './tracer';
import { finalizeRunResult } from './run-result';

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
    expect(r.output).toEqual({ error: expect.stringContaining('oops') });
  });

  it('allows callers to sanitize failed workflow messages', () => {
    const tracer = new Tracer();
    const r = finalizeRunResult(
      { status: 'failed', input: { secret: 'raw' } },
      tracer,
      0,
      { safe: true },
      undefined,
      { failureMessage: () => 'redacted failure' },
    );
    expect(r.error).toBe('redacted failure');
    expect(JSON.stringify(r)).not.toContain('raw');
  });

  it('falls back when a failed workflow result cannot be JSON stringified', () => {
    const tracer = new Tracer();
    const circular: { status: string; self?: unknown } = { status: 'failed' };
    circular.self = circular;

    const r = finalizeRunResult(circular, tracer, 0, null);

    expect(r.status).toBe('failed');
    expect(r.error).toBe('[object Object]');
    expect(r.output).toEqual({ error: '[object Object]' });
  });

  it('falls back when a custom failure message throws', () => {
    const tracer = new Tracer();
    const r = finalizeRunResult({ status: 'failed', reason: 'oops' }, tracer, 0, null, undefined, {
      failureMessage: () => {
        throw new Error('formatter failed');
      },
    });

    expect(r.status).toBe('failed');
    expect(r.error).toContain('oops');
  });

  it('narrows unknown statuses (e.g. tripwire, paused) to failed', () => {
    const tracer = new Tracer();
    expect(finalizeRunResult({ status: 'tripwire' }, tracer, 0, null).status).toBe('failed');
    expect(finalizeRunResult({ status: 'paused' }, tracer, 0, null).status).toBe('failed');
  });

  it('returns suspended status with token and suspended metadata when result is suspended', () => {
    const tracer = new Tracer();
    const events: unknown[] = [];
    tracer.subscribe((e) => events.push(e));
    const result = {
      status: 'suspended',
      suspendedStep: { id: 'gate' },
      suspendPayload: { action: 'refund $500' },
    };
    const r = finalizeRunResult(result, tracer, 100, { action: 'test' }, 'run-abc-123');
    expect(r.status).toBe('suspended');
    expect(r.output).toEqual({
      token: 'run-abc-123',
      suspendedStep: { id: 'gate' },
      suspendedPayload: { action: 'refund $500' },
    });
    expect(r.error).toBeNull();
    expect(r.input).toEqual({ action: 'test' });
    const done = events.find((e) => (e as { type: string }).type === 'done') as
      | { status: string; output: unknown }
      | undefined;
    expect(done).toBeDefined();
    expect(done!.status).toBe('suspended');
  });

  it('returns suspended status with null token when runId is omitted', () => {
    const tracer = new Tracer();
    const result = { status: 'suspended', suspendedStep: { id: 'gate' } };
    const r = finalizeRunResult(result, tracer, 0, null);
    expect(r.status).toBe('suspended');
    expect((r.output as { token: unknown }).token).toBeNull();
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
