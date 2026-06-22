import { NextRequest, NextResponse } from 'next/server';
import { takeSuspendedRun, HITL_DECISIONS } from '../../../../shared/suspended-store';
import {
  checkRateLimit,
  ValidationError,
  RateLimitError,
  isPlainObject,
  readWebJsonBody,
} from '../../../../shared/validation';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    checkRateLimit(ip + ':resume');

    const raw = await readWebJsonBody(req);
    if (!isPlainObject(raw)) {
      throw new ValidationError('Request body must be a JSON object', 'body');
    }
    if ('decision' in raw && !HITL_DECISIONS.includes(raw.decision as (typeof HITL_DECISIONS)[number])) {
      throw new ValidationError(`Field "decision" must be one of: ${HITL_DECISIONS.join(', ')}`, 'decision');
    }

    const sr = takeSuspendedRun(token);
    if (!sr) {
      return NextResponse.json({ error: `No suspended run with token ${token}` }, { status: 404 });
    }

    const decision = (raw as { decision?: string }).decision ?? 'rejected';
    const result = (await sr.run.resume({
      step: sr.step,
      resumeData: { decision },
    })) as Record<string, unknown>;

    return NextResponse.json({
      ok: true,
      result: { status: result.status, output: result.result, error: result.error },
    });
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
