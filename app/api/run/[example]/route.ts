import { NextRequest, NextResponse } from 'next/server';
import { Tracer } from '../../../../shared/tracer';
import { loadRunFn, getExampleOrThrow } from '../../../../shared/examples-registry';
import { validateExampleInput, prepareExampleInput, type ExampleId } from '../../../../shared/example-inputs';
import { checkRateLimit, readWebJsonBody } from '../../../../shared/validation';
import { apiErrorResponse, requestClientIp } from '../../route-helpers';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ example: string }> }) {
  const { example: name } = await params;

  try {
    getExampleOrThrow(name);
    checkRateLimit(requestClientIp(req) + ':run');

    const raw = await readWebJsonBody(req);
    const validatedInput = validateExampleInput(name as ExampleId, raw);
    const { input, llmConfig } = prepareExampleInput(validatedInput);

    const fn = await loadRunFn(name);
    const tracer = new Tracer();
    const result = await fn(input, tracer, { llmConfig });

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return apiErrorResponse(err, `run:${name}`);
  }
}
