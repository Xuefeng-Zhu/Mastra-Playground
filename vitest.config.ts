import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['node_modules', '**/node_modules/**', '**/dist/**'],
    // The UI smoke test in scripts/ui-smoke.test.ts uses JSDOM. We mark it
    // explicitly via `@vitest-environment jsdom` in the file. The default
    // for other tests is 'node'.
    coverage: {
      provider: 'v8',
      include: ['shared/**/*.ts', '!shared/**/*.test.ts'],
      exclude: [
        'shared/observability.ts', // log helper, no logic to test
        'shared/llm.ts', // env-based factory, integration-test via smoke
        'shared/memory-store.ts', // globalThis-scoped, tested via ex 05
        'shared/suspended-store.ts', // globalThis-scoped, tested via ex 06
      ],
      reporter: ['text', 'html'],
      html: { open: 'never' },
    },
  },
});
