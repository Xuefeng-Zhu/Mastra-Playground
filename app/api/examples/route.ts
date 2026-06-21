import { NextResponse } from 'next/server';
import { EXAMPLES } from '../../../shared/examples-registry';

export async function GET() {
  return NextResponse.json(
    Object.entries(EXAMPLES).map(([id, meta]) => ({ id, description: meta.description })),
  );
}
