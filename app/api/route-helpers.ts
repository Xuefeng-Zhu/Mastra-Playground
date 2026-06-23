import { NextResponse } from 'next/server';
import { logger } from '../../shared/logger';
import { RateLimitError, ValidationError } from '../../shared/validation';

export function requestClientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export function apiErrorResponse(error: unknown, operation: string): NextResponse {
  if (error instanceof RateLimitError) {
    return NextResponse.json(
      { error: error.message, retryAfter: error.retryAfter },
      { status: 429, headers: { 'Retry-After': String(error.retryAfter) } },
    );
  }
  if (error instanceof ValidationError) {
    return NextResponse.json(
      { error: error.message, field: error.field, detail: error.detail },
      { status: error.status },
    );
  }

  const errorId = crypto.randomUUID();
  logger.error('api_request_failed', {
    operation,
    errorId,
    error: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json({ error: 'Internal server error', errorId }, { status: 500 });
}
