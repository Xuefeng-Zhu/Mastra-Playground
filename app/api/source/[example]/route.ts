import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getExampleOrThrow } from '../../../../shared/examples-registry';
import { ValidationError } from '../../../../shared/validation';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ example: string }> }) {
  const { example: name } = await params;

  try {
    const meta = getExampleOrThrow(name);
    const filePath = join(process.cwd(), meta.file);
    const source = await readFile(filePath, 'utf-8');

    return NextResponse.json({
      source,
      filename: meta.file,
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
