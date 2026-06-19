/**
 * Mock "read file" tool. Takes a filename, returns canned content.
 *
 * Lesson: the LLM only sees what the tool returns. The LLM has no file
 * system of its own. For a real code-review agent, this would read
 * from the repo, respect .gitignore, and cap the file size.
 *
 * Usage:
 *   - With an Agent: import { readFile } and register on the agent's `tools: {}`
 *   - Direct from a step: import { readFileDirect } and call it
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const readFileParams = z.object({
  path: z.string().describe('Absolute or repo-relative file path'),
});
const readFileResult = z.object({
  path: z.string(),
  content: z.string(),
});

export const readFile = createTool({
  id: 'read-file',
  description: 'Read the contents of a source file. Returns the file content as a string.',
  inputSchema: readFileParams,
  outputSchema: readFileResult,
  execute: async ({ path }) => readFileDirect(path),
});

/** Direct-call version for use inside workflow steps. Same input/output contract. */
export async function readFileDirect(path: string): Promise<{ path: string; content: string }> {
  // Mocked "files" — the playground never touches the real filesystem.
  const mocks: Record<string, string> = {
    'auth.ts': `
import jwt from 'jsonwebtoken';
export function signToken(userId: string) {
  return jwt.sign({ userId }, 'hardcoded-secret');
}
export function verifyToken(token: string) {
  return jwt.verify(token, 'hardcoded-secret');
}
`.trim(),
    'utils.ts': `
export function add(a: number, b: number) { return a + b; }
export function divide(a: number, b: number) { return a / b; }
export async function fetchUser(id: string) {
  const res = await fetch('/api/users/' + id);
  return res.json();
}
`.trim(),
    'clean.ts': `
export function greet(name: string): string {
  return 'Hello, ' + name;
}
`.trim(),
  };

  return { path, content: mocks[path] ?? '// (file not found in mock)' };
}
