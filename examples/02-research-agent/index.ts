/**
 * Example 02 — Research Agent (with tracing)
 */

import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { Mastra } from '@mastra/core';
import { resolveModel, model } from '../../shared/llm.js';
import { logger } from '../../shared/mastra-logger.js';
import type { Tracer } from '../../shared/tracer.js';
import { stepStart, stepEnd, type StepSpec } from '../../shared/traced-step.js';
import { finalizeRunResult } from '../../shared/run-result.js';
import { isMain, runCliExample } from '../../shared/cli-bootstrap.js';
import { webSearch } from './tools/web-search.js';
import { arxivSearch } from './tools/arxiv.js';

const STEPS: StepSpec[] = [
  { id: 'run-agent', label: 'Research (LLM + tools)', kind: 'llm' },
  { id: 'format', label: 'Format output', kind: 'passthrough' },
];

function makeRunAgentStep(tracer: Tracer, agent: Agent) {
  return createStep({
    id: 'run-agent',
    description: 'Ask the research agent to investigate the topic',
    inputSchema: z.object({ topic: z.string() }),
    outputSchema: z.object({ topic: z.string(), summary: z.string() }),
    execute: async ({ inputData }) => {
      stepStart(tracer, 'run-agent', { topic: inputData.topic });
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

  const useModel = resolveModel(input.model);
  const researcherAgent = new Agent({
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
  const runAgentStep = makeRunAgentStep(tracer, researcherAgent);
  const formatStep = makeFormatStep(tracer);

  const mastra = new Mastra({
    agents: { research: researcherAgent },
    workflows: {
      research: createWorkflow({
        id: 'research',
        inputSchema: z.object({ topic: z.string() }),
        outputSchema: z.object({ topic: z.string(), formatted: z.string() }),
      })
        .then(runAgentStep)
        .then(formatStep)
        .commit(),
    },
    logger,
  });

  const wf = mastra.getWorkflow('research');
  const run = await wf.createRun();
  const result = await run.start({ inputData: { topic: input.topic } });

  return finalizeRunResult(result, tracer, t0, input);
}

const demoTopics = ['Contextual Retrieval for RAG', 'hybrid search with BM25 and vector reranking'];

if (isMain(import.meta.url, process.argv[1])) {
  runCliExample('02-research-agent', async (silentTracer) => {
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
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
