import { NextRequest, NextResponse } from 'next/server';
import { Tracer, sseLine, type TraceEvent } from '../../../../shared/tracer';
import { loadRunFn, getExampleOrThrow } from '../../../../shared/examples-registry';
import {
  validateExampleInput,
  extractCustomLlmConfig,
  type ExampleId,
} from '../../../../shared/example-inputs';
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
    checkRateLimit(ip + ':stream');
    const raw = await readWebJsonBody(req);
    const input = validateExampleInput(name as ExampleId, raw);

    // Extract custom provider config before it reaches example code
    const customLlm = extractCustomLlmConfig(input);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let closed = false;
        const close = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            // The client already cancelled the response body.
          }
        };
        const send = (event: TraceEvent) => {
          if (closed || req.signal.aborted) return;
          try {
            controller.enqueue(encoder.encode(sseLine(event)));
          } catch {
            closed = true;
          }
        };

        req.signal.addEventListener('abort', close, { once: true });
        controller.enqueue(encoder.encode(': connected\n\n'));

        try {
          const fn = await loadRunFn(name);
          const tracer = new Tracer();
          const unsubscribe = tracer.subscribe(send);
          try {
            await fn(input, tracer, { signal: req.signal, customLlm });
          } finally {
            unsubscribe();
          }
        } catch (err) {
          if (!req.signal.aborted) {
            const message = err instanceof Error ? err.message : String(err);
            send({ type: 'done', status: 'failed', output: { error: message }, totalMs: 0 });
          }
        } finally {
          close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
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
