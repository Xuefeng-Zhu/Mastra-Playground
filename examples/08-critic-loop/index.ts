/**
 * Example 08 — Critic Loop (evaluator-optimizer)
 *
 * What it teaches:
 *   - The "evaluator-optimizer" pattern: generate → critique → regenerate if
 *     score below threshold. The critic's feedback is fed back into the next
 *     generation so each draft is a strict improvement on the last.
 *   - How to wire a feedback loop *inside* a Mastra workflow using a small
 *     `for` loop in the step's `execute` (no .branch() recursion needed when
 *     the loop body is small and deterministic). The trace shows one
 *     `step:start` for "iterate", N pairs of `critique` + `regenerate`
 *     events inside it, and a single `step:end`.
 *   - The cost-vs-quality tradeoff: more iterations = better quality,
 *     linear cost. `maxIterations` is the budget cap.
 *
 * Shape:
 *   input:  { topic, threshold?, maxIterations? }
 *   iterate (one step, internal loop):
 *     for i in 0..maxIterations:
 *       generate(topic, draft[i-1]?, feedback?)  -> draft[i]
 *       critique(topic, draft[i])                -> { score, feedback }
 *       if score >= threshold: break
 *   output: { topic, draft, score, iterations, history[] }
 *
 * Run: npm run example:08
 */

import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { Mastra } from '@mastra/core';
import { resolveModel, model } from '../../shared/llm.js';
import { logger } from '../../shared/mastra-logger.js';
import type { Tracer } from '../../shared/tracer.js';
import {
  startRun,
  stepStart,
  stepEnd,
  llmStructured,
  timed,
  type StepSpec,
} from '../../shared/traced-step.js';
import { finalizeRunResult } from '../../shared/run-result.js';
import { isMain, runCliExample } from '../../shared/cli-bootstrap.js';

// ─── Schemas ──────────────────────────────────────────────────────────────

const CritiqueSchema = z.object({
  score: z.number().min(0).max(10),
  feedback: z.string(),
});

const IterationSchema = z.object({
  index: z.number().int().min(0),
  draft: z.string(),
  score: z.number().min(0).max(10),
  feedback: z.string(),
});

const STEPS: StepSpec[] = [{ id: 'iterate', label: 'Generate → critique → regenerate (loop)', kind: 'llm' }];

const INPUT_DEFAULTS = {
  threshold: 7,
  maxIterations: 3,
};

// ─── Step factory ─────────────────────────────────────────────────────────

function makeIterateStep(tracer: Tracer, generator: Agent, critic: Agent) {
  return createStep({
    id: 'iterate',
    description:
      'Generate a draft, have a critic score it, regenerate using the feedback until the score meets the threshold or we hit the iteration budget.',
    inputSchema: z.object({
      topic: z.string(),
      threshold: z.number().min(0).max(10).default(INPUT_DEFAULTS.threshold),
      maxIterations: z.number().int().min(1).max(5).default(INPUT_DEFAULTS.maxIterations),
    }),
    outputSchema: z.object({
      topic: z.string(),
      threshold: z.number(),
      maxIterations: z.number(),
      draft: z.string(),
      score: z.number(),
      iterations: z.number().int(),
      history: z.array(IterationSchema),
    }),
    execute: async ({ inputData }) => {
      return timed(
        tracer,
        'iterate',
        {
          topic: inputData.topic,
          threshold: inputData.threshold,
          maxIterations: inputData.maxIterations,
        },
        async () => {
          const history: z.infer<typeof IterationSchema>[] = [];
          let draft = '';
          let lastFeedback = '';
          let lastScore = 0;

          for (let i = 0; i < inputData.maxIterations; i++) {
            const genPrompt =
              i === 0
                ? `Topic: "${inputData.topic}".\nWrite a concise ~150-word answer.`
                : `Topic: "${inputData.topic}".\n\nPrevious draft (scored ${lastScore}/10):\n${draft}\n\nCritic's feedback:\n${lastFeedback}\n\nRewrite to address the feedback. Keep it ~150 words.`;

            const genResult = await generator.generate(genPrompt);
            draft = String(genResult.text).trim();

            const critPrompt = `Topic: "${inputData.topic}".\n\nDraft:\n${draft}\n\nScore this draft and give one sentence of feedback.`;
            const critResult = await critic.generate(critPrompt, {
              structuredOutput: { schema: CritiqueSchema },
            });
            const critique = critResult.object as z.infer<typeof CritiqueSchema>;
            lastScore = critique.score;
            lastFeedback = critique.feedback;

            const entry = { index: i, draft, score: lastScore, feedback: lastFeedback };
            history.push(entry);
            llmStructured(tracer, 'iterate', `Iter[${i}]`, entry);

            if (lastScore >= inputData.threshold) {
              break;
            }
          }

          return {
            topic: inputData.topic,
            threshold: inputData.threshold,
            maxIterations: inputData.maxIterations,
            draft,
            score: lastScore,
            iterations: history.length,
            history,
          };
        },
      );
    },
  });
}

function makeWorkflow(tracer: Tracer, generator: Agent, critic: Agent) {
  return createWorkflow({
    id: 'critic-loop',
    inputSchema: z.object({
      topic: z.string(),
      threshold: z.number().min(0).max(10).default(INPUT_DEFAULTS.threshold),
      maxIterations: z.number().int().min(1).max(5).default(INPUT_DEFAULTS.maxIterations),
    }),
    outputSchema: z.object({
      topic: z.string(),
      threshold: z.number(),
      maxIterations: z.number(),
      draft: z.string(),
      score: z.number(),
      iterations: z.number().int(),
      history: z.array(IterationSchema),
    }),
  })
    .then(makeIterateStep(tracer, generator, critic))
    .commit();
}

// ─── Public entrypoint used by the server ─────────────────────────────────

export interface RunOptions {
  topic: string;
  threshold?: number;
  maxIterations?: number;
  model?: string;
}

export async function runOne(input: RunOptions, tracer: Tracer) {
  const t0 = startRun(tracer, 'critic-loop', input, STEPS);

  const useModel = resolveModel(input.model);
  const generator = new Agent({
    id: 'draft-generator',
    name: 'Draft Generator',
    instructions: [
      'You are a writer producing concise, well-structured answers.',
      'Given a topic and (optionally) a prior draft plus critic feedback,',
      'produce a NEW draft that incorporates the feedback.',
      'If no prior draft exists, write the first version from scratch.',
      'Aim for ~150 words. Plain prose, no markdown headers.',
    ].join('\n'),
    model: useModel,
  });
  const critic = new Agent({
    id: 'draft-critic',
    name: 'Draft Critic',
    instructions: [
      'You are a strict critic scoring a short draft on a 0-10 scale.',
      'Score based on: relevance to topic, accuracy, completeness, clarity.',
      'Return JSON: {"score": <0-10 integer>, "feedback": "<one short sentence>"}',
      'Be honest — a 10 is rare. Most decent first drafts are 5-7.',
    ].join('\n'),
    model: useModel,
  });
  const mastra = new Mastra({
    agents: { generator, critic },
    workflows: { 'critic-loop': makeWorkflow(tracer, generator, critic) },
    logger,
  });

  const wf = mastra.getWorkflow('critic-loop');
  const run = await wf.createRun();
  const result = await run.start({
    inputData: {
      topic: input.topic,
      threshold: input.threshold ?? INPUT_DEFAULTS.threshold,
      maxIterations: input.maxIterations ?? INPUT_DEFAULTS.maxIterations,
    },
  });

  return finalizeRunResult(result, tracer, t0, input);
}

// ─── CLI demo ─────────────────────────────────────────────────────────────

const demoTopics = [
  'What is the difference between an AI agent and an AI workflow?',
  'How do I evaluate whether a small LLM is good enough for my use case?',
];

if (isMain(import.meta.url, process.argv[1])) {
  runCliExample('08-critic-loop', async (silentTracer) => {
    for (const topic of demoTopics) {
      const r = await runOne({ topic, threshold: 8, maxIterations: 3 }, silentTracer);
      console.log(`\n— Critic loop: "${topic}"`);
      if (r.status === 'success' && r.output) {
        const out = r.output as {
          draft: string;
          score: number;
          iterations: number;
          history: { index: number; score: number; feedback: string; draft: string }[];
        };
        console.log(`  score=${out.score}/10 after ${out.iterations} iteration(s)`);
        for (const h of out.history) {
          console.log(`    iter ${h.index}: ${h.score}/10 — ${h.feedback}`);
        }
        console.log(`\n${out.draft}\n`);
      } else {
        console.log(`  workflow ${r.status}: ${r.error}`);
      }
    }
  });
}
