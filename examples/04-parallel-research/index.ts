/**
 * Example 04 — Parallel Research (with tracing)
 *
 * What it teaches:
 *   - A single step can fan out to multiple sub-tasks in parallel using
 *     `Promise.all` inside its execute function. The workflow sees one step
 *     with one start/end event; the parallel work is hidden inside.
 *   - This is the exact pattern InboxPilot §8 ("tool use") would use: the
 *     LLM gets a list of tools, fires them in parallel, and aggregates.
 *   - Compare to Example 02 (Research): there, the agent picks ONE tool
 *     call at a time and the framework sees each one. Here, we hand-roll
 *     the parallelism inside one step. The trace UI will show ONE step:start
 *     followed by 3 tool:call events emitted in quick succession, then a
 *     single step:end.
 *
 * Shape:
 *   input: topic
 *     ↓
 *   plan:   LLM decomposes topic into 3 sub-questions  (LLM step)
 *     ↓
 *   fanout: 3 sub-tasks in parallel: web + arxiv + wiki   (parallel step)
 *     ↓
 *   synthesize: LLM combines the 3 sources into one answer (LLM step)
 *
 * Run: npm run example:04
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
  stepStart,
  stepEnd,
  llmStructured,
  toolCall,
  timed,
  type StepSpec,
  startRun,
} from '../../shared/traced-step';
import { finalizeRunResult } from '../../shared/run-result';
import { isMain, runCliExample } from '../../shared/cli-bootstrap';
import { webSearch } from '../02-research-agent/tools/web-search';
import { arxivSearch } from '../02-research-agent/tools/arxiv';
import { wikiDirect } from './tools/wiki';

// ─── Two agents: one for planning, one for synthesis ──────────────────────
// These are built per-request inside runOne() with the model specified by the request.

const STEPS: StepSpec[] = [
  { id: 'plan', label: 'Plan (LLM)', kind: 'llm' },
  { id: 'fanout', label: 'Parallel fetch (web + arxiv + wiki)', kind: 'tool' },
  { id: 'synthesize', label: 'Synthesize (LLM)', kind: 'llm' },
];

const WebResultSchema = z.object({ title: z.string(), url: z.string(), snippet: z.string() });
const ArxivPaperSchema = z.object({
  title: z.string(),
  authors: z.array(z.string()),
  abstract: z.string(),
  url: z.string(),
});
type WebResult = z.infer<typeof WebResultSchema>;
type ArxivPaper = z.infer<typeof ArxivPaperSchema>;

function makePlanStep(tracer: Tracer, agent: Agent) {
  return createStep({
    id: 'plan',
    description: 'Decompose the topic into 3 sub-questions',
    inputSchema: z.object({ topic: z.string() }),
    outputSchema: z.object({ topic: z.string(), subQuestions: z.array(z.string()).length(3) }),
    execute: async ({ inputData, abortSignal }) => {
      stepStart(tracer, 'plan', { topic: inputData.topic });
      const prompt = `Decompose this research topic into 3 distinct sub-questions (web angle, academic angle, internal-wiki angle): "${inputData.topic}". Return JSON only with shape {"questions": [string, string, string]}.`;
      const result = await agent.generate(prompt, {
        abortSignal,
        structuredOutput: {
          schema: z.object({ questions: z.array(z.string()).length(3) }),
        },
      });
      const questions = (result.object as { questions: string[] }).questions;
      const out = { topic: inputData.topic, subQuestions: questions };
      llmStructured(tracer, 'plan', 'PlanSchema', out);
      stepEnd(tracer, 'plan', out);
      return out;
    },
  });
}

function makeFanoutStep(tracer: Tracer) {
  return createStep({
    id: 'fanout',
    description: 'Fetch web, arxiv, and wiki in parallel',
    inputSchema: z.object({ topic: z.string(), subQuestions: z.array(z.string()).length(3) }),
    outputSchema: z.object({
      topic: z.string(),
      sources: z.object({
        web: z.object({ query: z.string(), results: z.array(WebResultSchema) }),
        arxiv: z.object({ query: z.string(), papers: z.array(ArxivPaperSchema) }),
        wiki: z.object({ topic: z.string(), summary: z.string(), references: z.array(z.string()) }),
      }),
    }),
    execute: async ({ inputData }) => {
      return timed(
        tracer,
        'fanout',
        { topic: inputData.topic, subQuestions: inputData.subQuestions },
        async () => {
          // Fan out: 3 sub-tasks in parallel
          const [webResults, arxivResults, wikiResult] = await Promise.all([
            (webSearch.execute as unknown as (input: { query: string }) => Promise<{ results: WebResult[] }>)(
              {
                query: inputData.subQuestions[0],
              },
            ).then((r) => {
              toolCall(tracer, 'fanout', 'web-search', { query: inputData.subQuestions[0] }, r);
              return r;
            }),
            (
              arxivSearch.execute as unknown as (input: {
                query: string;
              }) => Promise<{ papers: ArxivPaper[] }>
            )({
              query: inputData.subQuestions[1],
            }).then((r) => {
              toolCall(tracer, 'fanout', 'arxiv-search', { query: inputData.subQuestions[1] }, r);
              return r;
            }),
            wikiDirect(inputData.subQuestions[2]).then((r) => {
              toolCall(tracer, 'fanout', 'wiki', { topic: inputData.subQuestions[2] }, r);
              return r;
            }),
          ]);

          return {
            topic: inputData.topic,
            sources: {
              web: {
                query: inputData.subQuestions[0],
                results: webResults.results,
              },
              arxiv: {
                query: inputData.subQuestions[1],
                papers: arxivResults.papers,
              },
              wiki: wikiResult,
            },
          };
        },
      );
    },
  });
}

function makeSynthesizeStep(tracer: Tracer, agent: Agent) {
  return createStep({
    id: 'synthesize',
    description: 'LLM combines the 3 sources into one summary',
    inputSchema: z.object({
      topic: z.string(),
      sources: z.object({
        web: z.object({ query: z.string(), results: z.array(WebResultSchema) }),
        arxiv: z.object({ query: z.string(), papers: z.array(ArxivPaperSchema) }),
        wiki: z.object({ topic: z.string(), summary: z.string(), references: z.array(z.string()) }),
      }),
    }),
    outputSchema: z.object({
      topic: z.string(),
      synthesis: z.string(),
    }),
    execute: async ({ inputData, abortSignal }) => {
      stepStart(tracer, 'synthesize', { topic: inputData.topic });
      const wikiRefs = inputData.sources.wiki.references.join('\n');
      const prompt = `Topic: ${inputData.topic}

Web (${inputData.sources.web.query}):
${inputData.sources.web.results.map((r) => `- ${r.title}: ${r.snippet}`).join('\n')}

Arxiv (${inputData.sources.arxiv.query}):
${inputData.sources.arxiv.papers.map((p) => `- ${p.title}: ${p.abstract}`).join('\n')}

Internal wiki (${inputData.sources.wiki.topic}):
${inputData.sources.wiki.summary}
References: ${wikiRefs}

Write a unified 200-word synthesis.`;
      const result = await agent.generate(prompt, { abortSignal });
      const out = { topic: inputData.topic, synthesis: String(result.text) };
      llmStructured(tracer, 'synthesize', 'SynthesisResult', out);
      stepEnd(tracer, 'synthesize', out);
      return out;
    },
  });
}

function makeWorkflow(tracer: Tracer, plannerAgent: Agent, synthesizerAgent: Agent) {
  return createWorkflow({
    id: 'parallel-research',
    inputSchema: z.object({ topic: z.string() }),
    outputSchema: z.object({ topic: z.string(), synthesis: z.string() }),
  })
    .then(makePlanStep(tracer, plannerAgent))
    .then(makeFanoutStep(tracer))
    .then(makeSynthesizeStep(tracer, synthesizerAgent))
    .commit();
}

export interface RunOptions {
  topic: string;
  provider?: LlmProvider;
  model?: string;
}

export async function runOne(input: RunOptions, tracer: Tracer, context?: RunContext) {
  const t0 = startRun(tracer, 'parallel-research', input, STEPS);

  const useModel = resolveModel(input.model, input.provider, context?.llmConfig);
  const plannerAgent = new Agent({
    id: 'parallel-planner',
    name: 'Parallel Planner',
    instructions: [
      'Given a research topic, decompose it into 3 distinct sub-questions.',
      'The 3 sub-questions should cover: a public/web angle, an academic angle,',
      'and an internal/background angle. Return JSON: {"questions": ["q1", "q2", "q3"]}.',
    ].join('\n'),
    model: useModel,
  });
  const synthesizerAgent = new Agent({
    id: 'parallel-synthesizer',
    name: 'Parallel Synthesizer',
    instructions: [
      'You are a research synthesizer.',
      'Given 3 sources (web, arxiv, wiki) each answering a sub-question of the same topic,',
      'write a concise unified summary that integrates all three. Under 200 words.',
    ].join('\n'),
    model: useModel,
  });
  const mastra = new Mastra({
    agents: { planner: plannerAgent, synthesizer: synthesizerAgent },
    workflows: {
      'parallel-research': makeWorkflow(tracer, plannerAgent, synthesizerAgent),
    },
    logger,
  });

  const wf = mastra.getWorkflow('parallel-research');
  const run = await wf.createRun();
  const result = await runWithCancellation(run, context, () =>
    run.start({ inputData: { topic: input.topic } }),
  );

  return finalizeRunResult(result, tracer, t0, input);
}

const demoTopics = ['hybrid search with BM25', 'prompt caching in LLM APIs'];

if (isMain(import.meta.url, process.argv[1])) {
  runCliExample(async (silentTracer) => {
    for (const topic of demoTopics) {
      const r = await runOne({ topic }, silentTracer);
      console.log(`\n— Parallel research: "${topic}"`);
      if (r.status === 'success' && r.output) {
        const out = r.output as { synthesis: string };
        console.log(`\n${out.synthesis}\n`);
      } else {
        console.log(`  workflow ${r.status}: ${r.error}`);
      }
    }
  });
}
