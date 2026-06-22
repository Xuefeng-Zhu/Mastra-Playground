/**
 * Example 06 — Human-in-the-Loop Approval (suspend/resume)
 *
 * What it teaches:
 *   - The `suspend()` / `run.resume()` pattern in Mastra — a step can pause
 *     the workflow mid-execution, wait for an external signal (a human's
 *     decision), then continue.
 *   - The difference between `suspend()` (pauses, expects resume) and
 *     `bail()` (stops, returns the result without resumption).
 *   - How to expose a resumption token to the UI so the user can make
 *     the decision and resume the workflow.
 *
 * Compare to InboxPilot's research brief §13:
 *   "Named rollback authority. When a metric trips its threshold — 2pp
 *   CSAT slip in any archetype, any P0 hallucination, context-loss rate
 *   above 5% — the named owner has authority to tighten the confidence
 *   threshold, remove an archetype from the deflection target, or roll
 *   the bot back to a prior version without needing to escalate up the
 *   chain first."
 *
 *   This example shows the technical mechanism: a workflow suspends, a
 *   named human reviews the proposed action, and either approves or
 *   rejects. The framework's resumption handles the rest.
 *
 * Run: npm run example:06
 */

import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { Mastra } from '@mastra/core';
import { cancelRunOnSignal, type RunContext } from '../../shared/cancellable-run';
import { resolveModel, model, getModel, type LlmProvider } from '../../shared/llm';
import { logger } from '../../shared/mastra-logger';
import { finalizeRunResult } from '../../shared/run-result';
import { registerSuspendedRun } from '../../shared/suspended-store';
import type { Tracer } from '../../shared/tracer';
import { startRun, stepStart, stepEnd, llmStructured, type StepSpec } from '../../shared/traced-step';
import { isMain, runCliExample } from '../../shared/cli-bootstrap';
import { z } from 'zod';
import {
  InputSchema,
  ClassifiedSchema,
  GateOutputSchema,
  GateResumeSchema,
  ExecuteOutputSchema,
} from './schemas';

// ─── Tracer events for the suspend/resume lifecycle ─────────────────────
const STEPS: StepSpec[] = [
  { id: 'classify', label: 'Classify (LLM)', kind: 'llm' },
  { id: 'gate', label: 'Gate (human check)', kind: 'branch' },
  { id: 'execute', label: 'Execute', kind: 'passthrough' },
];

// ─── Build the classifier agent ──────────────────────────────────────────
function makeAgent(useModel = model) {
  return new Agent({
    id: 'hitl-classifier',
    name: 'Action Classifier',
    instructions: [
      'You are an action classifier for a customer support platform.',
      'Given a proposed action, extract:',
      '- amount: the dollar amount (0 if not applicable)',
      '- urgency: low | medium | high | critical',
      '- reasoning: 1-2 sentences explaining the risk',
      '',
      'Be honest. Refunds > $100 are high. Bulk sends > 1000 recipients are critical.',
      'Account deletions are always critical.',
    ].join('\n'),
    model: useModel,
  });
}

// ─── Make a workflow factory ────────────────────────────────────────────
function makeWorkflow(tracer: Tracer, useModel: ReturnType<typeof getModel> = model) {
  const agent = makeAgent(useModel);

  // We capture the run + workflow + mastra in outer scope so the gate's
  // execute can register itself with the server's suspended-run store.
  let capturedRun: {
    runId: string;
    resume: (params: { step: string; resumeData?: unknown }) => Promise<unknown>;
  } | null = null;
  let capturedWorkflow: string = 'hitl-approval';
  let capturedMastra: unknown = null;

  const classifyStep = createStep({
    id: 'classify',
    description: 'LLM extracts amount, urgency, reasoning from the proposed action',
    inputSchema: InputSchema,
    outputSchema: ClassifiedSchema,
    execute: async ({ inputData, abortSignal }) => {
      stepStart(tracer, 'classify', {
        actionType: inputData.actionType,
        actionLength: inputData.action.length,
      });
      const result = await agent.generate(
        `Classify this proposed action:\n\nType: ${inputData.actionType}\nAction: ${inputData.action}\n\nReturn JSON with: amount (number), urgency (low/medium/high/critical), reasoning (1-2 sentences).`,
        { abortSignal, structuredOutput: { schema: ClassifiedSchema } },
      );
      const classified = result.object as z.infer<typeof ClassifiedSchema>;
      llmStructured(tracer, 'classify', 'ClassifiedAction', classified);
      stepEnd(tracer, 'classify', classified);
      return classified;
    },
  });

  // The gate uses suspend(). On suspend, we register the run with the
  // server's suspended-store so POST /api/resume can find it.
  const gateStep = createStep({
    id: 'gate',
    description: 'Suspend for human review if the action is risky',
    inputSchema: ClassifiedSchema,
    outputSchema: GateOutputSchema,
    resumeSchema: GateResumeSchema,
    execute: async ({ inputData, suspend, runId, resumeData }) => {
      stepStart(tracer, 'gate', {
        urgency: inputData.urgency,
        amount: inputData.amount,
        hasResumeData: Boolean(resumeData),
      });

      const isRisky = inputData.urgency === 'critical' || inputData.amount > 100;

      // Re-entered after resume? (The step was suspended, now we have resumeData.)
      if (resumeData) {
        // Pass the human's decision through to the next step via the output.
        const humanDecision = (resumeData as { decision: 'approved' | 'rejected' }).decision;
        const out = { classified: inputData, decision: humanDecision, token: null };
        stepEnd(tracer, 'gate', out);
        return out;
      }

      if (isRisky) {
        // Register the run with the server so it can be resumed
        if (capturedRun && capturedMastra) {
          registerSuspendedRun(runId, {
            run: capturedRun as {
              resume: (params: { step: string; resumeData?: unknown }) => Promise<unknown>;
            },
            step: 'gate',
            workflow: capturedWorkflow,
            mastra: capturedMastra,
          });
        }
        // Emit a custom event so the UI knows to show the approval panel
        tracer.emit({ type: 'suspend', token: runId, payload: { classified: inputData } });
        // Suspend the workflow
        await suspend({ classified: inputData });
        // Code below runs only after resume()
        return { classified: inputData, decision: 'auto-approved' as const, token: null };
      }

      const out = { classified: inputData, decision: 'auto-approved' as const, token: null };
      stepEnd(tracer, 'gate', out);
      return out;
    },
  });

  const executeStep = createStep({
    id: 'execute',
    description: 'Execute the action if approved, block if rejected',
    inputSchema: GateOutputSchema,
    outputSchema: ExecuteOutputSchema,
    execute: async ({ inputData }) => {
      stepStart(tracer, 'execute', { classified: inputData.classified, decision: inputData.decision });

      // Normalize the gate's decision to a single boolean:
      //   'auto-approved' or 'approved' → execute
      //   'rejected'                  → block
      const finalDecision: 'approved' | 'rejected' =
        inputData.decision === 'rejected' ? 'rejected' : 'approved';

      tracer.emit({ type: 'resume', decision: finalDecision, payload: { classified: inputData.classified } });

      const executed = finalDecision === 'approved';
      const message = executed
        ? `Action executed: ${inputData.classified.urgency}-${inputData.classified.amount > 0 ? '$' + inputData.classified.amount : '0'} action approved.`
        : `Action blocked: human rejected the proposed action.`;

      const out = { classified: inputData.classified, decision: finalDecision, executed, message };
      stepEnd(tracer, 'execute', out);
      return out;
    },
  });

  const workflow = createWorkflow({
    id: 'hitl-approval',
    inputSchema: InputSchema,
    outputSchema: ExecuteOutputSchema,
  })
    .then(classifyStep)
    .then(gateStep)
    .then(executeStep)
    .commit();

  // Wrap the workflow so we can capture the run when it suspends.
  // This is the cleanest place to hook in: we override `createRun` to
  // stash the run, then proceed normally.
  // Since we don't have a wrapper API, we work around it: the gate step
  // closure already references `capturedRun` via the outer scope; the
  // caller (buildMastra → runOne) sets `capturedRun` after createRun().
  return {
    workflow,
    captureRun: (run: {
      runId: string;
      resume: (params: { step: string; resumeData?: unknown }) => Promise<unknown>;
    }) => {
      capturedRun = run;
    },
    captureMastra: (mastra: unknown) => {
      capturedMastra = mastra;
    },
  };
}

function buildMastra(tracer: Tracer, useModel: ReturnType<typeof getModel> = model) {
  const wrapped = makeWorkflow(tracer, useModel);
  return {
    mastra: new Mastra({
      agents: { 'hitl-classifier': makeAgent(useModel) },
      workflows: { 'hitl-approval': wrapped.workflow },
      logger,
    }),
    captureRun: wrapped.captureRun,
    captureMastra: wrapped.captureMastra,
  };
}

export interface RunOptions {
  action: string;
  actionType: 'refund' | 'send' | 'delete';
  provider?: LlmProvider;
  model?: string;
  /** For resume: the runId (token) + the human's decision. */
  resume?: { token: string; decision: 'approved' | 'rejected' };
}

export async function runOne(input: RunOptions, tracer: Tracer, context?: RunContext) {
  const t0 = startRun(tracer, 'hitl-approval', input, STEPS);

  const useModel = resolveModel(input.model, input.provider);

  // Resume path: continue a previously-suspended run.
  // (Mastra doesn't expose a getRun by id; the run is captured at suspend
  // time by the server and resumed from there. For the CLI demo, we
  // don't have a way to recover the run from just the token — the resume
  // path is exercised through the UI's POST /api/resume endpoint.)
  if (input.resume) {
    return {
      status: 'failed',
      input,
      output: null,
      error:
        'Resume from CLI not supported — use the UI (POST /api/resume) or capture the Run object in the server.',
    };
  }

  // Fresh run
  const built = buildMastra(tracer, useModel);
  const wf = built.mastra.getWorkflow('hitl-approval');
  const run = await wf.createRun();
  cancelRunOnSignal(run, context);
  built.captureRun(
    run as unknown as {
      runId: string;
      resume: (params: { step: string; resumeData?: unknown }) => Promise<unknown>;
    },
  );
  built.captureMastra(built.mastra);
  const result = await run.start({ inputData: { action: input.action, actionType: input.actionType } });
  return finalizeRunResult(result, tracer, t0, input, run.runId);
}

// ─── CLI demo ────────────────────────────────────────────────────────────
if (isMain(import.meta.url, process.argv[1])) {
  runCliExample(async (silentTracer) => {
    console.log('=== HITL Approval demo ===\n');

    // 1) Low-risk action: auto-approved
    console.log('Test 1: small refund (auto-approved)');
    const r1 = await runOne({ action: 'Refund $20 to customer 12345', actionType: 'refund' }, silentTracer);
    console.log(`  status: ${r1.status}`);
    const o1 = r1.output as { executed?: boolean; message?: string } | null;
    if (o1 && typeof o1 === 'object') {
      console.log(`  executed: ${o1.executed ?? '?'}`);
      console.log(`  message: ${o1.message ?? '?'}`);
    }

    console.log('\nTest 2: large refund (should suspend)');
    // 2) High-risk action: suspends. We can't easily test the resume path from CLI,
    //    so we just confirm the suspension happens.
    const r2 = await runOne(
      { action: 'Refund $500 to customer 12345 — they threatened to sue', actionType: 'refund' },
      silentTracer,
    );
    console.log(`  status: ${r2.status}`);
    const o2 = r2.output as { token?: string; suspendedStep?: { id?: string } } | null;
    if (r2.status === 'suspended' && o2) {
      console.log(`  resumption token: ${o2.token ?? '?'}`);
    }
  });
}
