import { NextResponse } from 'next/server';
import { EXAMPLES } from '../../../shared/examples-registry';

const STARTED_AT = Date.now();

export async function GET() {
  return NextResponse.json({
    ok: true,
    uptimeSec: Math.floor((Date.now() - STARTED_AT) / 1000),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    exampleCount: Object.keys(EXAMPLES).length,
    ts: new Date().toISOString(),
  });
}
