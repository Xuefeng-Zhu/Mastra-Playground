/**
 * Example 03 — Code Review Agent (with tracing)
 */

import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { Mastra } from '@mastra/core';
import { runWithCancellation, type RunContext } from '../../shared/cancellable-run';
import { resolveModel, type LlmProvider } from '../../shared/llm';
import { logger } from '../../shared/mastra-logger';
import type { Tracer } from '../../shared/tracer';
import {
  startRun,
  stepStart,
  stepEnd,
  branchEvaluate,
  toolCall,
  type StepSpec,
} from '../../shared/traced-step';
import { finalizeRunResult } from '../../shared/run-result';
import { isMain, runCliExample } from '../../shared/cli-bootstrap';
import { readFileDirect } from './tools/read-file';
import { runCheckDirect } from './tools/run-check';

// Hoisted: declared 3x in the original (steps + workflow). Hoisting keeps the
// shape single-sourced so a change is one edit, not three.
const ReviewOutputSchema = z.object({
  path: z.string(),
  action: z.enum(['reviewed', 'approved']),
  review: z.string(),
  issueCount: z.number(),
});

const IssuesSchema = z.object({
  path: z.string(),
  content: z.string(),
  issues: z.array(
    z.object({
      severity: z.enum(['error', 'warning', 'info']),
      line: z.number(),
      message: z.string(),
    }),
  ),
});

const STEPS: StepSpec[] = [
  { id: 'fetch-file', label: 'Read file', kind: 'tool' },
  { id: 'check-file', label: 'Run lint', kind: 'tool' },
  { id: 'approve', label: 'Auto-approve (no LLM)', kind: 'passthrough' },
  { id: 'generate-review', label: 'LLM writes review', kind: 'llm' },
];

function makeFetchFileStep(tracer: Tracer) {
  return createStep({
    id: 'fetch-file',
    description: 'Read the file via the read-file tool',
    inputSchema: z.object({ path: z.string() }),
    outputSchema: z.object({ path: z.string(), content: z.string() }),
    execute: async ({ inputData }) => {
      stepStart(tracer, 'fetch-file', { path: inputData.path });
      const result = await readFileDirect(inputData.path);
      toolCall(tracer, 'fetch-file', 'read-file', { path: inputData.path }, result);
      stepEnd(tracer, 'fetch-file', result);
      return result;
    },
  });
}

function makeCheckFileStep(tracer: Tracer) {
  return createStep({
    id: 'check-file',
    description: 'Run static analysis via the run-check tool',
    inputSchema: z.object({ path: z.string(), content: z.string() }),
    outputSchema: z.object({
      path: z.string(),
      content: z.string(),
      issues: z.array(
        z.object({
          severity: z.enum(['error', 'warning', 'info']),
          line: z.number(),
          message: z.string(),
        }),
      ),
    }),
    execute: async ({ inputData }) => {
      stepStart(tracer, 'check-file', { path: inputData.path });
      const { path, issues } = await runCheckDirect(inputData.path, inputData.content);
      toolCall(tracer, 'check-file', 'run-check', { path, content: inputData.content }, { path, issues });
      const out = { path, content: inputData.content, issues };
      stepEnd(tracer, 'check-file', out);
      return out;
    },
  });
}

function makeGenerateReviewStep(tracer: Tracer, input: RunOptions, context?: RunContext) {
  return createStep({
    id: 'generate-review',
    description: 'Use the LLM to write the review comment',
    inputSchema: IssuesSchema,
    outputSchema: ReviewOutputSchema,
    execute: async ({ inputData, abortSignal }) => {
      stepStart(tracer, 'generate-review', { path: inputData.path, issueCount: inputData.issues.length });
      const agent = new Agent({
        id: 'code-reviewer',
        name: 'Code Reviewer',
        instructions: [
          'You are a code reviewer.',
          'Given a list of issues and the file content, write a short Markdown review comment.',
          'Lead with the most important issues. Be specific (cite line numbers).',
          'Keep it under 200 words. No pleasantries.',
        ].join('\n'),
        model: resolveModel(input.model, input.provider, context?.llmConfig),
      });
      const issueList = inputData.issues
        .map((i) => `- [${i.severity}] line ${i.line}: ${i.message}`)
        .join('\n');
      const prompt = `File: ${inputData.path}\n\nIssues found:\n${issueList || '(none)'}\n\nFile content:\n\`\`\`\n${inputData.content}\n\`\`\`\n\nWrite the review comment.`;
      const result = await agent.generate(prompt, { abortSignal });
      const out = {
        path: inputData.path,
        action: 'reviewed' as const,
        review: String(result.text),
        issueCount: inputData.issues.length,
      };
      stepEnd(tracer, 'generate-review', out);
      return out;
    },
  });
}

function makeApproveStep(tracer: Tracer) {
  return createStep({
    id: 'approve',
    description: 'No issues — approve the file',
    inputSchema: IssuesSchema,
    outputSchema: ReviewOutputSchema,
    execute: async () => {
      stepStart(tracer, 'approve', {});
      const out = {
        path: '',
        action: 'approved' as const,
        review: 'No issues found. LGTM ✅',
        issueCount: 0,
      };
      stepEnd(tracer, 'approve', out);
      return out;
    },
  });
}

function makeWorkflow(tracer: Tracer, input: RunOptions, context?: RunContext) {
  return createWorkflow({
    id: 'review',
    inputSchema: z.object({ path: z.string() }),
    outputSchema: ReviewOutputSchema,
  })
    .then(makeFetchFileStep(tracer))
    .then(makeCheckFileStep(tracer))
    .branch([
      [
        async ({ inputData }) => {
          const matched = inputData.issues.length === 0;
          branchEvaluate(tracer, 'branch.issues', matched, `issues.length === 0`);
          return matched;
        },
        makeApproveStep(tracer),
      ],
      [
        async ({ inputData }) => {
          const matched = inputData.issues.length > 0;
          branchEvaluate(tracer, 'branch.issues', matched, `issues.length > 0`);
          return matched;
        },
        makeGenerateReviewStep(tracer, input, context),
      ],
    ])
    .commit();
}

export interface RunOptions {
  path: string;
  provider?: LlmProvider;
  model?: string;
}

export async function runOne(input: RunOptions, tracer: Tracer, context?: RunContext) {
  const t0 = startRun(tracer, 'code-review', input, STEPS);

  const mastra = new Mastra({
    workflows: { review: makeWorkflow(tracer, input, context) },
    logger,
  });

  const wf = mastra.getWorkflow('review');
  const run = await wf.createRun();
  const result = await runWithCancellation(run, context, () =>
    run.start({ inputData: { path: input.path } }),
  );

  return finalizeRunResult(result, tracer, t0, input);
}

const demoFiles = ['auth.ts', 'utils.ts', 'clean.ts'];

if (isMain(import.meta.url, process.argv[1])) {
  runCliExample(async (silentTracer) => {
    for (const path of demoFiles) {
      const r = await runOne({ path }, silentTracer);
      console.log(`\n— Reviewing: ${path}`);
      if (r.status === 'success' && r.output) {
        const out = r.output as { action: string; issueCount: number; review: string };
        console.log(`  action: ${out.action}  issues: ${out.issueCount}`);
        console.log(out.review);
      } else {
        console.log(`  workflow ${r.status}: ${r.error}`);
      }
    }
  });
}
