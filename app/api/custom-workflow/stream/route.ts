import { NextRequest } from 'next/server';
import { checkRateLimit, readWebJsonBody } from '../../../../shared/validation';
import { apiErrorResponse, requestClientIp } from '../../route-helpers';
import { runCustomWorkflow, validateCustomWorkflowRunRequest } from '../../../../shared/custom-workflow';
import { traceStreamResponse } from '../../sse-response';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    checkRateLimit(requestClientIp(req) + ':custom-workflow-stream');
    const raw = await readWebJsonBody(req);
    const runRequest = validateCustomWorkflowRunRequest(raw);

    return traceStreamResponse(
      req,
      async (tracer) => {
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
      },
      { event: 'custom_workflow_stream_failed' },
    );
  } catch (err) {
    return apiErrorResponse(err, 'custom-workflow:stream');
  }
}
