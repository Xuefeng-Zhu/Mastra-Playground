/**
 * Mock "run linter" tool. Takes a file's content, returns canned issues.
 *
 * In a real code-review agent, this would shell out to eslint/biome/tsc
 * and parse the JSON output. For the playground, we hard-code a few
 * pattern matches to demonstrate the workflow.
 *
 * Usage:
 *   - With an Agent: import { runCheck } and register on the agent's `tools: {}`
 *   - Direct from a step: import { runCheckDirect } and call it
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const runCheckParams = z.object({
  path: z.string(),
  content: z.string(),
});
const runCheckResult = z.object({
  path: z.string(),
  issues: z.array(
    z.object({
      severity: z.enum(['error', 'warning', 'info']),
      line: z.number(),
      message: z.string(),
    }),
  ),
});

export const runCheck = createTool({
  id: 'run-check',
  description:
    'Run a static analysis pass over the given file content. Returns a list of issues (severity, line, message).',
  inputSchema: runCheckParams,
  outputSchema: runCheckResult,
  execute: async ({ path, content }) => runCheckDirect(path, content),
});

export async function runCheckDirect(
  path: string,
  content: string,
): Promise<{
  path: string;
  issues: { severity: 'error' | 'warning' | 'info'; line: number; message: string }[];
}> {
  const issues: { severity: 'error' | 'warning' | 'info'; line: number; message: string }[] = [];

  content.split('\n').forEach((line, idx) => {
    const lineNo = idx + 1;
    if (line.includes('hardcoded-secret') || line.includes('"secret"') || line.includes("'secret'")) {
      issues.push({ severity: 'error', line: lineNo, message: 'Hardcoded secret detected.' });
    }
    if (line.includes('fetch(') && !line.includes('try')) {
      issues.push({
        severity: 'warning',
        line: lineNo,
        message: 'fetch() call is not wrapped in error handling.',
      });
    }
    if (line.trim().startsWith('// ')) {
      issues.push({ severity: 'info', line: lineNo, message: 'Avoid noisy comments.' });
    }
  });

  return { path, issues };
}
