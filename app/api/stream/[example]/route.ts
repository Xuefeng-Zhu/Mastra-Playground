import { NextRequest } from 'next/server';
import { Tracer, sseLine, type TraceEvent } from '../../../../shared/tracer';
import { loadRunFn, getExampleOrThrow } from '../../../../shared/examples-registry';
import { validateExampleInput, type ExampleId } from '../../../../shared/example-inputs';
import { checkRateLimit, ValidationError, RateLimitError } from '../../../../shared/validation';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Max input query param size (chars).
const SSE_INPUT_CAP_CHARS = 8192;

export async function GET(req: NextRequest, { params }: { params: Promise<{ example: string }> }) {
  const { example: name } = await params;

  try {
    getExampleOrThrow(name);
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    checkRateLimit(ip + ':stream');

    const inputParam = req.nextUrl.searchParams.get('input') ?? '{}';
    if (inputParam.length > SSE_INPUT_CAP_CHARS) {
      throw new ValidationError(
        'input query param too large',
        'input',
        `${inputParam.length} > ${SSE_INPUT_CAP_CHARS} chars`,
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(inputParam);
    } catch {
      throw new ValidationError('Invalid input JSON in query param', 'input');
    }

    const input = validateExampleInput(name as ExampleId, raw);

    // Create a ReadableStream that pushes SSE events as the workflow runs.
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const send = (event: TraceEvent) => {
          try {
            controller.enqueue(encoder.encode(sseLine(event)));
          } catch {
            // Stream already closed by client
          }
        };

        controller.enqueue(encoder.encode(': connected\n\n'));

        try {
          const fn = await loadRunFn(name);
          const tracer = new Tracer();
          tracer.subscribe(send);
          await fn(input, tracer);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          send({ type: 'done', status: 'failed', output: { error: message }, totalMs: 0 });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
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
