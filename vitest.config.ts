import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'app/**/*.test.ts',
      'examples/**/*.test.ts',
      'shared/**/*.test.ts',
      'scripts/**/*.test.ts',
      'src/**/*.test.{ts,tsx}',
    ],
    exclude: ['node_modules', '**/node_modules/**', '**/dist/**', '**/.next/**'],
    testTimeout: 10_000,
    // The UI smoke test in scripts/ui-smoke.test.ts uses JSDOM. We mark it
    // explicitly via `@vitest-environment jsdom` in the file. The default
    // for other tests is 'node'.
    coverage: {
      provider: 'v8',
      include: ['app/**/*.ts', 'shared/**/*.ts', 'src/**/*.{ts,tsx}', '!**/*.test.{ts,tsx}'],
      exclude: [
        'shared/mastra-logger.ts', // log helper, no logic to test
        'shared/llm.ts', // env-based factory, integration-test via smoke
        'shared/memory-store.ts', // globalThis-scoped, tested via ex 05
        'shared/suspended-store.ts', // globalThis-scoped, tested via ex 06
      ],
      reporter: ['text', 'html'],
      html: { open: 'never' },
      thresholds: {
        // Ratchet from the post-Next.js baseline. Raise these as route and
        // component coverage lands; never lower them to admit a regression.
        statements: 35,
        branches: 20,
        functions: 30,
        lines: 35,
      },
    },
  },
});
