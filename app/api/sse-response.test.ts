import { describe, expect, it, vi } from 'vitest';
import { traceStreamResponse } from './sse-response';
import type { TraceEvent } from '../../shared/tracer';

function parseSseEvents(body: string): TraceEvent[] {
  return body
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice('data: '.length)) as TraceEvent);
}

describe('traceStreamResponse', () => {
  it('streams trace events emitted by the run callback', async () => {
    const response = traceStreamResponse(
      new Request('http://localhost/api/stream/demo'),
      async (tracer) => {
        tracer.emit({
          type: 'start',
          workflow: 'demo',
          input: { topic: 'routing' },
          steps: [{ id: 'input', label: 'Input', kind: 'input' }],
        });
        tracer.emit({ type: 'done', status: 'success', output: { ok: true }, totalMs: 3 });
      },
      { event: 'demo_stream_failed' },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const body = await response.text();
    expect(body).toContain(': connected');
    expect(parseSseEvents(body)).toEqual([
      {
        type: 'start',
        workflow: 'demo',
        input: { topic: 'routing' },
        steps: [{ id: 'input', label: 'Input', kind: 'input' }],
      },
      { type: 'done', status: 'success', output: { ok: true }, totalMs: 3 },
    ]);
  });

  it('hides thrown errors from the client and logs an error id for operators', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const response = traceStreamResponse(
      new Request('http://localhost/api/stream/demo'),
      async () => {
        throw new Error('provider key leaked');
      },
      { event: 'demo_stream_failed', fields: { workflow: 'demo' } },
    );

    const body = await response.text();
    const events = parseSseEvents(body);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'done',
      status: 'failed',
      output: { error: 'Workflow failed', errorId: expect.any(String) },
      totalMs: 0,
    });
    expect(body).not.toContain('provider key leaked');
    expect(write).toHaveBeenCalledWith(expect.stringContaining('"msg":"demo_stream_failed"'));
    expect(write).toHaveBeenCalledWith(expect.stringContaining('"error":"provider key leaked"'));

    write.mockRestore();
  });
});
