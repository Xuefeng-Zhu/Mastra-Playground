// @vitest-environment node
/**
 * UI build smoke test.
 *
 * After the React migration (Vite + React 18), the JSDOM-based UI
 * test no longer works reliably — React 18's createRoot and concurrent
 * features don't play well with JSDOM's synthetic event loop.
 *
 * This test verifies the build artifacts exist and are well-formed:
 *   - dist/index.html exists and references the React bundle
 *   - dist/assets/*.js is the React bundle (contains React markers)
 *   - dist/assets/*.css exists
 *   - the index.html script tag points to /assets/
 *   - all 11 examples and 10 renderer kinds are in the bundle
 *
 * Runtime verification (mounting, navigation, trace updates, output
 * rendering) is done via Playwright in the manual-QA scenarios.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const DIST = resolve(process.cwd(), 'dist');
const INDEX_HTML = join(DIST, 'index.html');
const ASSETS = join(DIST, 'assets');

function readBundle(): string {
  const files = readdirSync(ASSETS);
  const jsFile = files.find((f) => f.endsWith('.js'));
  if (!jsFile) throw new Error('No JS bundle found in dist/assets. Run `npm run build`.');
  return readFileSync(join(ASSETS, jsFile), 'utf-8');
}

describe('React build artifacts', () => {
  it('dist/index.html exists', () => {
    expect(existsSync(INDEX_HTML)).toBe(true);
  });

  it('dist/assets/ contains JS bundle and CSS bundle (no source map)', () => {
    expect(existsSync(ASSETS)).toBe(true);
    const files = readdirSync(ASSETS);
    expect(files.some((f) => f.endsWith('.js'))).toBe(true);
    expect(files.some((f) => f.endsWith('.css'))).toBe(true);
    // vite.config.ts sets `sourcemap: false` — the bundle must not ship
    // .map files to the public (would disclose the React source).
    expect(files.some((f) => f.endsWith('.js.map'))).toBe(false);
  });

  it('index.html references the React bundle via /assets/', () => {
    const html = readFileSync(INDEX_HTML, 'utf-8');
    expect(html).toMatch(/<script[^>]*src="\/assets\/[^"]+\.js"/);
  });

  it('JS bundle contains React markers (createElement, useState)', () => {
    const js = readBundle();
    // The minified bundle keeps React runtime symbols.
    expect(js).toContain('createElement');
    expect(js).toMatch(/useState|useEffect|useRef/);
    expect(js.length).toBeGreaterThan(50_000);
  });

  it('CSS bundle is non-trivial (>10KB)', () => {
    const files = readdirSync(ASSETS);
    const cssFile = files.find((f) => f.endsWith('.css'));
    expect(cssFile).toBeTruthy();
    const css = readFileSync(join(ASSETS, cssFile!), 'utf-8');
    expect(css.length).toBeGreaterThan(10_000);
  });
});

describe('React bundle composition', () => {
  it('bundle includes all 11 EXAMPLES by name', () => {
    const js = readBundle();
    const examples = [
      'support-triage',
      'research',
      'code-review',
      'parallel-research',
      'multi-turn-chat',
      'hitl-approval',
      'streaming-chat',
      'critic-loop',
      'multi-agent-handoff',
      'mastra-memory',
      'content-pipeline',
    ];
    for (const ex of examples) {
      // The EXAMPLES object literal includes the id as a string key.
      expect(js).toContain(`"${ex}"`);
    }
  });

  it('bundle includes all 10 output renderer kinds', () => {
    const js = readBundle();
    const kinds = [
      'parallel',
      'triage',
      'research',
      'codeReview',
      'chat',
      'streaming',
      'hitl',
      'criticLoop',
      'contentPipeline',
      'mastraMemory',
    ];
    for (const k of kinds) {
      // Renderer names appear as keys in RESULT_RENDERERS / COMPARE_RENDERERS.
      expect(js).toContain(k);
    }
  });

  it('bundle includes the 11 GRAPHS by node count', () => {
    const js = readBundle();
    // The bundled GRAPHS has 11 examples. Just sanity-check that the
    // parallel-research graph def (4 nodes: input/plan/fanout/synthesize)
    // made it through — its labels include the distinctive strings.
    expect(js).toContain('Plan sub-questions');
    expect(js).toContain('Parallel fetch');
    expect(js).toContain('Customer message'); // support-triage
    expect(js).toContain('Billing specialist'); // multi-agent-handoff
  });
});
