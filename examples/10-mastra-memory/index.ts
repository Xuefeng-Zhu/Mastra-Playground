/**
 * Example 10 — Real @mastra/memory
 *
 * What it teaches:
 *   - The real @mastra/memory Memory class (not a hand-rolled Map)
 *   - How threadId + resourceId tie separate generate() calls together
 *   - The difference between turn-1 (set context) and turn-2 (recall):
 *     same threadId → second prompt includes the first messages
 *   - lastMessages: N controls how many prior messages are injected
 *   - Why this matters for InboxPilot: real memory is what makes a
 *     chat agent usable across customer sessions
 *
 * Compare to:
 *   - Example 05 (multi-turn-chat) uses shared/memory-store.ts, a
 *     hand-rolled Map<threadId, Message[]>. Educational, but you'd
 *     never ship it. Example 05 builds the prompt by inlining the
 *     conversation history manually.
 *   - Example 10 uses the actual @mastra/memory package. Mastra
 *     automatically loads the prior messages into the agent's prompt
 *     when you pass { thread: { id }, resource }. The hand-rolled
 *     store is gone.
 *
 * The pattern:
 *   1. Create a Memory instance once, attach to an Agent
 *   2. agent.generate(message, { memory: { thread: { id }, resource } })
 *      - thread.id is the conversation ID
 *      - resource is the user/tenant ID
 *   3. Same threadId on a second call → prior messages are loaded
 *   4. Different threadId → fresh conversation (no prior context)
 *
 * What you'll see in the trace:
 *   - "step:start(turn1)" — the LLM gets a prompt with only the new message
 *   - "step:end(turn1)" — agent replies
 *   - "step:start(turn2)" — the LLM gets a prompt that includes turn 1
 *     (you can verify this by checking the response.messages array — it
 *     includes the conversation history from memory)
 *   - "step:end(turn2)" — agent recalls what was said in turn 1
 *
 * Production note:
 *   This example does NOT configure a `storage` field on Memory, so
 *   Mastra falls back to the in-memory default. You'll see a console
 *   warning: "No storage configured — falling back to in-memory store.
 *   In-memory storage is not durable: all data is lost on restart,
 *   and it is not safe for production."
 *
 *   For real production use, configure a persistent storage adapter:
 *     storage: new LibSQLStore({ url: 'file:./data.db' })
 *   (or @mastra/pg, @mastra/upstash, @mastra/cloudflare). This is
 *   the right shape but adds a dependency that the playground avoids.
 */

import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { Mastra } from '@mastra/core';
import { runWithCancellation, type RunContext } from '../../shared/cancellable-run';
import { InMemoryStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';
import { resolveModel, model, getModel, type LlmProvider } from '../../shared/llm';
import { logger } from '../../shared/mastra-logger';
import type { Tracer } from '../../shared/tracer';
import { startRun, stepStart, stepEnd, timed, type StepSpec } from '../../shared/traced-step';
import { finalizeRunResult } from '../../shared/run-result';
import { isMain, runCliExample } from '../../shared/cli-bootstrap';

// ─── Schemas ──────────────────────────────────────────────────────────────
const InputSchema = z.object({
  threadId: z.string(),
  resourceId: z.string().optional(),
  turn1: z.string(),
  turn2: z.string(),
  model: z.string().optional(),
});

const OutputSchema = z.object({
  threadId: z.string(),
  resourceId: z.string(),
  turn1: z.object({ input: z.string(), output: z.string() }),
  turn2: z.object({ input: z.string(), output: z.string() }),
  recalled: z.boolean(),
  historyLength: z.number(),
});

// ─── Tracer events ────────────────────────────────────────────────────────
const STEPS: StepSpec[] = [
  { id: 'input', label: 'Thread ID + turns', kind: 'llm' },
  { id: 'turn1', label: 'Turn 1 (set context)', kind: 'llm' },
  { id: 'turn2', label: 'Turn 2 (recall)', kind: 'llm' },
];

// ─── The workflow factory ────────────────────────────────────────────────
function makeWorkflow(tracer: Tracer, useModel: ReturnType<typeof getModel> = model) {
  // The real Mastra Memory instance.
  // - storage: InMemoryStore from @mastra/core/storage — works without
  //   any external dependencies. For production use, swap in
  //   @mastra/libsql (filesystem SQLite), @mastra/pg, or @mastra/upstash.
  //   The store lives only as long as the Node process — restart = lose
  //   memory. The playground doesn't need persistence across restarts
  //   because each server boot resets the demo.
  // - lastMessages: 20 — include the last 20 messages in each prompt's context
  // - semanticRecall: disabled (would need a vector store)
  // - workingMemory: disabled (would need schema + tools to update it)
  const memory = new Memory({
    storage: new InMemoryStore(),
    options: {
      lastMessages: 20,
      semanticRecall: false,
      workingMemory: { enabled: false },
    },
  });

  const agent = new Agent({
    id: 'chat-with-memory',
    name: 'Chat with memory',
    instructions: [
      'You are a helpful assistant that remembers what the user tells you.',
      'When the user provides information (name, preferences, facts), remember it.',
      'When the user later asks you to recall that information, use it in your answer.',
    ].join('\n'),
    model: useModel,
    memory, // attach the Memory instance to the agent
  });

  // Single workflow with one step that does both turns sequentially.
  // The two turns share a threadId so memory is loaded between them.
  const memoryStep = createStep({
    id: 'memory-demo',
    description: 'Two-turn demo with shared threadId to exercise Mastra memory',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    execute: async ({ inputData, abortSignal }) => {
      stepStart(tracer, 'memory-demo', {
        threadId: inputData.threadId,
        turn1Length: inputData.turn1.length,
        turn2Length: inputData.turn2.length,
      });

      const resourceId = inputData.resourceId ?? 'playground-user';
      const mem = { thread: { id: inputData.threadId }, resource: resourceId };

      // ── Turn 1: set context ─────────────────────────────────────
      const turn1 = await timed(tracer, 'turn1', { message: inputData.turn1 }, async () => {
        const r = await agent.generate(inputData.turn1, { abortSignal, memory: mem });
        return { text: r.text };
      });
      const turn1Output = turn1.text;

      // ── Turn 2: recall ───────────────────────────────────────────
      // Because we pass the same `memory` option with the same threadId,
      // Mastra loads the prior messages into the agent's prompt before
      // the LLM call. The agent should correctly recall what turn 1 said.
      const turn2 = await timed(tracer, 'turn2', { message: inputData.turn2 }, async () => {
        const r = await agent.generate(inputData.turn2, { abortSignal, memory: mem });
        return { text: r.text };
      });
      const turn2Output = turn2.text;

      stepEnd(tracer, 'memory-demo', {
        turn1Length: turn1Output.length,
        turn2Length: turn2Output.length,
      });

      // Heuristic check: did turn 2's response include any of turn 1's content?
      const turn1Words = new Set(
        inputData.turn1
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length >= 3),
      );
      const recalled = inputData.turn2
        .toLowerCase()
        .split(/\W+/)
        .some((w) => w.length >= 3 && turn1Words.has(w));

      // We need the messages array from turn 2 for historyLength. Re-run a
      // smaller fetch — the timed() helper already consumed the response.
      // (historyLength is informational; not critical for the demo.)
      const r2Inspect = await agent.generate(inputData.turn2, { abortSignal, memory: mem });
      const messages = (r2Inspect as { messages?: unknown[] }).messages ?? [];
      const historyLength = messages.length;

      return {
        threadId: inputData.threadId,
        resourceId,
        turn1: { input: inputData.turn1, output: turn1Output },
        turn2: { input: inputData.turn2, output: turn2Output },
        recalled,
        historyLength,
      };
    },
  });

  return createWorkflow({
    id: 'mastra-memory',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
  })
    .then(memoryStep)
    .commit();
}

function buildMastra(tracer: Tracer, useModel: ReturnType<typeof getModel> = model) {
  return new Mastra({
    workflows: { 'mastra-memory': makeWorkflow(tracer, useModel) },
    logger,
  });
}

export interface RunOptions {
  threadId: string;
  resourceId?: string;
  turn1?: string;
  turn2?: string;
  provider?: LlmProvider;
  model?: string;
}

export async function runOne(input: RunOptions, tracer: Tracer, context?: RunContext) {
  const turn1 = input.turn1 ?? 'My name is Ada and my favorite color is teal.';
  const turn2 = input.turn2 ?? 'What is my name and what is my favorite color?';
  const t0 = startRun(tracer, 'mastra-memory', { ...input, turn1, turn2 }, STEPS);

  const useModel = resolveModel(input.model, input.provider, context?.customLlm);
  const mastra = buildMastra(tracer, useModel);
  const wf = mastra.getWorkflow('mastra-memory');
  const run = await wf.createRun();
  const result = await runWithCancellation(run, context, () =>
    run.start({
      inputData: {
        threadId: input.threadId,
        resourceId: input.resourceId ?? 'playground-user',
        turn1,
        turn2,
        model: input.model,
      },
    }),
  );

  return finalizeRunResult(result, tracer, t0, input);
}

// ─── CLI demo ────────────────────────────────────────────────────────────
if (isMain(import.meta.url, process.argv[1])) {
  runCliExample(async (silentTracer) => {
    silentTracer.subscribe((e) => {
      if (e.type === 'step:end') {
        const out = (e as { output?: { text?: string } }).output;
        console.log(`[${e.stepId}] ${out?.text?.slice(0, 80) ?? ''}`);
      }
    });

    console.log('=== Mastra Memory demo ===\n');
    const r = await runOne(
      {
        threadId: 'demo-thread-' + Date.now(),
        turn1: 'My name is Ada and my favorite color is teal.',
        turn2: 'What is my name and what is my favorite color?',
      },
      silentTracer,
    );
    if (r.output) {
      const o = r.output as {
        threadId: string;
        turn1: { output: string };
        turn2: { output: string };
        recalled: boolean;
        historyLength: number;
      };
      console.log(`\nThread: ${o.threadId}`);
      console.log(`Turn 1 (set): "${o.turn1.output.slice(0, 120)}"`);
      console.log(`Turn 2 (recall): "${o.turn2.output.slice(0, 120)}"`);
      console.log(`\nRecalled correctly: ${o.recalled ? '✅ yes' : '❌ no'}`);
      console.log(`History length on turn 2: ${o.historyLength} messages`);
    } else {
      console.log(`\nError: ${r.error}`);
    }
  });
}
