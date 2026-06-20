/**
 * Example 11 — 3-Agent Content Pipeline (researcher → writer → editor)
 *
 * What it teaches:
 *   - The "pipeline" multi-agent pattern: 3 separate agents each running in
 *     their own step, communicating via the workflow's shared state.
 *   - Why this matters: each agent's system prompt is narrow and focused
 *     (researcher = fact-finder, writer = drafter, editor = quality gate).
 *   - The cost tradeoff: 3 LLM calls + orchestration ≈ 3× the latency of
 *     a single agent. Pay this when quality matters more than speed.
 *
 * Compare to:
 *   - Example 09 (multi-agent-handoff): 2 agents, primary + specialist,
 *     handoff via tool. Example 09 is "which agent handles this?".
 *     Example 11 is "all three handle this in sequence, each on a
 *     different aspect of the work."
 *   - Example 08 (critic-loop): same outcome (high-quality output) but
 *     one agent iterating with a critic. Example 11 is cheaper per
 *     call (3 distinct roles vs 1 role + 1 critic) but feedback isn't
 *     fed back to the writer — write-once, then polish.
 *
 * Shape:
 *   input: { topic, audience? }
 *     ↓
 *   research (LLM, structured: {facts[], sources[], angle})
 *     ↓
 *   write (LLM, reads research output, returns draft)
 *     ↓
 *   edit (LLM, reads draft, returns {edited, score, suggestions[], approved})
 *     ↓
 *   output: { topic, facts, sources, angle, draft, edited, score, ... }
 */

import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { Mastra } from '@mastra/core';
import { resolveModel, model, getModel } from '../../shared/llm.js';
import { logger } from '../../shared/mastra-logger.js';
import type { Tracer } from '../../shared/tracer.js';
import { stepStart, stepEnd, llmStructured, type StepSpec } from '../../shared/traced-step.js';
import { finalizeRunResult } from '../../shared/run-result.js';
import { isMain, runCliExample } from '../../shared/cli-bootstrap.js';

// Schemas (hoisted to module scope so the .extend() chain isn't inlined 4x)

const ResearchSchema = z.object({
  facts: z.array(z.string()).min(2).max(6),
  sources: z.array(z.string()).min(1).max(4),
  angle: z.string(),
});

const WithTopic = ResearchSchema.extend({ topic: z.string(), audience: z.string().optional() });
const WithDraft = WithTopic.extend({ draft: z.string() });
const WithEdit = WithDraft.extend({
  edited: z.string(),
  score: z.number(),
  suggestions: z.array(z.string()),
  approved: z.boolean(),
});

const EditSchema = z.object({
  edited: z.string(),
  score: z.number().min(0).max(10),
  suggestions: z.array(z.string()).min(1).max(5),
  approved: z.boolean(),
});

const STEPS: StepSpec[] = [
  { id: 'research', label: 'Researcher (facts + sources)', kind: 'llm' },
  { id: 'write', label: 'Writer (draft from research)', kind: 'llm' },
  { id: 'edit', label: 'Editor (polish + score)', kind: 'llm' },
];

// Step factories

function makeResearchStep(tracer: Tracer, agent: Agent) {
  return createStep({
    id: 'research',
    description: 'Researcher gathers 3-5 facts and identifies the lead angle',
    inputSchema: z.object({ topic: z.string(), audience: z.string().optional() }),
    outputSchema: WithTopic,
    execute: async ({ inputData }) => {
      const audience = inputData.audience ?? 'technical readers';
      stepStart(tracer, 'research', { topic: inputData.topic, audience });
      const prompt = `Topic: "${inputData.topic}". Audience: ${audience}. Produce a research brief.`;
      const result = await agent.generate(prompt, { structuredOutput: { schema: ResearchSchema } });
      const out = { topic: inputData.topic, audience, ...(result.object as z.infer<typeof ResearchSchema>) };
      llmStructured(tracer, 'research', 'ResearchSchema', out);
      stepEnd(tracer, 'research', out);
      return out;
    },
  });
}

function makeWriteStep(tracer: Tracer, agent: Agent) {
  return createStep({
    id: 'write',
    description: 'Writer drafts ~150 words from the research brief',
    inputSchema: WithTopic,
    outputSchema: WithDraft,
    execute: async ({ inputData }) => {
      const audience = inputData.audience ?? 'technical readers';
      stepStart(tracer, 'write', { topic: inputData.topic, facts: inputData.facts.length });
      const prompt = `Topic: "${inputData.topic}"\nAudience: ${audience}\nLead angle: ${inputData.angle}\n\nFacts:\n${inputData.facts.map((f, i) => `  ${i + 1}. ${f}`).join('\n')}\n\nSources:\n${inputData.sources.map((s, i) => `  [${i + 1}] ${s}`).join('\n')}\n\nWrite the article (~150 words).`;
      const result = await agent.generate(prompt);
      const draft = String(result.text).trim();
      const out = {
        topic: inputData.topic,
        audience,
        facts: inputData.facts,
        sources: inputData.sources,
        angle: inputData.angle,
        draft,
      };
      stepEnd(tracer, 'write', { topic: out.topic, draftLen: draft.length });
      return out;
    },
  });
}

function makeEditStep(tracer: Tracer, agent: Agent) {
  return createStep({
    id: 'edit',
    description: 'Editor polishes the draft and scores 0-10 with suggestions',
    inputSchema: WithDraft,
    outputSchema: WithEdit,
    execute: async ({ inputData }) => {
      stepStart(tracer, 'edit', { topic: inputData.topic, draftLen: inputData.draft.length });
      const prompt = `Topic: "${inputData.topic}"\n\nDraft:\n${inputData.draft}\n\nPolish and score.`;
      const result = await agent.generate(prompt, { structuredOutput: { schema: EditSchema } });
      const editResult = result.object as z.infer<typeof EditSchema>;
      const out = {
        topic: inputData.topic,
        audience: inputData.audience,
        facts: inputData.facts,
        sources: inputData.sources,
        angle: inputData.angle,
        draft: inputData.draft,
        edited: editResult.edited,
        score: editResult.score,
        suggestions: editResult.suggestions,
        approved: editResult.approved,
      };
      llmStructured(tracer, 'edit', 'EditSchema', editResult);
      stepEnd(tracer, 'edit', out);
      return out;
    },
  });
}

// Workflow factory

function makeWorkflow(tracer: Tracer, researcher: Agent, writer: Agent, editor: Agent) {
  return createWorkflow({
    id: 'content-pipeline',
    inputSchema: z.object({ topic: z.string(), audience: z.string().optional() }),
    outputSchema: WithEdit,
  })
    .then(makeResearchStep(tracer, researcher))
    .then(makeWriteStep(tracer, writer))
    .then(makeEditStep(tracer, editor))
    .commit();
}

// Public entrypoint

export interface RunOptions {
  topic: string;
  audience?: string;
  model?: string;
}

export async function runOne(input: RunOptions, tracer: Tracer) {
  const t0 = Date.now();
  tracer.emit({ type: 'start', workflow: 'content-pipeline', input, steps: STEPS });

  const useModel = resolveModel(input.model);
  const researcher = new Agent({
    id: 'researcher',
    name: 'Researcher',
    instructions: [
      'You are a researcher preparing a brief for a writer.',
      'Given a topic and target audience, produce:',
      '- 3-5 specific facts (verifiable claims, not opinions)',
      '- 1-4 source citations (you can invent plausible source names like arxiv.org/abs/... — they will be cited as if real)',
      '- ONE single most interesting angle to lead with',
      'Return JSON only matching the schema.',
    ].join('\n'),
    model: useModel,
  });
  const writer = new Agent({
    id: 'writer',
    name: 'Writer',
    instructions: [
      'You are a writer producing a concise ~150-word article for the given audience.',
      'Open with the lead angle the researcher identified.',
      'Weave in 3-5 facts from the brief (do not list them — they should be load-bearing claims).',
      'Cite 1-2 sources inline using markdown links [text](url).',
      'No headings, no bullet points — flowing prose.',
    ].join('\n'),
    model: useModel,
  });
  const editor = new Agent({
    id: 'editor',
    name: 'Editor',
    instructions: [
      'You are a strict editor polishing a draft for the given topic.',
      '- Fix grammar, tighten prose, remove redundancy.',
      '- Keep the same length (±15%). Do not add new facts.',
      '- Score the edited version 0-10 on: clarity, accuracy, completeness, voice.',
      '- approved = true if score >= 7, false otherwise.',
      '- suggestions: 1-3 specific improvements if approved=false.',
      'Return JSON: {edited, score, suggestions, approved}',
    ].join('\n'),
    model: useModel,
  });
  const mastra = new Mastra({
    agents: { researcher, writer, editor },
    workflows: { 'content-pipeline': makeWorkflow(tracer, researcher, writer, editor) },
    logger,
  });

  const wf = mastra.getWorkflow('content-pipeline');
  const run = await wf.createRun();
  const result = await run.start({
    inputData: { topic: input.topic, audience: input.audience ?? 'technical readers' },
  });

  return finalizeRunResult(result, tracer, t0, input);
}

const demoTopics = [
  'Why is prompt caching essential for production LLM APIs?',
  'How do I evaluate whether a small LLM is good enough for my use case?',
];

if (isMain(import.meta.url, process.argv[1])) {
  runCliExample('11-content-pipeline', async (silentTracer) => {
    for (const topic of demoTopics) {
      const r = await runOne({ topic, audience: 'technical readers' }, silentTracer);
      console.log(`\n— Content pipeline: "${topic}"`);
      if (r.status === 'success' && r.output) {
        const out = r.output as {
          research?: { angle?: string };
          draft?: string;
          edited?: string;
          score?: number;
          approved?: boolean;
          suggestions?: string[];
        };
        if (out.research?.angle) console.log(`  angle: ${out.research.angle}`);
        if (typeof out.score === 'number') console.log(`  score: ${out.score}/10  approved=${out.approved}`);
        if (out.draft && out.edited)
          console.log(`  draft (${out.draft.length} chars) → edited (${out.edited.length} chars)`);
        if (out.suggestions && !out.approved) console.log(`  suggestions: ${out.suggestions.join(' | ')}`);
        if (out.edited) console.log(`\n${out.edited}\n`);
      } else {
        console.log(`  workflow ${r.status}: ${r.error}`);
      }
    }
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
