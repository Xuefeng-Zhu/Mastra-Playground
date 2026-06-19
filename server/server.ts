/**
 * Local dev server for the playground UI.
 *
 * Endpoints:
 *   GET  /                          → static HTML
 *   GET  /style.css, /app.js        → static assets
 *   GET  /api/health                → liveness probe (200 always if process is up)
 *   GET  /api/examples              → list of examples
 *   POST /api/run/:example          → JSON result (one-shot)
 *   GET  /api/stream/:example?input=…  → SSE trace stream
 *   POST /api/resume/:token         → resume a suspended workflow
 *
 * Run: npm run serve
 * Open: http://localhost:8917
 *
 * Wave 2 hardening: structured logger, secrets check on boot, request
 * validation, per-IP rate limiting, graceful shutdown, /api/health.
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { Tracer, sseLine, type TraceEvent } from '../shared/tracer.js';
import { takeSuspendedRun } from '../shared/suspended-store.js';
import { logger } from '../shared/logger.js';
import {
  ValidationError,
  NotFoundError,
  RateLimitError,
  readJsonBody,
  isPlainObject,
  checkRateLimit,
  clientIp,
  sanitizeText,
} from '../shared/validation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8917;
const ROOT = join(__dirname, '..');
const STARTED_AT = Date.now();
const PLACEHOLDER_KEYS = new Set(['', 'your-key-here', 'changeme', '[redacted]']);

// ─── Secrets hardening (boot check) ───────────────────────────────────────
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey || PLACEHOLDER_KEYS.has(apiKey.toLowerCase())) {
  logger.error('openai_api_key_missing_or_placeholder', {
    port: PORT,
    hint: 'Copy .env.example to .env and set OPENAI_API_KEY. See README "Environment variables".',
  });
  console.error('\n  FATAL: OPENAI_API_KEY is missing or is the .env.example placeholder.\n');
  console.error('  Copy .env.example to .env and set OPENAI_API_KEY=<your-key>.');
  console.error('  See README "Environment variables" for OpenRouter setup.\n');
  process.exit(1);
}
logger.info('server_starting', { port: PORT, nodeEnv: process.env.NODE_ENV ?? 'unset' });

// Periodic cleanup of stale runs (>1 hour old, just to be tidy)
const cleanupInterval = setInterval(
  () => {
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
);
cleanupInterval.unref();

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
  'streaming-chat': {
    file: 'examples/07-streaming-chat/index.ts',
    exportName: 'runOne',
    description: 'Streaming tokens: LLM response appears token-by-token via Agent.stream().',
  },
  'critic-loop': {
    file: 'examples/08-critic-loop/index.ts',
    exportName: 'runOne',
    description:
      'Evaluator-optimizer: generate → critique → regenerate using the feedback until the score meets the threshold or the iteration budget runs out.',
  },
  'multi-agent-handoff': {
    file: 'examples/09-multi-agent-handoff/index.ts',
    exportName: 'runOne',
    description:
      'Multi-agent handoff: primary triage agent delegates billing questions to a specialist agent with a narrower tool set.',
  },
};

type RunFn = (input: unknown, tracer: Tracer) => Promise<unknown>;

async function loadRunFn(name: string): Promise<RunFn> {
  if (!EXAMPLES[name]) {
    throw new NotFoundError(`Unknown example: ${name}. Available: ${Object.keys(EXAMPLES).join(', ')}`);
  }
  const meta = EXAMPLES[name];
  const url = `../${meta.file}?t=${Date.now()}`;
  const mod = (await import(url)) as Record<string, unknown>;
  const fn = mod[meta.exportName] as RunFn | undefined;
  if (typeof fn !== 'function') {
    throw new ValidationError(`Example ${name} does not export '${meta.exportName}' as a function.`);
  }
  return fn;
}

// ─── 3. Per-example input validation ──────────────────────────────────────
function validateExampleInput(name: string, body: unknown): Record<string, unknown> {
  if (!isPlainObject(body)) {
    throw new ValidationError('Request body must be a JSON object', 'body');
  }
  switch (name) {
    case 'support-triage': {
      if ('message' in body && typeof body.message !== 'string') {
        throw new ValidationError('Field "message" must be a string', 'message');
      }
      return { message: sanitizeText(body.message) };
    }
    case 'research':
    case 'parallel-research':
    case 'critic-loop': {
      if (!('topic' in body) || typeof body.topic !== 'string' || body.topic.trim().length === 0) {
        throw new ValidationError('Field "topic" must be a non-empty string', 'topic');
      }
      const out: Record<string, unknown> = { topic: sanitizeText(body.topic) };
      if ('threshold' in body) {
        if (typeof body.threshold !== 'number' || body.threshold < 0 || body.threshold > 10) {
          throw new ValidationError('Field "threshold" must be a number 0-10', 'threshold');
        }
        out.threshold = body.threshold;
      }
      if ('maxIterations' in body) {
        if (
          typeof body.maxIterations !== 'number' ||
          !Number.isInteger(body.maxIterations) ||
          body.maxIterations < 1 ||
          body.maxIterations > 5
        ) {
          throw new ValidationError('Field "maxIterations" must be an integer 1-5', 'maxIterations');
        }
        out.maxIterations = body.maxIterations;
      }
      return out;
    }
    case 'code-review': {
      if ('path' in body && typeof body.path !== 'string') {
        throw new ValidationError('Field "path" must be a string', 'path');
      }
      return { path: sanitizeText(body.path, 512) };
    }
    case 'multi-turn-chat': {
      const allowed = new Set(['threadId', 'resourceId', 'message', 'model', 'action']);
      for (const key of Object.keys(body)) {
        if (!allowed.has(key)) {
          throw new ValidationError(`Unknown field: ${key}`, key);
        }
      }
      if ('message' in body && typeof body.message !== 'string') {
        throw new ValidationError('Field "message" must be a string', 'message');
      }
      return {
        ...(typeof body.threadId === 'string' ? { threadId: body.threadId } : {}),
        ...(typeof body.resourceId === 'string' ? { resourceId: body.resourceId } : {}),
        message: sanitizeText(body.message),
        ...(body.action === 'clear' ? { action: 'clear' as const } : {}),
        ...(typeof body.model === 'string' ? { model: body.model } : {}),
      };
    }
    case 'hitl-approval': {
      if ('action' in body && typeof body.action !== 'string') {
        throw new ValidationError('Field "action" must be a string', 'action');
      }
      if ('actionType' in body) {
        const valid = new Set(['refund', 'send', 'delete']);
        if (typeof body.actionType !== 'string' || !valid.has(body.actionType)) {
          throw new ValidationError('Field "actionType" must be one of: refund, send, delete', 'actionType');
        }
      }
      return {
        action: sanitizeText(body.action),
        ...(typeof body.actionType === 'string' ? { actionType: body.actionType } : {}),
        ...(typeof body.model === 'string' ? { model: body.model } : {}),
      };
    }
    case 'multi-agent-handoff': {
      if (!('message' in body) || typeof body.message !== 'string' || body.message.trim().length === 0) {
        throw new ValidationError('Field "message" must be a non-empty string', 'message');
      }
      return {
        message: sanitizeText(body.message),
        ...(typeof body.model === 'string' ? { model: body.model } : {}),
      };
    }
    default:
      return body;
  }
}

// ─── 4. Response helpers ──────────────────────────────────────────────────
function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendError(res: http.ServerResponse, err: unknown, req: http.IncomingMessage) {
  if (err instanceof RateLimitError) {
    res.setHeader('Retry-After', String(err.retryAfter));
    logger.warn('rate_limit_exceeded', { ip: clientIp(req), retryAfter: err.retryAfter });
    sendJson(res, 429, { error: err.message, retryAfter: err.retryAfter });
    return;
  }
  if (err instanceof ValidationError) {
    logger.warn('validation_error', { ip: clientIp(req), field: err.field, message: err.message });
    sendJson(res, 400, { error: err.message, field: err.field, detail: err.detail });
    return;
  }
  if (err instanceof NotFoundError) {
    logger.warn('not_found', { ip: clientIp(req), message: err.message });
    sendJson(res, 404, { error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error('internal_error', { ip: clientIp(req), message, stack });
  sendJson(res, 500, { error: message });
}

// ─── 5. HTTP server ────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const t0 = Date.now();
  res.on('finish', () => {
    const dur = Date.now() - t0;
    if (req.url?.startsWith('/api/')) {
      logger.info('http_request', {
        method: req.method,
        path: req.url,
        status: res.statusCode,
        durMs: dur,
        ip: clientIp(req),
      });
    }
  });

  try {
    // GET /api/health — liveness probe. No rate limit (cheap).
    if (req.method === 'GET' && req.url === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        uptimeSec: Math.floor((Date.now() - STARTED_AT) / 1000),
        nodeEnv: process.env.NODE_ENV ?? 'development',
        exampleCount: Object.keys(EXAMPLES).length,
        ts: new Date().toISOString(),
      });
      return;
    }

    // GET /api/examples — no rate limit (cheap, static)
    if (req.method === 'GET' && req.url === '/api/examples') {
      sendJson(
        res,
        200,
        Object.entries(EXAMPLES).map(([id, meta]) => ({ id, description: meta.description })),
      );
      return;
    }

    // POST /api/run/:example — one-shot JSON result
    if (req.method === 'POST' && req.url?.startsWith('/api/run/')) {
      const name = req.url.slice('/api/run/'.length).split('?')[0];
      if (!EXAMPLES[name]) {
        throw new NotFoundError(`Unknown example: ${name}. Available: ${Object.keys(EXAMPLES).join(', ')}`);
      }
      checkRateLimit(clientIp(req) + ':run');
      const raw = await readJsonBody(req);
      const input = validateExampleInput(name, raw);
      const fn = await loadRunFn(name);
      const tracer = new Tracer();
      const result = await fn(input, tracer);
      sendJson(res, 200, { ok: true, result });
      return;
    }

    // GET /api/stream/:example?input=... — SSE trace stream
    if (req.method === 'GET' && req.url?.startsWith('/api/stream/')) {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const name = url.pathname.slice('/api/stream/'.length);
      if (!EXAMPLES[name]) {
        throw new NotFoundError(`Unknown example: ${name}. Available: ${Object.keys(EXAMPLES).join(', ')}`);
      }
      checkRateLimit(clientIp(req) + ':stream');
      const inputParam = url.searchParams.get('input') ?? '{}';
      if (inputParam.length > 8192) {
        throw new ValidationError(
          'input query param too large',
          'input',
          `${inputParam.length} > 8192 chars`,
        );
      }
      let raw: unknown;
      try {
        raw = JSON.parse(inputParam);
      } catch {
        throw new ValidationError('Invalid input JSON in query param', 'input');
      }
      const input = validateExampleInput(name, raw);
      return startSseStream(req, res, name, input);
    }

    // POST /api/resume/:token — resume a suspended workflow
    if (req.method === 'POST' && req.url?.startsWith('/api/resume/')) {
      const token = req.url.slice('/api/resume/'.length).split('?')[0];
      checkRateLimit(clientIp(req) + ':resume');
      const raw = await readJsonBody(req);
      if (!isPlainObject(raw)) {
        throw new ValidationError('Request body must be a JSON object', 'body');
      }
      if ('decision' in raw && raw.decision !== 'approved' && raw.decision !== 'rejected') {
        throw new ValidationError('Field "decision" must be "approved" or "rejected"', 'decision');
      }
      return resumeSuspended(res, token, raw as { decision?: 'approved' | 'rejected' });
    }

    // Static files (no rate limit)
    if (req.method === 'GET') {
      const served = await serveStatic(req.url || '/', res);
      if (served) return;
    }

    throw new NotFoundError(`Route not found: ${req.method} ${req.url}`);
  } catch (err) {
    if (!res.headersSent) {
      sendError(res, err, req);
    } else {
      // Response already started (likely SSE) — just end it
      try {
        res.end();
      } catch {
        // socket already closed
      }
    }
  }
});

// ─── 6. SSE handler ────────────────────────────────────────────────────────
function startSseStream(req: http.IncomingMessage, res: http.ServerResponse, name: string, input: unknown) {
  // Parse trace logging options from the query string
  //   ?trace=true              → log every event to stderr
  //   ?trace=true&events=start,step:start,step:end,done
  //                          → log only these event types (default: all)
  const traceLogEnabled = req.url ? new URL(req.url, 'http://x').searchParams.get('trace') === 'true' : false;
  const traceEventFilter = new Set(
    (req.url ? (new URL(req.url, 'http://x').searchParams.get('events') ?? '') : '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const traceFilterActive = traceEventFilter.size > 0;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // Disable Nagle's algorithm on the underlying socket so each `res.write`
  // becomes its own TCP segment. Without this, Node's default buffering
  // can coalesce the entire `for await` loop's writes into one packet,
  // making the SSE events arrive at the browser all at once and breaking
  // the "token-by-token" streaming UX.
  if (res.socket && 'setNoDelay' in res.socket) {
    (res.socket as { setNoDelay: (n: boolean) => void }).setNoDelay(true);
  }
  res.write(': connected\n\n');
  res.flushHeaders?.();

  const send = (event: TraceEvent) => {
    try {
      res.write(sseLine(event));
    } catch {
      // Client disconnected
    }
  };

  let unsub: (() => void) | null = null;
  let unsubLog: (() => void) | null = null;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (unsub) unsub();
    if (unsubLog) unsubLog();
  };

  reqSocketCleanup(req, cleanup);

  (async () => {
    try {
      const fn = await loadRunFn(name);
      const tracer = new Tracer();
      unsub = tracer.subscribe(send);

      // Optional server-side trace logging for `npm run serve | jq`
      const ip = clientIp(req);
      if (traceLogEnabled) {
        logger.info('trace_session_start', { example: name, ip, events: traceEventFilter.size || 'all' });
        unsubLog = tracer.subscribe((event) => {
          if (traceFilterActive && !traceEventFilter.has(event.type)) return;
          // Route through the structured logger so it lands in stderr (not stdout
          // where the SSE bytes live) and survives `jq` filtering.
          process.stderr.write(
            JSON.stringify({
              ts: new Date().toISOString(),
              level: 'info',
              msg: 'trace_event',
              example: name,
              ip,
              event,
            }) + '\n',
          );
        });
      }

      await fn(input, tracer);

      if (traceLogEnabled) {
        logger.info('trace_session_end', { example: name, ip });
      }
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

// ─── 7. Resume handler ───────────────────────────────────────────────────
async function resumeSuspended(
  res: http.ServerResponse,
  token: string,
  payload: { decision?: 'approved' | 'rejected' },
) {
  const sr = takeSuspendedRun(token);
  if (!sr) {
    throw new NotFoundError(`No suspended run with token ${token}`);
  }
  const decision = payload.decision ?? 'rejected';
  const result = (await sr.run.resume({
    step: sr.step,
    resumeData: { decision },
  })) as Record<string, unknown>;
  sendJson(res, 200, {
    ok: true,
    result: { status: result.status, output: result.result, error: result.error },
  });
}

// ─── 8. Graceful shutdown ─────────────────────────────────────────────────
const SHUTDOWN_TIMEOUT_MS = 30_000; // up to 30s for in-flight LLM calls to drain
let isShuttingDown = false;

function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info('shutdown_initiated', { signal, timeoutMs: SHUTDOWN_TIMEOUT_MS });

  // Stop accepting new connections, but let in-flight finish
  server.close((err) => {
    if (err) {
      logger.error('shutdown_close_error', { error: err.message });
      process.exit(1);
    }
    logger.info('shutdown_complete');
    process.exit(0);
  });

  // Stop the periodic cleanup timer so it doesn't keep the process alive
  clearInterval(cleanupInterval);

  // Hard exit if graceful close takes too long
  setTimeout(() => {
    logger.warn('shutdown_timeout_exceeded', { timeoutMs: SHUTDOWN_TIMEOUT_MS });
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── 9. Start ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  logger.info('server_listening', { port: PORT, url: `http://localhost:${PORT}` });
  // Console banner for the dev's convenience (logger goes to stdout too, but
  // a one-line banner makes it easy to spot in a fresh terminal).
  process.stdout.write(`\n  Mastra Playground UI: http://localhost:${PORT}\n\n`);
});
