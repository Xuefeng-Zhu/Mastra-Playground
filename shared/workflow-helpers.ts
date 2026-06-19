/**
 * Helper: unwrap a workflow run result after a `.branch([...])`.
 *
 * When a workflow ends in a branch, the result is wrapped under the
 * *step that ran*: `{ "step-id": stepOutput }`. This is the framework's
 * way of telling you "this branch was taken with this output." For the
 * UI, we just want the inner output.
 *
 * If the result is not a single-key wrapper, return it as-is.
 */
export function unwrapWorkflowOutput<T = unknown>(result: unknown): T {
  if (result === null || typeof result !== 'object') return result as T;
  const keys = Object.keys(result);
  if (keys.length === 1) {
    return (result as Record<string, unknown>)[keys[0]!] as T;
  }
  return result as T;
}
