import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunFn } from '../../shared/examples-registry';
import { loadRunFn } from '../../shared/examples-registry';
import { POST as runExample } from './run/[example]/route';

vi.mock('../../shared/examples-registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/examples-registry')>();
  return {
    ...actual,
    loadRunFn: vi.fn(),
  };
});

function post(path: string, body: unknown, ip: string) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify(body),
  });
}

describe('run example route', () => {
  beforeEach(() => {
    vi.mocked(loadRunFn).mockReset();
  });

  it('passes the request abort signal and LLM config into the example run', async () => {
    const run = vi.fn<RunFn>().mockResolvedValue({ status: 'success', output: { answer: 'ok' } });
    vi.mocked(loadRunFn).mockResolvedValue(run);

    const request = post(
      '/api/run/research',
      {
        topic: 'route cancellation',
        provider: 'custom',
        customBaseUrl: 'https://provider.example/v1',
        customApiKey: 'secret-key',
        customModel: 'demo-model',
      },
      'run-route-test-context',
    );
    const response = await runExample(request, { params: Promise.resolve({ example: 'research' }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      result: { status: 'success', output: { answer: 'ok' } },
    });
    expect(run).toHaveBeenCalledWith({ topic: 'route cancellation', provider: 'custom' }, expect.anything(), {
      signal: request.signal,
      llmConfig: {
        provider: 'custom',
        baseUrl: 'https://provider.example/v1',
        apiKey: 'secret-key',
        model: 'demo-model',
      },
    });
  });
});
