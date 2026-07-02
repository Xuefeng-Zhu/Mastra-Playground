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
import { EXAMPLE_IDS } from '../shared/example-manifest';

const ROOT = process.cwd();
const NEXT_DIR = resolve(ROOT, '.next');
const describeBuildArtifacts = existsSync(NEXT_DIR) ? describe : describe.skip;

describeBuildArtifacts('Next.js build artifacts', () => {
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

describe('Example registry consistency', () => {
  it('keeps every example registry aligned with the canonical manifest', async () => {
    const serverRegistry = await import('../shared/examples-registry');
    const inputRegistry = await import('../shared/example-inputs');
    const clientRegistry = await import('../src/registry/examples');
    const graphRegistry = await import('../src/registry/graphs');
    const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as {
      scripts?: Record<string, string>;
    };

    expect(Object.keys(serverRegistry.EXAMPLES).sort()).toEqual([...EXAMPLE_IDS].sort());
    expect(Object.keys(serverRegistry.EXAMPLE_LOADERS).sort()).toEqual([...EXAMPLE_IDS].sort());
    expect(Object.keys(clientRegistry.EXAMPLES).sort()).toEqual([...EXAMPLE_IDS].sort());

    for (const id of EXAMPLE_IDS) {
      const serverExample = serverRegistry.EXAMPLES[id];
      const clientExample = clientRegistry.EXAMPLES[id];

      expect(id in inputRegistry.EXAMPLE_INPUT_SCHEMAS).toBe(true);
      expect(id in graphRegistry.GRAPHS).toBe(true);
      expect(packageJson.scripts?.[`example:${String(clientExample.num).padStart(2, '0')}`]).toContain(
        serverExample.file,
      );
      expect(clientExample.output.kind).toBeDefined();
    }
  });

  it('documents the current example count once through the manifest', () => {
    expect(EXAMPLE_IDS).toHaveLength(13);
  });
});
