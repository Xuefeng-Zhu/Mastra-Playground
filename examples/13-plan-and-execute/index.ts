/**
 * Example 13 — Plan-and-Execute Agent
 *
 * What it teaches:
 *   - Planner agent decomposes a task into a short structured plan.
 *   - Executor agent works through each step sequentially, with prior results
 *     as context.
 *   - Summarizer agent turns execution results into a final answer.
 */

import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { runWithCancellation, type RunContext } from '../../shared/cancellable-run';
import { resolveModel, type LlmProvider } from '../../shared/llm';
import { logger } from '../../shared/mastra-logger';
import type { Tracer } from '../../shared/tracer';
import { llmStructured, startRun, stepEnd, stepStart, type StepSpec } from '../../shared/traced-step';
import { finalizeRunResult } from '../../shared/run-result';
import { isMain, runCliExample } from '../../shared/cli-bootstrap';

export const DEFAULT_PLAN_STEPS = 3;
export const MAX_PLAN_STEPS = 5;

const PlanStepSchema = z.object({
  id: z.string().min(1).max(24),
  title: z.string().min(1).max(80),
  objective: z.string().min(1).max(240),
  successCriteria: z.string().min(1).max(240),
});

export const PlanSchema = z
  .object({
    steps: z.array(PlanStepSchema).min(1).max(MAX_PLAN_STEPS),
  })
  .refine((plan) => new Set(plan.steps.map((step) => step.id)).size === plan.steps.length, {
    message: 'Plan step ids must be unique',
    path: ['steps'],
  });

const ExecutionResultSchema = z.object({
  stepId: z.string(),
  title: z.string(),
  status: z.enum(['done', 'blocked', 'needs_follow_up']),
  result: z.string().min(1),
  evidence: z.array(z.string()).max(3),
});

const SummarySchema = z.object({
  answer: z.string().min(1),
  completedSteps: z.number().int().min(0),
  caveats: z.array(z.string()).max(4),
});

const WithTask = z.object({ task: z.string() });
const WithPlan = WithTask.extend({ plan: PlanSchema });
const WithExecutions = WithPlan.extend({ executions: z.array(ExecutionResultSchema) });
const FinalSchema = WithExecutions.extend({
  answer: z.string(),
  caveats: z.array(z.string()),
  totalSteps: z.number().int().min(1).max(MAX_PLAN_STEPS),
});

export type Plan = z.infer<typeof PlanSchema>;
export type PlanStep = z.infer<typeof PlanStepSchema>;
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

const STEPS: StepSpec[] = [
  { id: 'plan', label: 'Planner creates plan', kind: 'llm' },
  { id: 'execute', label: 'Executor runs steps', kind: 'llm' },
  { id: 'summarize', label: 'Summarizer answers', kind: 'llm' },
];

export function capPlanSteps<T>(steps: T[], maxSteps = MAX_PLAN_STEPS): T[] {
  return steps.slice(0, Math.max(0, maxSteps));
}

export function orderedExecutionIds(executions: ExecutionResult[]): string[] {
  return executions.map((execution) => execution.stepId);
}

function normalizeExecution(step: PlanStep, result: ExecutionResult): ExecutionResult {
  return {
    stepId: step.id,
    title: step.title,
    status: result.status,
    result: result.result,
    evidence: capPlanSteps(result.evidence, 3),
  };
}

function makePlanStep(tracer: Tracer, agent: Agent) {
  return createStep({
    id: 'plan',
    description: 'Planner decomposes the task into a short execution plan',
    inputSchema: WithTask,
    outputSchema: WithPlan,
    execute: async ({ inputData, abortSignal }) => {
      stepStart(tracer, 'plan', { task: inputData.task });
      const prompt = [
        `Task: ${inputData.task}`,
        '',
        `Create ${DEFAULT_PLAN_STEPS} or fewer sequential execution steps.`,
        'Return exactly this shape: { "steps": [{ "id", "title", "objective", "successCriteria" }] }.',
        'Do not use alternate fields such as "action", "description", or "done".',
        'Each step should be concrete enough for a separate executor agent to complete.',
      ].join('\n');
      const result = await agent.generate(prompt, {
        abortSignal,
        structuredOutput: { schema: PlanSchema },
      });
      const plan = { steps: capPlanSteps((result.object as Plan).steps, DEFAULT_PLAN_STEPS) };
      const out = { task: inputData.task, plan };
      llmStructured(tracer, 'plan', 'PlanSchema', plan);
      stepEnd(tracer, 'plan', out);
      return out;
    },
  });
}

function makeExecuteStep(tracer: Tracer, agent: Agent) {
  return createStep({
    id: 'execute',
    description: 'Executor agent completes each plan step sequentially',
    inputSchema: WithPlan,
    outputSchema: WithExecutions,
    execute: async ({ inputData, abortSignal }) => {
      stepStart(tracer, 'execute', { task: inputData.task, totalSteps: inputData.plan.steps.length });
      const executions: ExecutionResult[] = [];
      for (const step of inputData.plan.steps) {
        const prompt = [
          `Original task: ${inputData.task}`,
          `Full plan: ${JSON.stringify(inputData.plan.steps)}`,
          `Current step: ${JSON.stringify(step)}`,
          `Prior results: ${JSON.stringify(executions)}`,
          '',
          'Complete only the current step. Return concise evidence for what you did.',
        ].join('\n');
        const result = await agent.generate(prompt, {
          abortSignal,
          structuredOutput: { schema: ExecutionResultSchema },
        });
        const execution = normalizeExecution(step, result.object as ExecutionResult);
        executions.push(execution);
        llmStructured(tracer, 'execute', 'ExecutionResultSchema', execution);
      }
      const out = { ...inputData, executions };
      stepEnd(tracer, 'execute', {
        totalSteps: executions.length,
        executionOrder: orderedExecutionIds(executions),
        executions,
      });
      return out;
    },
  });
}

function makeSummarizeStep(tracer: Tracer, agent: Agent) {
  return createStep({
    id: 'summarize',
    description: 'Summarizer converts step results into a final answer',
    inputSchema: WithExecutions,
    outputSchema: FinalSchema,
    execute: async ({ inputData, abortSignal }) => {
      stepStart(tracer, 'summarize', {
        task: inputData.task,
        totalSteps: inputData.executions.length,
      });
      const prompt = [
        `Task: ${inputData.task}`,
        `Plan: ${JSON.stringify(inputData.plan.steps)}`,
        `Execution results: ${JSON.stringify(inputData.executions)}`,
        '',
        'Write a direct final answer for the user and list any caveats.',
      ].join('\n');
      const result = await agent.generate(prompt, {
        abortSignal,
        structuredOutput: { schema: SummarySchema },
      });
      const summary = result.object as z.infer<typeof SummarySchema>;
      const out = {
        ...inputData,
        answer: summary.answer,
        caveats: summary.caveats,
        totalSteps: inputData.executions.length,
      };
      llmStructured(tracer, 'summarize', 'SummarySchema', summary);
      stepEnd(tracer, 'summarize', out);
      return out;
    },
  });
}

function makeWorkflow(tracer: Tracer, planner: Agent, executor: Agent, summarizer: Agent) {
  return createWorkflow({
    id: 'plan-and-execute',
    inputSchema: WithTask,
    outputSchema: FinalSchema,
  })
    .then(makePlanStep(tracer, planner))
    .then(makeExecuteStep(tracer, executor))
    .then(makeSummarizeStep(tracer, summarizer))
    .commit();
}

export interface RunOptions {
  task: string;
  provider?: LlmProvider;
  model?: string;
}

export async function runOne(input: RunOptions, tracer: Tracer, context?: RunContext) {
  const t0 = startRun(tracer, 'plan-and-execute', input, STEPS);
  const useModel = resolveModel(input.model, input.provider, context?.llmConfig);
  const planner = new Agent({
    id: 'plan-execute-planner',
    name: 'Planner',
    instructions: [
      'You decompose user tasks into short, sequential execution plans.',
      `Return at most ${DEFAULT_PLAN_STEPS} steps.`,
      'Use stable ids like step-1, step-2, step-3.',
      'Every step must include id, title, objective, and successCriteria.',
      'Return JSON only matching the schema.',
    ].join('\n'),
    model: useModel,
  });
  const executor = new Agent({
    id: 'plan-execute-executor',
    name: 'Executor',
    instructions: [
      'You complete one plan step at a time.',
      'Use the original task, full plan, and prior results as context.',
      'Do not redo prior steps. Keep results practical and concise.',
      'Return JSON only matching the schema.',
    ].join('\n'),
    model: useModel,
  });
  const summarizer = new Agent({
    id: 'plan-execute-summarizer',
    name: 'Summarizer',
    instructions: [
      'You summarize sequential execution results into one useful final answer.',
      'Mention caveats only when the execution results leave uncertainty.',
      'Return JSON only matching the schema.',
    ].join('\n'),
    model: useModel,
  });
  const mastra = new Mastra({
    agents: { planner, executor, summarizer },
    workflows: { 'plan-and-execute': makeWorkflow(tracer, planner, executor, summarizer) },
    logger,
  });

  const wf = mastra.getWorkflow('plan-and-execute');
  const run = await wf.createRun();
  const result = await runWithCancellation(run, context, () =>
    run.start({ inputData: { task: input.task } }),
  );

  return finalizeRunResult(result, tracer, t0, input);
}

const demoTasks = [
  'Create a launch checklist for adding a public beta waitlist to a small SaaS app.',
  'Plan how to compare two LLM providers for support-ticket summarization.',
];

if (isMain(import.meta.url, process.argv[1])) {
  runCliExample(async (silentTracer) => {
    for (const task of demoTasks) {
      const r = await runOne({ task }, silentTracer);
      console.log(`\n- Plan-and-execute: "${task}"`);
      if (r.status === 'success' && r.output) {
        const out = r.output as z.infer<typeof FinalSchema>;
        console.log(`  steps=${out.totalSteps}`);
        console.log(`  answer=${out.answer}`);
        if (out.caveats.length) console.log(`  caveats=${out.caveats.join(' | ')}`);
      } else {
        console.log(`  workflow ${r.status}: ${r.error}`);
      }
    }
  });
}
