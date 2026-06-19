/**
 * Example 03 — Code Review Agent (with tracing)
 */

import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { Mastra } from '@mastra/core';
import { model as defaultModel, getModel } from '../../shared/llm.js';
import { logger } from '../../shared/observability.js';
import { unwrapWorkflowOutput } from '../../shared/workflow-helpers.js';
import type { Tracer } from '../../shared/tracer.js';
import { stepStart, stepEnd, branchEvaluate, toolCall, type StepSpec } from '../../shared/traced-step.js';
import { readFile, readFileDirect } from './tools/read-file.js';
import { runCheck, runCheckDirect } from './tools/run-check.js';

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

function makeGenerateReviewStep(tracer: Tracer, useModel = defaultModel) {
  return createStep({
    id: 'generate-review',
    description: 'Use the LLM to write the review comment',
    inputSchema: z.object({
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
    outputSchema: z.object({
      path: z.string(),
      action: z.enum(['reviewed', 'approved']),
      review: z.string(),
      issueCount: z.number(),
    }),
    execute: async ({ inputData }) => {
      stepStart(tracer, 'generate-review', { path: inputData.path, issueCount: inputData.issues.length });
      const issueList = inputData.issues
        .map((i) => `- [${i.severity}] line ${i.line}: ${i.message}`)
        .join('\n');
      const prompt = `File: ${inputData.path}\n\nIssues found:\n${issueList || '(none)'}\n\nFile content:\n\`\`\`\n${inputData.content}\n\`\`\`\n\nWrite the review comment.`;
      const agent = new Agent({
        id: 'code-reviewer',
        name: 'Code Reviewer',
        instructions: [
          'You are a code reviewer.',
          'Given a list of issues and the file content, write a short Markdown review comment.',
          'Lead with the most important issues. Be specific (cite line numbers).',
          'Keep it under 200 words. No pleasantries.',
        ].join('\n'),
        model: useModel,
      });
      const result = await agent.generate(prompt);
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
    inputSchema: z.object({
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
    outputSchema: z.object({
      path: z.string(),
      action: z.enum(['reviewed', 'approved']),
      review: z.string(),
      issueCount: z.number(),
    }),
    execute: async () => {
      stepStart(tracer, 'approve', {});
      const out = { path: '', action: 'approved' as const, review: 'No issues found. LGTM ✅', issueCount: 0 };
      stepEnd(tracer, 'approve', out);
      return out;
    },
  });
}

function makeWorkflow(tracer: Tracer, useModel: ReturnType<typeof getModel> = defaultModel) {
  return createWorkflow({
    id: 'review',
    inputSchema: z.object({ path: z.string() }),
    outputSchema: z.object({
      path: z.string(),
      action: z.enum(['reviewed', 'approved']),
      review: z.string(),
      issueCount: z.number(),
    }),
  })
    .then(makeFetchFileStep(tracer))
    .then(makeCheckFileStep(tracer))
    .branch([
      [async ({ inputData }) => {
        const matched = inputData.issues.length === 0;
        branchEvaluate(tracer, 'branch.issues', matched, `issues.length === 0`);
        return matched;
      }, makeApproveStep(tracer)],
      [async ({ inputData }) => {
        const matched = inputData.issues.length > 0;
        branchEvaluate(tracer, 'branch.issues', matched, `issues.length > 0`);
        return matched;
      }, makeGenerateReviewStep(tracer, useModel)],
    ])
    .commit();
}

export interface RunOptions {
  path: string;
  model?: string;
}

export async function runOne(input: RunOptions, tracer: Tracer) {
  const t0 = Date.now();
  tracer.emit({ type: 'start', workflow: 'code-review', input, steps: STEPS });

  const useModel = input.model ? getModel(input.model) : defaultModel;
  const mastra = new Mastra({
    agents: { reviewer: new Agent({ id: 'code-reviewer', name: 'Code Reviewer', instructions: 'review', model: useModel }) },
    workflows: { review: makeWorkflow(tracer, useModel) },
    logger,
  });

  const wf = mastra.getWorkflow('review');
  const run = await wf.createRun();
  const result = await run.start({ inputData: { path: input.path } });

  const output = result.status === 'success' ? unwrapWorkflowOutput(result.result) : null;
  // Normalize the failed result into something readable rather than [object Object].
  const errMsg = result.status !== 'success' ? JSON.stringify(result) ?? String(result) : null;
  // Cast done-status to the tracer's narrower union (Mastra also emits 'tripwire' | 'paused' which we don't surface here).
  const doneStatus = (result.status === 'success' || result.status === 'failed' || result.status === 'suspended')
    ? result.status
    : 'failed' as const;
  tracer.emit({ type: 'done', status: doneStatus, output, totalMs: Date.now() - t0 });

  return {
    status: result.status,
    input: { path: input.path },
    output,
    error: errMsg,
  };
}

const demoFiles = ['auth.ts', 'utils.ts', 'clean.ts'];

async function main() {
  const { Tracer } = await import('../../shared/tracer.js');
  const silentTracer = new Tracer();
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
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

// Note: keep `readFile` and `runCheck` imported (used when an agent's `tools:` references them)
void readFile;
void runCheck;
