/**
 * Smoke test — exercises the running server end-to-end.
 *
 * Run with: `npm run smoke`
 *
 * The server must already be running on $PORT (default 8917).
 * The script checks /api/examples, /api/health, and one workflow run.
 *
 * Exit code 0 = all good. Non-zero = a smoke check failed.
 */

const BASE = process.env.SMOKE_URL ?? `http://localhost:${process.env.PORT ?? '8917'}`;

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  const icon = ok ? '✓' : '✗';
  console.log(`  ${icon} ${name}: ${detail}`);
}

async function check(path: string, init?: RequestInit, expectStatus = 200) {
  const url = `${BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
  } catch (err) {
    return { ok: false, status: 0, body: null, error: String(err) };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok && res.status === expectStatus, status: res.status, body };
}

async function main() {
  console.log(`Smoke testing ${BASE}\n`);

  // 1. /api/health
  const health = await check('/api/health');
  record(
    'GET /api/health',
    health.ok && !!(health.body as { ok?: boolean } | null)?.ok,
    `status=${health.status} body=${JSON.stringify(health.body).slice(0, 200)}`,
  );

  // 2. /api/examples — should return 6 examples
  const examples = await check('/api/examples');
  const exampleList = (examples.body as { id: string }[] | null) ?? [];
  record(
    'GET /api/examples',
    examples.ok && exampleList.length === 6,
    `${exampleList.length} examples (expected 6)`,
  );

  // 3. /api/run/support-triage with a small input — should return triage result
  const triage = await check('/api/run/support-triage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'I want a refund' }),
  });
  const triageBody = triage.body as { ok?: boolean; result?: { status?: string } } | null;
  record(
    'POST /api/run/support-triage',
    triage.ok &&
      triageBody?.ok === true &&
      (triageBody.result?.status === 'success' || triageBody.result?.status === 'suspended'),
    `status=${triage.status} workflow=${triageBody?.result?.status}`,
  );

  // 4. /api/run/<unknown> — should return 400 (validation error) or 404
  const badExample = await check('/api/run/does-not-exist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  record(
    'POST /api/run/does-not-exist',
    badExample.ok === false && (badExample.status === 400 || badExample.status === 404),
    `status=${badExample.status} (expected 400 or 404)`,
  );

  // 5. /api/run/<example> with invalid JSON — should return 400
  const badJson = await fetch(`${BASE}/api/run/support-triage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'this is not json',
    signal: AbortSignal.timeout(5000),
  });
  record(
    'POST /api/run/support-triage (bad JSON)',
    badJson.status === 400,
    `status=${badJson.status} (expected 400)`,
  );

  // Summary
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log('\nFailed checks:');
    failed.forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(2);
});
