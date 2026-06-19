/**
 * Local dev server for the playground UI.
 *
 * Endpoints:
 *   GET  /                        → static HTML
 *   GET  /style.css, /app.js      → static assets
 *   GET  /api/examples            → list of examples
 *   POST /api/run/:example        → JSON result (one-shot)
 *   GET  /api/stream/:example?input=...  → SSE trace stream
 *   POST /api/resume/:token       → resume a suspended workflow
 *
 * Run: npm run serve
 * Open: http://localhost:8917
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { Tracer, sseLine, type TraceEvent } from '../shared/tracer.js';
import { takeSuspendedRun } from '../shared/suspended-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8917;
const ROOT = join(__dirname, '..');

// Periodic cleanup of stale runs (>1 hour old, just to be tidy)
// (Suspended runs are stored in shared/suspended-store.ts in a globalThis Map.)
setInterval(
  () => {
    // Inlined to avoid adding a peek() function to the store API.
    const cutoff = Date.now() - 60 * 60 * 1000;
    const store = (globalThis as { __mastraPlaygroundSuspended?: Map<string, { suspendedAt: number }> })
      .__mastraPlaygroundSuspended;
    if (store) {
      for (const [token, sr] of store) {
        if (sr.suspendedAt < cutoff) store.delete(token);
      }
    }
  },
  10 * 60 * 1000,
).unref();

// ─── 1. Static file serving ────────────────────────────────────────────────
const STATIC_FILES: Record<string, string> = {
  '/': 'public/index.html',
  '/index.html': 'public/index.html',
  '/style.css': 'public/style.css',
  '/app.js': 'public/app.js',
};

async function serveStatic(path: string, res: http.ServerResponse): Promise<boolean> {
  const rel = STATIC_FILES[path];
  if (!rel) return false;
  const full = join(ROOT, rel);
  if (!existsSync(full)) return false;
  const content = await readFile(full);
  const ext = full.split('.').pop();
  const mime = ext === 'html' ? 'text/html' : ext === 'css' ? 'text/css' : 'application/javascript';
  res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8' });
  res.end(content);
  return true;
}

// ─── 2. Example registry ───────────────────────────────────────────────────
const EXAMPLES: Record<string, { file: string; exportName: string; description: string }> = {
  'support-triage': {
    file: 'examples/01-support-triage/index.ts',
    exportName: 'runOne',
    description: 'Customer-support triage. Classifies the message, routes to bot-reply or human-escalation.',
  },
  research: {
    file: 'examples/02-research-agent/index.ts',
    exportName: 'runOne',
    description: 'Research agent with two mocked tools (web-search, arxiv).',
  },
  'code-review': {
    file: 'examples/03-code-review-agent/index.ts',
    exportName: 'runOne',
    description: 'Code-review pipeline: read file → run lint → if issues, LLM writes a review.',
  },
  'parallel-research': {
    file: 'examples/04-parallel-research/index.ts',
    exportName: 'runOne',
    description: 'Parallel research: plan sub-questions, fan out to web+arxiv+wiki in parallel, synthesize.',
  },
  'multi-turn-chat': {
    file: 'examples/05-multi-turn-chat/index.ts',
    exportName: 'runOne',
    description:
      'Multi-turn chat with explicit conversation history. Send 3+ messages, see context persist, agent can escalate or look up orders.',
  },
  'hitl-approval': {
    file: 'examples/06-hitl-approval/index.ts',
    exportName: 'runOne',
    description:
      'Human-in-the-loop approval. High-risk actions suspend; human clicks Approve/Reject to resume.',
  },
};

type RunFn = (input: unknown, tracer: Tracer) => Promise<unknown>;

async function loadRunFn(name: string): Promise<RunFn> {
  const meta = EXAMPLES[name];
  if (!meta) throw new Error(`Unknown example: ${name}. Available: ${Object.keys(EXAMPLES).join(', ')}`);
  const url = `../${meta.file}?t=${Date.now()}`;
  const mod = (await import(url)) as Record<string, unknown>;
  const fn = mod[meta.exportName] as RunFn | undefined;
  if (typeof fn !== 'function') {
    throw new Error(`Example ${name} does not export '${meta.exportName}' as a function.`);
  }
  return fn;
}

// ─── 3. HTTP server ────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /api/examples
  if (req.method === 'GET' && req.url === '/api/examples') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify(Object.entries(EXAMPLES).map(([id, meta]) => ({ id, description: meta.description }))),
    );
    return;
  }

  // POST /api/run/:example — one-shot JSON result
  if (req.method === 'POST' && req.url?.startsWith('/api/run/')) {
    const name = req.url.slice('/api/run/'.length).split('?')[0];
    let body = '';
    for await (const chunk of req) body += chunk;
    let input: unknown = {};
    try {
      input = body ? JSON.parse(body) : {};
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }
    try {
      const fn = await loadRunFn(name);
      const tracer = new Tracer();
      const result = await fn(input, tracer);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: message }));
    }
    return;
  }

  // GET /api/stream/:example?input=... — SSE trace stream
  if (req.method === 'GET' && req.url?.startsWith('/api/stream/')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const name = url.pathname.slice('/api/stream/'.length);
    const inputParam = url.searchParams.get('input') ?? '{}';
    let input: unknown = {};
    try {
      input = JSON.parse(inputParam);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid input JSON' }));
      return;
    }
    return startSseStream(req, res, name, input);
  }

  // POST /api/resume/:token — resume a suspended workflow
  if (req.method === 'POST' && req.url?.startsWith('/api/resume/')) {
    const token = req.url.slice('/api/resume/'.length).split('?')[0];
    let body = '';
    for await (const chunk of req) body += chunk;
    let payload: { decision?: 'approved' | 'rejected' } = {};
    try {
      payload = body ? JSON.parse(body) : {};
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }
    return resumeSuspended(res, token, payload);
  }

  // Static files
  if (req.method === 'GET') {
    const served = await serveStatic(req.url || '/', res);
    if (served) return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

// ─── 4. SSE handler ────────────────────────────────────────────────────────
function startSseStream(_req: http.IncomingMessage, res: http.ServerResponse, name: string, input: unknown) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');

  const send = (event: TraceEvent) => {
    try {
      res.write(sseLine(event));
    } catch {
      // Client disconnected
    }
  };

  let unsub: (() => void) | null = null;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (unsub) unsub();
  };

  reqSocketCleanup(_req, cleanup);

  (async () => {
    try {
      const fn = await loadRunFn(name);
      const tracer = new Tracer();
      unsub = tracer.subscribe(send);
      await fn(input, tracer);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send({ type: 'done', status: 'failed', output: { error: message }, totalMs: 0 });
    } finally {
      res.end();
    }
  })();
}

function reqSocketCleanup(req: http.IncomingMessage, cleanup: () => void) {
  req.on('close', cleanup);
  req.on('aborted', cleanup);
}

// ─── 5. Resume handler ───────────────────────────────────────────────────
async function resumeSuspended(
  res: http.ServerResponse,
  token: string,
  payload: { decision?: 'approved' | 'rejected' },
) {
  const sr = takeSuspendedRun(token);
  if (!sr) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `No suspended run with token ${token}` }));
    return;
  }
  try {
    const decision = payload.decision ?? 'rejected';
    const result = (await sr.run.resume({
      step: sr.step,
      resumeData: { decision },
    })) as Record<string, unknown>;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        result: { status: result.status, output: result.result, error: result.error },
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: message }));
  }
}

server.listen(PORT, () => {
  console.log(`\n  Mastra Playground UI: http://localhost:${PORT}\n`);
  console.log('  Open in your browser. Make sure OPENAI_API_KEY is set in .env.\n');
});
