import { describe, it, expect } from 'vitest';
import { Tracer } from './tracer';
import { stepStart, stepEnd, llmStructured, toolCall, branchEvaluate, startRun } from './traced-step';

describe('traced-step helpers', () => {
  function newTracer() {
    const t = new Tracer();
    const events: unknown[] = [];
    t.subscribe((e) => events.push(e));
    return { tracer: t, events };
  }

  it('stepStart emits a step:start event with input', () => {
    const t = new Tracer();
    const got: unknown[] = [];
    t.subscribe((e) => got.push(e));
    stepStart(t, 'classify', { topic: 'x' });
    expect(got).toEqual([{ type: 'step:start', stepId: 'classify', input: { topic: 'x' } }]);
  });

  it('stepEnd emits a step:end event with duration', () => {
    const t = new Tracer();
    const got: unknown[] = [];
    t.subscribe((e) => got.push(e));
    stepEnd(t, 'classify', { result: 42, durationMs: 100 });
    expect(got[0]).toEqual({ type: 'step:end', stepId: 'classify', output: { result: 42, durationMs: 100 } });
  });

  it('llmStructured emits a typed event with the schema name and data', () => {
    const t = new Tracer();
    const got: unknown[] = [];
    t.subscribe((e) => got.push(e));
    llmStructured(t, 'classify', 'MySchema', { foo: 'bar' });
    const evt = got[0] as { type: string; schema: string; data: unknown };
    expect(evt.type).toBe('llm:structured');
    expect(evt.schema).toBe('MySchema');
    expect(evt.data).toEqual({ foo: 'bar' });
  });

  it('toolCall emits a tool:call event with input and output', () => {
    const t = new Tracer();
    const got: unknown[] = [];
    t.subscribe((e) => got.push(e));
    toolCall(t, 'fanout', 'web-search', { q: 'x' }, { results: [] });
    const evt = got[0] as { type: string; tool: string; input: unknown; output: unknown };
    expect(evt.type).toBe('tool:call');
    expect(evt.tool).toBe('web-search');
    expect(evt.input).toEqual({ q: 'x' });
    expect(evt.output).toEqual({ results: [] });
  });

  it('branchEvaluate emits a branch:evaluate event with the predicate string', () => {
    const t = new Tracer();
    const got: unknown[] = [];
    t.subscribe((e) => got.push(e));
    branchEvaluate(t, 'gate', true, 'urgency === "critical"');
    expect(got[0]).toEqual({
      type: 'branch:evaluate',
      stepId: 'gate',
      matched: true,
      predicate: 'urgency === "critical"',
    });
  });

  it('startRun emits a start event and returns a number timestamp', () => {
    const { tracer, events } = newTracer();
    const steps = [{ id: 'a', label: 'Step A', kind: 'llm' as const }];
    const t0 = startRun(tracer, 'test-workflow', { foo: 'bar' }, steps);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'start', workflow: 'test-workflow', input: { foo: 'bar' }, steps });
    expect(typeof t0).toBe('number');
  });

  it('stepStart and stepEnd are emitted in order from a real traced run', () => {
    const t = new Tracer();
    const got: unknown[] = [];
    t.subscribe((e) => got.push(e));
    stepStart(t, 'classify', { x: 1 });
    stepEnd(t, 'classify', { result: 1, durationMs: 50 });
    expect(got).toHaveLength(2);
    expect((got[0] as { type: string }).type).toBe('step:start');
    expect((got[1] as { type: string }).type).toBe('step:end');
  });
});
