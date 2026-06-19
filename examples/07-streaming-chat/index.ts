/**
 * Example 07 — Streaming tokens with `Agent.stream()`
 *
 * What it teaches:
 *   - How to call `agent.stream({ prompt })` and consume the async iterable
 *   - The `llm:delta` trace event type for each token
 *   - The streaming UI pattern: typing cursor that fills in as tokens arrive
 *   - Why streaming matters for UX (perceived latency drops from 2-3s to <500ms)
 *
 * Compare to:
 *   - Example 01 (support triage) uses `agent.generate()` — waits for the full
 *     response before returning. The UI is "waiting..." for 2-3s.
 *   - Example 07 streams the response — UI shows tokens arriving live.
 *
 *   For InboxPilot, this is the difference between "the bot is thinking" and
 *   "the bot is responding."
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

// ─── Schemas ──────────────────────────────────────────────────────────────
const InputSchema = z.object({
  prompt: z.string(),
  model: z.string().optional(),
});

const OutputSchema = z.object({
  prompt: z.string(),
  deltas: z.array(z.string()), // each token/chunk
  finalText: z.string(),
  model: z.string().optional(),
  durationMs: z.number(),
});

// ─── Tracer events emitted ──────────────────────────────────────────────
const STEPS: StepSpec[] = [
  { id: 'input', label: 'Prompt', kind: 'llm' },
  { id: 'stream', label: 'Stream (LLM)', kind: 'llm' },
];

// ─── Make the workflow factory ────────────────────────────────────────────
function makeWorkflow(tracer: Tracer, useModel: ReturnType<typeof getModel> = defaultModel) {
  const agent = new Agent({
    id: 'streaming-chat',
    name: 'Streaming Chat',
    instructions: [
      'You are a concise assistant. Answer in 1-3 short sentences.',
      'Do not use bullet points, JSON, or markdown — plain text only.',
    ].join('\n'),
    model: useModel,
  });

  const streamStep = createStep({
    id: 'stream',
    description: 'Stream LLM response token-by-token',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    execute: async ({ inputData }) => {
      const t0 = Date.now();
      stepStart(tracer, 'stream', { promptLength: inputData.prompt.length, model: inputData.model });

      // Emit the "stream starting" event before the first token
      tracer.emit({ type: 'llm:start', stepId: 'stream', model: inputData.model });

      const deltas: string[] = [];
      let finalText = '';
      let index = 0;

      // The streaming API returns an async iterable of text chunks.
      // Each chunk may be one token or several — Mastra's Agent.stream
      // batches them at natural boundaries (whitespace, punctuation).
      const stream = await agent.stream(inputData.prompt);

      for await (const chunk of stream.textStream) {
        deltas.push(chunk);
        finalText += chunk;
        // Emit one llm:delta event per chunk. The UI uses these to fill
        // the typing indicator in real time.
        tracer.emit({ type: 'llm:delta', stepId: 'stream', text: chunk, index });
        index++;
        // Yield to the event loop so the SSE server can flush the TCP segment
        // for this chunk before the next one arrives. Without this, a fast
        // LLM emits all chunks within a single tick, all writes coalesce into
        // one TCP segment, and the browser sees them as a single batch.
        await new Promise<void>((resolve) => setImmediate(resolve));
      }

      const durationMs = Date.now() - t0;

      tracer.emit({
        type: 'llm:end',
        stepId: 'stream',
        totalChars: finalText.length,
        durationMs,
      });
      stepEnd(tracer, 'stream', { deltaCount: deltas.length, totalChars: finalText.length, durationMs });

      return {
        prompt: inputData.prompt,
        deltas,
        finalText,
        model: inputData.model,
        durationMs,
      };
    },
  });

  return createWorkflow({
    id: 'streaming-chat',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
  })
    .then(streamStep)
    .commit();
}

function buildMastra(tracer: Tracer, useModel: ReturnType<typeof getModel> = defaultModel) {
  return new Mastra({
    workflows: { 'streaming-chat': makeWorkflow(tracer, useModel) },
    logger,
  });
}

export interface RunOptions {
  prompt: string;
  model?: string;
}

export async function runOne(input: RunOptions, tracer: Tracer) {
  const t0 = Date.now();
  tracer.emit({ type: 'start', workflow: 'streaming-chat', input, steps: STEPS });

  const useModel = input.model ? getModel(input.model) : defaultModel;
  const mastra = buildMastra(tracer, useModel);
  const wf = mastra.getWorkflow('streaming-chat');
  const run = await wf.createRun();
  const result = await run.start({ inputData: { prompt: input.prompt, model: input.model } });

  const output = result.status === 'success' ? unwrapWorkflowOutput(result.result) : null;
  const errMsg = result.status !== 'success' ? (JSON.stringify(result) ?? String(result)) : null;
  const doneStatus =
    result.status === 'success' || result.status === 'failed' || result.status === 'suspended'
      ? result.status
      : ('failed' as const);
  tracer.emit({ type: 'done', status: doneStatus, output, totalMs: Date.now() - t0 });

  return { status: result.status, input, output, error: errMsg };
}

// ─── CLI demo ────────────────────────────────────────────────────────────
async function main() {
  const { Tracer } = await import('../../shared/tracer.js');
  const silentTracer = new Tracer();
  silentTracer.subscribe((e) => {
    if (e.type === 'llm:delta') {
      process.stdout.write(e.text);
    } else if (e.type === 'llm:end') {
      console.log(`\n[streamed in ${(e as { durationMs: number }).durationMs}ms]`);
    }
  });

  console.log('=== Streaming chat demo ===\n');
  const r = await runOne({ prompt: 'Explain server-sent events in one paragraph.' }, silentTracer);
  if (r.status === 'success' && r.output) {
    const out = r.output as { finalText: string; durationMs: number; deltas: string[] };
    console.log(
      `\n\nFinal: ${out.finalText.length} chars in ${out.deltas.length} deltas (${out.durationMs}ms)`,
    );
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
