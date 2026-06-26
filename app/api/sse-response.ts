import { Tracer, sseLine, type TraceEvent } from '../../shared/tracer';
import { logger } from '../../shared/logger';

type StreamFailureLog = {
  event: string;
  fields?: Record<string, unknown>;
};

export function traceStreamResponse(
  request: Request,
  run: (tracer: Tracer) => Promise<void>,
  failureLog: StreamFailureLog,
): Response {
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
        if (closed || request.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(sseLine(event)));
        } catch {
          closed = true;
        }
      };

      request.signal.addEventListener('abort', close, { once: true });
      controller.enqueue(encoder.encode(': connected\n\n'));

      try {
        const tracer = new Tracer();
        const unsubscribe = tracer.subscribe(send);
        try {
          await run(tracer);
        } finally {
          unsubscribe();
        }
      } catch (err) {
        if (!request.signal.aborted) {
          const errorId = crypto.randomUUID();
          logger.error(failureLog.event, {
            ...failureLog.fields,
            errorId,
            error: err instanceof Error ? err.message : String(err),
          });
          send({
            type: 'done',
            status: 'failed',
            output: { error: 'Workflow failed', errorId },
            totalMs: 0,
          });
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
}
