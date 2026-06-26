import { NextRequest } from 'next/server';
import { loadRunFn, getExampleOrThrow } from '../../../../shared/examples-registry';
import { validateExampleInput, prepareExampleInput, type ExampleId } from '../../../../shared/example-inputs';
import { checkRateLimit, readWebJsonBody } from '../../../../shared/validation';
import { apiErrorResponse, requestClientIp } from '../../route-helpers';
import { traceStreamResponse } from '../../sse-response';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ example: string }> }) {
  const { example: name } = await params;

  try {
    getExampleOrThrow(name);
    checkRateLimit(requestClientIp(req) + ':stream');
    const raw = await readWebJsonBody(req);
    const validatedInput = validateExampleInput(name as ExampleId, raw);
    const { input, llmConfig } = prepareExampleInput(validatedInput);

    return traceStreamResponse(
      req,
      async (tracer) => {
        const fn = await loadRunFn(name);
        await fn(input, tracer, { signal: req.signal, llmConfig });
      },
      { event: 'workflow_stream_failed', fields: { example: name } },
    );
  } catch (err) {
    return apiErrorResponse(err, `stream:${name}`);
  }
}
