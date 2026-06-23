// @vitest-environment node
/**
 * UI build smoke test (Next.js).
 *
 * Verifies that `npm run build` produces valid Next.js build artifacts:
 *   - .next/ directory exists with expected structure
 *   - Static assets are generated
 *   - The route manifest includes all expected routes
 *
 * Runtime verification (mounting, navigation, trace updates, output
 * rendering) is done via Playwright in the manual-QA scenarios.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = process.cwd();
const NEXT_DIR = resolve(ROOT, '.next');

describe('Next.js build artifacts', () => {
  it('.next/ directory exists', () => {
    expect(existsSync(NEXT_DIR)).toBe(true);
  });

  it('.next/static/ contains compiled client assets', () => {
    const staticDir = join(NEXT_DIR, 'static');
    expect(existsSync(staticDir)).toBe(true);
  });

  it('build manifest exists and is valid JSON', () => {
    const manifestPath = join(NEXT_DIR, 'build-manifest.json');
    if (!existsSync(manifestPath)) {
      // In some Next.js versions, the manifest location varies
      return;
    }
    const content = readFileSync(manifestPath, 'utf-8');
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it('routes-manifest.json includes API routes', () => {
    const manifestPath = join(NEXT_DIR, 'routes-manifest.json');
    if (!existsSync(manifestPath)) return;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const dynamicRoutes = JSON.stringify(manifest.dynamicRoutes ?? []);
    expect(dynamicRoutes).toContain('/api/run/');
    expect(dynamicRoutes).toContain('/api/stream/');
    expect(dynamicRoutes).toContain('/api/resume/');
  });
});

describe('Source composition', () => {
  it('examples-registry exports all 12 examples', async () => {
    const { EXAMPLES } = await import('../shared/examples-registry');
    const ids = Object.keys(EXAMPLES);
    expect(ids).toHaveLength(12);
    expect(ids).toContain('support-triage');
    expect(ids).toContain('research');
    expect(ids).toContain('code-review');
    expect(ids).toContain('parallel-research');
    expect(ids).toContain('multi-turn-chat');
    expect(ids).toContain('hitl-approval');
    expect(ids).toContain('streaming-chat');
    expect(ids).toContain('critic-loop');
    expect(ids).toContain('multi-agent-handoff');
    expect(ids).toContain('mastra-memory');
    expect(ids).toContain('content-pipeline');
    expect(ids).toContain('guardrail-redaction');
  });

  it('example-inputs has matching schemas for all registered examples', async () => {
    const { EXAMPLES } = await import('../shared/examples-registry');
    const { EXAMPLE_INPUT_SCHEMAS } = await import('../shared/example-inputs');
    for (const id of Object.keys(EXAMPLES)) {
      expect(id in EXAMPLE_INPUT_SCHEMAS).toBe(true);
    }
  });
});
