/**
 * Tiny structured JSON logger.
 *
 * Why: when something goes wrong in production, `console.log` is useless.
 * `logger.info({ event: 'workflow_completed', example: 'triage', durationMs: 2300 })`
 * is searchable, parseable, and survives `jq`.
 *
 * Scope: server-side only. The browser uses console directly.
 *
 * For real production observability, swap this for pino or winston.
 * This implementation is intentionally small (~30 lines) and has zero deps.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = LEVELS[(process.env.LOG_LEVEL as LogLevel) || 'info'];

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  if (LEVELS[level] < MIN_LEVEL) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...meta,
  };
  // Errors to stderr, everything else to stdout. Conventional split.
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(JSON.stringify(entry) + '\n');
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    emit('debug', message, meta);
  },
  info(message: string, meta?: Record<string, unknown>) {
    emit('info', message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>) {
    emit('warn', message, meta);
  },
  error(message: string, meta?: Record<string, unknown>) {
    emit('error', message, meta);
  },
};
