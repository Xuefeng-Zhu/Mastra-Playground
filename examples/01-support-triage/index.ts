/**
 * Example 01 — Support Triage (with tracing)
 *
 * Same as before, but every step now emits trace events so the UI can show
 * the LLM call and branch decision happening in real time.
 *
 * Run: npm run example:01
 */

import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { Mastra } from '@mastra/core';
import { resolveModel, model } from '../../shared/llm';
import { logger } from '../../shared/mastra-logger';
import type { Tracer } from '../../shared/tracer';
import {
  startRun,
  stepStart,
  stepEnd,
  llmStructured,
  branchEvaluate,
  type StepSpec,
} from '../../shared/traced-step';
import { finalizeRunResult } from '../../shared/run-result';
import { isMain, runCliExample } from '../../shared/cli-bootstrap';

// ─── 1. The structured-output schema ────────────────────────────────────────
const TriageSchema = z.object({
  intent: z.enum(['how_to', 'billing', 'complaint', 'account', 'other']),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  requires_human: z.boolean(),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  response_text: z.string().nullable(),
});

export type Triage = z.infer<typeof TriageSchema>;

// ─── 2. The agent (model is injected per-request via the makeXxxStep closures) ──
// We don't construct the Agent at module load — it gets built fresh inside runOne()
// with the model that the request specifies. The step closures capture it.

// ─── 3. Steps ───────────────────────────────────────────────────────────────
function makeClassifyStep(tracer: Tracer, useModel = model) {
  return createStep({
    id: 'classify',
    description: 'Run the triage agent to classify the message',
    inputSchema: z.object({ message: z.string() }),
    outputSchema: TriageSchema,
    execute: async ({ inputData }) => {
      stepStart(tracer, 'classify', { message: inputData.message });
      // Build a per-call agent so we can pass the model
      const agent = new Agent({
        id: 'support-triage',
        name: 'Support Triage',
        instructions: [
          'You are a customer support triage agent.',
          'Read the customer message and classify it.',
          'For "how_to" and "billing": write a concise, empathetic response in response_text.',
          'For "complaint" and "account": set requires_human=true and leave response_text null.',
          'For "other": set requires_human=true with a clarifying question in response_text.',
          'Be honest about uncertainty — do not invent refund windows, warranties, or policy numbers.',
        ].join('\n'),
        model: useModel,
      });
      const result = await agent.generate(inputData.message, {
        structuredOutput: { schema: TriageSchema },
      });
      const triage = result.object as Triage;
      llmStructured(tracer, 'classify', 'TriageSchema', triage);
      stepEnd(tracer, 'classify', triage);
      return triage;
    },
  });
}

function makeRespondStep(tracer: Tracer) {
  return createStep({
    id: 'respond',
    description: 'Bot sends the drafted response',
    inputSchema: TriageSchema,
    outputSchema: z.object({ action: z.string(), triage: TriageSchema }),
    execute: async ({ inputData }) => {
      stepStart(tracer, 'respond', { intent: inputData.intent });
      const out = { action: 'bot_replied', triage: inputData };
      stepEnd(tracer, 'respond', out);
      return out;
    },
  });
}

function makeEscalateStep(tracer: Tracer) {
  return createStep({
    id: 'escalate',
    description: 'Hand off to a human agent',
    inputSchema: TriageSchema,
    outputSchema: z.object({ action: z.string(), triage: TriageSchema }),
    execute: async ({ inputData }) => {
      stepStart(tracer, 'escalate', { intent: inputData.intent, urgency: inputData.urgency });
      const out = { action: 'escalated', triage: inputData };
      stepEnd(tracer, 'escalate', out);
      return out;
    },
  });
}

// ─── 4. Workflow factory ───────────────────────────────────────────────────
const STEPS: StepSpec[] = [
  { id: 'classify', label: 'Classify (LLM)', kind: 'llm' },
  { id: 'respond', label: 'Bot responds', kind: 'passthrough' },
  { id: 'escalate', label: 'Escalate to human', kind: 'passthrough' },
];

// ─── 5. The workflow graph ───────────────────────────────────────────────────
// The workflow is rebuilt per request inside runOne() with the model specified
// by the request. No module-level buildMastra() needed.

// ─── 6. Traced runOne ──────────────────────────────────────────────────────
export interface RunOptions {
  message: string;
  model?: string;
  threshold?: number;
}

export async function runOne(input: RunOptions, tracer: Tracer) {
  const t0 = startRun(tracer, 'support-triage', input, STEPS);

  // Build per-request model if overridden
  const useModel = resolveModel(input.model);
  const classifyStep = makeClassifyStep(tracer, useModel);
  const respondStep = makeRespondStep(tracer);
  const escalateStep = makeEscalateStep(tracer);

  const mastra = new Mastra({
    workflows: {
      triage: createWorkflow({
        id: 'triage',
        inputSchema: z.object({ message: z.string() }),
        outputSchema: z.object({ action: z.string(), triage: TriageSchema }),
      })
        .then(classifyStep)
        .branch([
          [
            async ({ inputData }) => {
              const matched = inputData.intent === 'how_to';
              branchEvaluate(tracer, 'branch.intent', matched, `intent === 'how_to'`);
              return matched;
            },
            respondStep,
          ],
          [
            async ({ inputData }) => {
              const matched = inputData.intent === 'billing';
              branchEvaluate(tracer, 'branch.intent', matched, `intent === 'billing'`);
              return matched;
            },
            respondStep,
          ],
          [
            async ({ inputData }) => {
              // Optional threshold from settings
              const threshold = input.threshold ?? 0;
              const matched = inputData.requires_human || inputData.confidence < threshold;
              branchEvaluate(tracer, 'branch.intent', matched, `requires_human || confidence < ${threshold}`);
              return matched;
            },
            escalateStep,
          ],
        ])
        .commit(),
    },
    logger,
  });
  const wf = mastra.getWorkflow('triage');
  const run = await wf.createRun();
  const result = await run.start({ inputData: { message: input.message } });

  return finalizeRunResult(result, tracer, t0, input);
}

// ─── 7. CLI demo (no tracer) ────────────────────────────────────────────────
const demoMessages = [
  'How do I reset my password?',
  'I was charged twice this month, please refund me.',
  'Your product is broken and I want a manager to call me.',
  'My account is locked and I cannot log in for my work meeting in 30 minutes.',
  'Do you have a product that does X?',
];

if (isMain(import.meta.url, process.argv[1])) {
  runCliExample(async (silentTracer) => {
    for (const message of demoMessages) {
      const r = await runOne({ message }, silentTracer);
      console.log(`\n— IN: "${message}"`);
      if (r.status === 'success' && r.output) {
        const out = r.output as { action: string; triage: Triage };
        console.log(`  ← ${out.action} (intent=${out.triage.intent}, confidence=${out.triage.confidence})`);
      } else {
        console.log(`  ← ${r.status}: ${r.error}`);
      }
    }
  });
}
