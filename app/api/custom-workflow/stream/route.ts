import { NextRequest } from 'next/server';
import { Tracer, sseLine, type TraceEvent } from '../../../../shared/tracer';
import { checkRateLimit, readWebJsonBody } from '../../../../shared/validation';
import { apiErrorResponse, requestClientIp } from '../../route-helpers';
import { logger } from '../../../../shared/logger';
import { runCustomWorkflow, validateCustomWorkflowRunRequest } from '../../../../shared/custom-workflow';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    checkRateLimit(requestClientIp(req) + ':custom-workflow-stream');
    const raw = await readWebJsonBody(req);
    const runRequest = validateCustomWorkflowRunRequest(raw);

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
          const tracer = new Tracer();
          const unsubscribe = tracer.subscribe(send);
          try {
            await runCustomWorkflow(
              runRequest.workflow,
              runRequest.input,
              tracer,
              {
                signal: req.signal,
                llmConfig: runRequest.llmConfig,
              },
              runRequest,
            );
          } finally {
            unsubscribe();
          }
        } catch (err) {
          if (!req.signal.aborted) {
            const errorId = crypto.randomUUID();
            logger.error('custom_workflow_stream_failed', {
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
  } catch (err) {
    return apiErrorResponse(err, 'custom-workflow:stream');
  }
}
