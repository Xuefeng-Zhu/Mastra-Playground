import { describe, it, expect } from 'vitest';
import { Tracer, sseLine, type TraceEvent } from './tracer';

describe('Tracer', () => {
  it('emits events to all subscribers in order', () => {
    const t = new Tracer();
    const a: TraceEvent[] = [];
    const b: TraceEvent[] = [];
    t.subscribe((e) => a.push(e));
    t.subscribe((e) => b.push(e));
    t.emit({ type: 'start', workflow: 'x', input: {}, steps: [] });
    t.emit({ type: 'step:start', stepId: 's1' });
    expect(a).toEqual([
      { type: 'start', workflow: 'x', input: {}, steps: [] },
      { type: 'step:start', stepId: 's1' },
    ]);
    expect(b).toEqual(a);
  });

  it('stops delivering events after unsubscribe', () => {
    const t = new Tracer();
    const events: TraceEvent[] = [];
    const unsub = t.subscribe((e) => events.push(e));
    t.emit({ type: 'start', workflow: 'x', input: {}, steps: [] });
    unsub();
    t.emit({ type: 'step:start', stepId: 's1' });
    expect(events).toHaveLength(1);
  });

  it('catches errors thrown by subscribers and continues', () => {
    const t = new Tracer();
    const good: TraceEvent[] = [];
    t.subscribe(() => {
      throw new Error('subscriber crash');
    });
    t.subscribe((e) => good.push(e));
    // Should not throw despite the first subscriber crashing
    expect(() => t.emit({ type: 'start', workflow: 'x', input: {}, steps: [] })).not.toThrow();
    expect(good).toHaveLength(1);
  });

  it('returns a noop unsubscribe when subscribe is called on an empty listener list', () => {
    const t = new Tracer();
    const unsub = t.subscribe(() => {});
    unsub();
    // Calling unsubscribe twice should not throw
    expect(() => unsub()).not.toThrow();
  });
});

describe('sseLine', () => {
  it('formats an event as SSE data line with trailing newlines', () => {
    const line = sseLine({ type: 'start', workflow: 'x', input: {}, steps: [] });
    expect(line.endsWith('\n\n')).toBe(true);
    expect(line).toContain('data: ');
    expect(line).toContain('"type":"start"');
  });

  it('handles unicode in event payloads', () => {
    const line = sseLine({ type: 'llm:structured', stepId: 's', schema: 'X', data: { msg: 'héllo 🌍' } });
    expect(line).toContain('héllo');
    expect(line).toContain('🌍');
  });
});
