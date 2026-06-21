/**
 * Request validation, rate limiting, and input sanitization for the dev server.
 *
 * These are deliberately simple — production code would use a real validation
 * library (zod is already in deps), a proper rate limiter (Redis-backed token
 * bucket), and a proven sanitizer. This is "good enough for a learning project
 * you might actually point at a tunnel" hardening, not a substitute for it.
 */

import { logger } from './logger';

// ─── Input sanitization ───────────────────────────────────────────────────
/** Strip control characters and cap length. User-facing strings only. */
export function sanitizeText(input: unknown, maxLength = 4096): string {
  if (typeof input !== 'string') return '';
  // Strip control characters except \n \r \t
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, maxLength);
}

/** Validate that a value is a plain object with no prototype. */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype
  );
}

// ─── Request body size cap ────────────────────────────────────────────────
/** Returns the request body, capped at 64KB, as a parsed JSON object. Throws on error. */
export async function readJsonBody(
  req: import('node:http').IncomingMessage,
  maxBytes = 65536,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new ValidationError('Request body too large', 'body', `${total} > ${maxBytes} bytes`);
    }
    chunks.push(chunk as Buffer);
  }
  if (total === 0) return {};
  const text = Buffer.concat(chunks).toString('utf-8');
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError('Invalid JSON in request body', 'body');
  }
}

// ─── Errors ────────────────────────────────────────────────────────────────
export class ValidationError extends Error {
  readonly status = 400;
  constructor(
    message: string,
    readonly field?: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends Error {
  readonly status = 429;
  readonly retryAfter: number;
  constructor(retryAfterSec: number) {
    super(`Rate limit exceeded. Retry after ${retryAfterSec}s.`);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfterSec;
  }
}

// ─── Per-IP rate limiter (in-memory token bucket) ────────────────────────
type Bucket = { tokens: number; lastRefill: number };
const BUCKETS = new Map<string, Bucket>();
const RATE_LIMIT = 30; // requests
const RATE_WINDOW_MS = 60_000; // per minute

export function checkRateLimit(key: string, now = Date.now()): void {
  const bucket = BUCKETS.get(key) ?? { tokens: RATE_LIMIT, lastRefill: now };
  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  const refill = (elapsed / RATE_WINDOW_MS) * RATE_LIMIT;
  bucket.tokens = Math.min(RATE_LIMIT, bucket.tokens + refill);
  bucket.lastRefill = now;
  if (bucket.tokens < 1) {
    const deficit = 1 - bucket.tokens;
    const retryAfter = Math.ceil((deficit / RATE_LIMIT) * RATE_WINDOW_MS);
    BUCKETS.set(key, bucket);
    throw new RateLimitError(Math.max(1, retryAfter));
  }
  bucket.tokens -= 1;
  BUCKETS.set(key, bucket);
}

/** Extract the client IP, respecting X-Forwarded-For from cloudflared. */
export function clientIp(req: import('node:http').IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  if (Array.isArray(xff) && xff.length > 0) {
    return xff[0];
  }
  return req.socket.remoteAddress ?? 'unknown';
}

// Periodic cleanup of stale buckets (>1 hour since last refill)
setInterval(
  () => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [key, bucket] of BUCKETS) {
      if (bucket.lastRefill < cutoff) BUCKETS.delete(key);
    }
  },
  10 * 60 * 1000,
).unref();

logger.debug('rate_limiter_initialized', { limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS });
