import { describe, expect, it } from 'vitest';
import { createTraceEventParser } from './sse';

describe('createTraceEventParser', () => {
  it('parses events split across arbitrary chunks and ignores comments', () => {
    const events: unknown[] = [];
    const parser = createTraceEventParser((event) => events.push(event));
    parser.push(': connected\r\n\r\ndata: {"type":"llm:delta","stepId":"write",');
    parser.push('"text":"hello","index":0}\n\n');
    parser.push('data: {"type":"done","status":"success","output":{},"totalMs":1}');
    parser.finish();
    expect(events).toHaveLength(2);
    expect(events.map((event) => (event as { type: string }).type)).toEqual(['llm:delta', 'done']);
  });
});
