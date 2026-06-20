/**
 * Suspended-run store — shared between the server and the example.
 *
 * The example, when it suspends, calls registerSuspendedRun() with the
 * Run + workflow + stepId. The server, when it gets POST /api/resume,
 * calls takeSuspendedRun() to look up the run and resume it.
 *
 * Lives in a globalThis-scoped Map so the server's `import` of the
 * example and the example's `import` of this module both see the same
 * store across module-load boundaries.
 */

export type SuspendedRun = {
  run: { resume: (params: { step: string; resumeData?: unknown }) => Promise<unknown> };
  step: string;
  workflow: string;
  mastra: unknown;
  suspendedAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __mastraPlaygroundSuspended: Map<string, SuspendedRun> | undefined;
}
globalThis.__mastraPlaygroundSuspended ??= new Map();
const store = globalThis.__mastraPlaygroundSuspended;

export function registerSuspendedRun(token: string, sr: Omit<SuspendedRun, 'suspendedAt'>) {
  store.set(token, { ...sr, suspendedAt: Date.now() });
}

export function takeSuspendedRun(token: string): SuspendedRun | undefined {
  const sr = store.get(token);
  if (sr) store.delete(token);
  return sr;
}

/**
 * Human-in-the-loop decision vocabulary for the resume handshake.
 * The /api/resume/:token endpoint validates that `body.decision` is
 * one of these values; example 06 (hitl-approval) is the only
 * example that uses this contract today.
 */
export const HITL_DECISIONS = ['approved', 'rejected'] as const;
export type HITLDecision = (typeof HITL_DECISIONS)[number];
