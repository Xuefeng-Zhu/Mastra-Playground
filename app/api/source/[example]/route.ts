import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getExampleOrThrow } from '../../../../shared/examples-registry';
import { apiErrorResponse } from '../../route-helpers';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ example: string }> }) {
  const { example: name } = await params;

  try {
    const meta = getExampleOrThrow(name);
    // Example modules are already statically traced by EXAMPLE_LOADERS. Avoid
    // asking Turbopack to trace every possible process.cwd() descendant here.
    const filePath = join(/* turbopackIgnore: true */ process.cwd(), meta.file);
    const source = await readFile(filePath, 'utf-8');

    return NextResponse.json({
      source,
      filename: meta.file,
    });
  } catch (err) {
    return apiErrorResponse(err, `source:${name}`);
  }
}
