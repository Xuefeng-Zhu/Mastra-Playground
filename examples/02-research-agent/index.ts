/**
 * Example 02 — Research Agent (with tracing)
 */

import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { Mastra } from '@mastra/core';
import { model as defaultModel, getModel } from '../../shared/llm.js';
import { logger } from '../../shared/observability.js';
import { unwrapWorkflowOutput } from '../../shared/workflow-helpers.js';
import type { Tracer } from '../../shared/tracer.js';
import { stepStart, stepEnd, type StepSpec } from '../../shared/traced-step.js';
import { webSearch } from './tools/web-search.js';
import { arxivSearch } from './tools/arxiv.js';

const STEPS: StepSpec[] = [
  { id: 'run-agent', label: 'Research (LLM + tools)', kind: 'llm' },
  { id: 'format', label: 'Format output', kind: 'passthrough' },
];

function makeRunAgentStep(tracer: Tracer, useModel = defaultModel) {
  return createStep({
    id: 'run-agent',
    description: 'Ask the research agent to investigate the topic',
    inputSchema: z.object({ topic: z.string() }),
    outputSchema: z.object({ topic: z.string(), summary: z.string() }),
    execute: async ({ inputData }) => {
      stepStart(tracer, 'run-agent', { topic: inputData.topic });
      const agent = new Agent({
        id: 'research-agent',
        name: 'Research Agent',
        instructions: [
          'You are a research agent.',
          'Given a topic, you can use the web-search tool to find public sources',
          'and the arxiv-search tool to find academic papers.',
          'Use both tools. Synthesize what you found into a concise summary.',
        ].join('\n'),
        model: useModel,
        tools: { webSearch, arxivSearch },
      });
      const prompt = `Research the topic: "${inputData.topic}". Use the web-search and arxiv-search tools. Write a 3-4 sentence synthesis of what you found.`;
      const result = await agent.generate(prompt);
      const summary = String(result.text);
      const out = { topic: inputData.topic, summary };
      stepEnd(tracer, 'run-agent', out);
      return out;
    },
  });
}

function makeFormatStep(tracer: Tracer) {
  return createStep({
    id: 'format',
    description: 'Pretty-print the final research output',
    inputSchema: z.object({ topic: z.string(), summary: z.string() }),
    outputSchema: z.object({ topic: z.string(), formatted: z.string() }),
    execute: async ({ inputData }) => {
      stepStart(tracer, 'format', { topic: inputData.topic });
      const out = { topic: inputData.topic, formatted: `## ${inputData.topic}\n\n${inputData.summary}` };
      stepEnd(tracer, 'format', out);
      return out;
    },
  });
}

export interface RunOptions {
  topic: string;
  model?: string;
}

export async function runOne(input: RunOptions, tracer: Tracer) {
  const t0 = Date.now();
  tracer.emit({ type: 'start', workflow: 'research', input, steps: STEPS });

  const useModel = input.model ? getModel(input.model) : defaultModel;
  const runAgentStep = makeRunAgentStep(tracer, useModel);
  const formatStep = makeFormatStep(tracer);

  const mastra = new Mastra({
    agents: { research: new Agent({ id: 'research-agent', name: 'Research Agent', instructions: 'research', model: useModel }) },
    workflows: { research: createWorkflow({
      id: 'research',
      inputSchema: z.object({ topic: z.string() }),
      outputSchema: z.object({ topic: z.string(), formatted: z.string() }),
    })
      .then(runAgentStep)
      .then(formatStep)
      .commit() },
    logger,
  });

  const wf = mastra.getWorkflow('research');
  const run = await wf.createRun();
  const result = await run.start({ inputData: { topic: input.topic } });

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
    input: { topic: input.topic },
    output,
    error: errMsg,
  };
}

const demoTopics = [
  'Contextual Retrieval for RAG',
  'hybrid search with BM25 and vector reranking',
];

async function main() {
  const { Tracer } = await import('../../shared/tracer.js');
  const silentTracer = new Tracer();
  for (const topic of demoTopics) {
    const r = await runOne({ topic }, silentTracer);
    console.log(`\n— Researching: "${topic}"`);
    if (r.status === 'success' && r.output) {
      const out = r.output as { formatted: string };
      console.log(`\n${out.formatted}\n`);
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
