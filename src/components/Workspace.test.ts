import { describe, expect, it } from 'vitest';
import type { ReceivedTraceEvent } from '../hooks/useWorkspace';
import { traceEventToTimelineEntry } from './Workspace';

describe('traceEventToTimelineEntry', () => {
  it('preserves event identity and formats event-specific details', () => {
    const received: ReceivedTraceEvent = {
      id: '7',
      ts: 42,
      event: {
        type: 'branch:evaluate',
        stepId: 'branch.intent',
        matched: true,
        predicate: 'intent is billing',
      },
    };

    expect(traceEventToTimelineEntry(received, true)).toEqual({
      id: '7',
      ts: 42,
      kind: 'branch',
      msg: 'Branch matched: intent is billing',
      step: 'branch.intent',
      active: true,
      eventType: 'branch:evaluate',
      payload: received.event,
    });
  });

  it('keeps individual LLM delta events visible', () => {
    const received: ReceivedTraceEvent = {
      id: '8',
      ts: 43,
      event: { type: 'llm:delta', stepId: 'write', text: 'token', index: 3 },
    };

    expect(traceEventToTimelineEntry(received, false).msg).toBe('LLM delta #3: token');
  });
});
