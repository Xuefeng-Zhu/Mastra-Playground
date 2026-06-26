import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamCustomWorkflow, streamWorkflow } from './workflow-stream';

afterEach(() => vi.unstubAllGlobals());

describe('streamWorkflow', () => {
  it('posts the request and delivers parsed events', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('data: {"type":"done","status":"success","output":{},"totalMs":1}\n\n'),
      );
    vi.stubGlobal('fetch', fetchMock);
    const events: unknown[] = [];
    await streamWorkflow({
      slug: 'research',
      requestBody: { topic: 'agents' },
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/stream/research',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(events).toHaveLength(1);
  });

  it('rejects streams that close without a done event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(': connected\n\n')));
    await expect(
      streamWorkflow({
        slug: 'research',
        requestBody: {},
        signal: new AbortController().signal,
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow('disconnected');
  });

  it('uses server validation messages from non-OK responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ error: 'Topic is required' }), { status: 400 })),
    );

    await expect(
      streamWorkflow({
        slug: 'research',
        requestBody: {},
        signal: new AbortController().signal,
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow('Topic is required');
  });

  it('posts custom workflow runs to the custom stream endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('data: {"type":"done","status":"success","output":{},"totalMs":1}\n\n'),
      );
    vi.stubGlobal('fetch', fetchMock);

    await streamCustomWorkflow({
      requestBody: { workflow: { id: 'demo' }, input: { prompt: 'hello' } },
      signal: new AbortController().signal,
      onEvent: vi.fn(),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/custom-workflow/stream',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
