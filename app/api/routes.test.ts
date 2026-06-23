import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getExamples } from './examples/route';
import { GET as getHealth } from './health/route';
import { POST as runExample } from './run/[example]/route';
import { POST as streamExample } from './stream/[example]/route';
import { POST as resumeExample } from './resume/[token]/route';
import { GET as getSource } from './source/[example]/route';
import { apiErrorResponse, requestClientIp } from './route-helpers';

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
