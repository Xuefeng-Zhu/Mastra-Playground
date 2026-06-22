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
 *
 * SSE STREAMING NOTE (for the curious):
 *   The POST route returns a Web ReadableStream and the browser incrementally
 *   parses every SSE frame. The `setImmediate` yield below gives the route a
 *   chance to enqueue each delta before the next one arrives; without it a
 *   fast provider can make the result appear to snap into place.
 *
 *   Also note: the cloudflared quick-tunnel still buffers the response.
 *   For SSE through the public URL, use a named cloudflared tunnel or
 *   run the server locally.
 */

import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { Mastra } from '@mastra/core';
import { cancelRunOnSignal, type RunContext } from '../../shared/cancellable-run';
import { resolveModel, model, getModel, type LlmProvider } from '../../shared/llm';
import { logger } from '../../shared/mastra-logger';
import type { Tracer } from '../../shared/tracer';
import { startRun, stepStart, stepEnd, type StepSpec } from '../../shared/traced-step';
import { finalizeRunResult } from '../../shared/run-result';
import { isMain, runCliExample } from '../../shared/cli-bootstrap';

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
function makeWorkflow(tracer: Tracer, useModel: ReturnType<typeof getModel> = model) {
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
    execute: async ({ inputData, abortSignal }) => {
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
      const stream = await agent.stream(inputData.prompt, { abortSignal });

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

function buildMastra(tracer: Tracer, useModel: ReturnType<typeof getModel> = model) {
  return new Mastra({
    workflows: { 'streaming-chat': makeWorkflow(tracer, useModel) },
    logger,
  });
}

export interface RunOptions {
  prompt: string;
  provider?: LlmProvider;
  model?: string;
}

export async function runOne(input: RunOptions, tracer: Tracer, context?: RunContext) {
  const t0 = startRun(tracer, 'streaming-chat', input, STEPS);

  const useModel = resolveModel(input.model, input.provider, context?.customLlm);
  const mastra = buildMastra(tracer, useModel);
  const wf = mastra.getWorkflow('streaming-chat');
  const run = await wf.createRun();
  cancelRunOnSignal(run, context);
  const result = await run.start({ inputData: { prompt: input.prompt, model: input.model } });

  return finalizeRunResult(result, tracer, t0, input);
}

// ─── CLI demo ────────────────────────────────────────────────────────────
if (isMain(import.meta.url, process.argv[1])) {
  runCliExample(async (silentTracer) => {
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
  });
}
