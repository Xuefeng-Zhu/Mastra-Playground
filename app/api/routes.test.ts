import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getExamples } from './examples/route';
import { GET as getHealth } from './health/route';
import { POST as runExample } from './run/[example]/route';
import { POST as streamExample } from './stream/[example]/route';
import { POST as streamCustomWorkflow } from './custom-workflow/stream/route';
import { POST as resumeExample } from './resume/[token]/route';
import { GET as getSource } from './source/[example]/route';
import { apiErrorResponse, requestClientIp } from './route-helpers';
import { registerSuspendedRun } from '../../shared/suspended-store';

function post(path: string, body: unknown, ip: string) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify(body),
  });
}

describe('API routes', () => {
  it('reports health and registered examples', async () => {
    const health = await getHealth();
    const examples = await getExamples();
    await expect(health.json()).resolves.toMatchObject({ ok: true, exampleCount: 13 });
    await expect(examples.json()).resolves.toHaveLength(13);
  });

  it('returns source for a known example and validation for an unknown one', async () => {
    const known = await getSource(new NextRequest('http://localhost/api/source/research'), {
      params: Promise.resolve({ example: 'research' }),
    });
    expect(known.status).toBe(200);
    await expect(known.json()).resolves.toMatchObject({ filename: 'examples/02-research-agent/index.ts' });

    const unknown = await getSource(new NextRequest('http://localhost/api/source/missing'), {
      params: Promise.resolve({ example: 'missing' }),
    });
    expect(unknown.status).toBe(400);
  });

  it('rejects invalid run and stream requests before loading a workflow', async () => {
    const run = await runExample(post('/api/run/missing', {}, 'route-test-run'), {
      params: Promise.resolve({ example: 'missing' }),
    });
    expect(run.status).toBe(400);

    const stream = await streamExample(post('/api/stream/research', {}, 'route-test-stream'), {
      params: Promise.resolve({ example: 'research' }),
    });
    expect(stream.status).toBe(400);
    await expect(stream.json()).resolves.toMatchObject({ field: 'topic' });
  });

  it('validates custom workflow stream requests before opening a stream', async () => {
    const response = await streamCustomWorkflow(
      post('/api/custom-workflow/stream', { input: { prompt: 'hello' } }, 'route-test-custom-invalid'),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ field: 'workflow' });
  });

  it('streams a tool-only custom workflow without an LLM provider', async () => {
    const workflow = {
      version: 1,
      id: 'tool-only',
      name: 'Tool Only',
      input: { label: 'Prompt' },
      nodes: [
        { id: 'input', type: 'input', label: 'Input' },
        {
          id: 'echo',
          type: 'tool',
          label: 'Echo',
          toolId: 'echo',
          inputTemplate: '{{input.prompt}}',
          outputKey: 'echo_result',
        },
        { id: 'output', type: 'output', label: 'Output', template: '{{echo_result}}' },
      ],
      edges: [
        { from: 'input', to: 'echo' },
        { from: 'echo', to: 'output' },
      ],
    };

    const response = await streamCustomWorkflow(
      post(
        '/api/custom-workflow/stream',
        { workflow, input: { prompt: 'hello from route test' } },
        'route-test-custom-success',
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const body = await response.text();
    expect(body).toContain(': connected');
    expect(body).toContain('"type":"tool:call"');
    expect(body).toContain('"status":"success"');
    expect(body).toContain('hello from route test');
  });

  it('rejects invalid HITL decisions', async () => {
    const response = await resumeExample(
      post('/api/resume/token', { decision: 'maybe' }, 'route-test-resume'),
      {
        params: Promise.resolve({ token: 'token' }),
      },
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ field: 'decision' });
  });

  it('returns 404 for missing suspended runs', async () => {
    const response = await resumeExample(
      post('/api/resume/missing-token', { decision: 'approved' }, 'route-test-resume-missing'),
      {
        params: Promise.resolve({ token: 'missing-token' }),
      },
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('missing-token') });
  });

  it('resumes a registered suspended run once', async () => {
    const token = `route-token-${crypto.randomUUID()}`;
    const resume = vi.fn().mockResolvedValue({
      status: 'success',
      result: { executed: true, message: 'approved' },
    });
    registerSuspendedRun(token, {
      run: { resume },
      step: 'gate',
      workflow: 'hitl',
      mastra: null,
    });

    const response = await resumeExample(
      post(`/api/resume/${token}`, { decision: 'approved' }, 'route-test-resume-success'),
      {
        params: Promise.resolve({ token }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      result: {
        status: 'success',
        output: { executed: true, message: 'approved' },
      },
    });
    expect(resume).toHaveBeenCalledWith({ step: 'gate', resumeData: { decision: 'approved' } });

    const second = await resumeExample(
      post(`/api/resume/${token}`, { decision: 'approved' }, 'route-test-resume-consumed'),
      {
        params: Promise.resolve({ token }),
      },
    );
    expect(second.status).toBe(404);
  });

  it('normalizes client IPs and hides unexpected server errors', async () => {
    expect(
      requestClientIp(
        new Request('http://localhost', { headers: { 'X-Forwarded-For': '203.0.113.1, 10.0.0.1' } }),
      ),
    ).toBe('203.0.113.1');
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const response = apiErrorResponse(new Error('database password leaked'), 'test');
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({ error: 'Internal server error' });
    expect(JSON.stringify(body).includes('password')).toBe(false);
    write.mockRestore();
  });
});
