import { NextRequest, NextResponse } from 'next/server';
import { Tracer } from '../../../../shared/tracer';
import { loadRunFn, getExampleOrThrow } from '../../../../shared/examples-registry';
import { validateExampleInput, type ExampleId } from '../../../../shared/example-inputs';
import {
  checkRateLimit,
  ValidationError,
  RateLimitError,
  readWebJsonBody,
} from '../../../../shared/validation';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ example: string }> }) {
  const { example: name } = await params;

  try {
    getExampleOrThrow(name);
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    checkRateLimit(ip + ':run');

    const raw = await readWebJsonBody(req);
    const input = validateExampleInput(name as ExampleId, raw);
    const fn = await loadRunFn(name);
    const tracer = new Tracer();
    const result = await fn(input, tracer);

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: err.message, retryAfter: err.retryAfter },
        { status: 429, headers: { 'Retry-After': String(err.retryAfter) } },
      );
    }
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, field: err.field, detail: err.detail }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
