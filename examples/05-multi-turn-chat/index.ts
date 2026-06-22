/**
 * Example 05 — Multi-turn Chat with Conversation History
 *
 * What it teaches:
 *   - How to pass conversation history to an LLM call (the same pattern
 *     Mastra's Memory does internally, but explicit and inspectable).
 *   - How a write-action tool (escalate_to_human) mutates persistent state.
 *   - How to detect an escalated thread and surface it in the response.
 *
 * Compare to InboxPilot's AiAgentService:
 *   InboxPilot:                            This example:
 *   ──────────────                          ──────────────
 *   loadSettings()                          (no settings — example is hardcoded)
 *   loadConversationHistory()              memoryStore.getMessages(threadId)
 *   getKnowledgeChunks()                    (omitted — would be a tool)
 *   pre-LLM escalation chain                (omitted — see ex 01)
 *   LLM call with full history              agent.generate(messages, ...)
 *   parse JSON decision                    (omitted — this example uses free-form text)
 *   mode-gate by confidence                 (omitted)
 *   audit log                              tracer.emit(...)
 *   persist assistant message              memoryStore.appendAssistantMessage(...)
 *
 *   The key learning: conversation context is *just a list of messages*
 *   passed to the LLM. The Memory abstraction in Mastra adds persistence,
 *   retrieval (vector search over history), and per-thread isolation on
 *   top of that. But under the hood, it's: get the messages, prepend
 *   them to the prompt, send the new one, append the response.
 *
 * Run: npm run example:05
 */

import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { Mastra } from '@mastra/core';
import { cancelRunOnSignal, type RunContext } from '../../shared/cancellable-run';
import { resolveModel, model } from '../../shared/llm';
import { logger } from '../../shared/mastra-logger';
import { memoryStore, type Message } from '../../shared/memory-store';
import type { Tracer } from '../../shared/tracer';
import { startRun, toolCall, timed, type StepSpec } from '../../shared/traced-step';
import { finalizeRunResult } from '../../shared/run-result';
import { isMain, runCliExample } from '../../shared/cli-bootstrap';
import { escalate } from './tools/escalate';
import { lookupOrder } from './tools/lookup_order';

const STEPS: StepSpec[] = [{ id: 'chat', label: 'Chat (LLM + memory)', kind: 'llm' }];

// ─── Build the agent with per-request model ───────────────────────────
function makeAgent(useModel = model) {
  return new Agent({
    id: 'multi-turn-chat',
    name: 'Multi-turn Chat',
    instructions: [
      'You are a friendly, empathetic customer support agent.',
      'You have access to the full conversation history. Use it to answer follow-up questions naturally.',
      'If the user mentions an order, use the lookup_order tool to get its status.',
      'If the user is upset, asks for a manager, or the issue is too complex, use the escalate_to_human tool.',
      'After escalating, acknowledge it and tell the user a human will follow up shortly.',
      'Keep responses under 80 words. Be conversational, not robotic.',
    ].join('\n'),
    model: useModel,
    tools: { escalate, lookupOrder },
  });
}

function makeWorkflow(tracer: Tracer, useModel = model) {
  const agent = makeAgent(useModel);
  return createWorkflow({
    id: 'multi-turn-chat',
    inputSchema: z.object({
      threadId: z.string(),
      resourceId: z.string(),
      message: z.string(),
    }),
    outputSchema: z.object({
      threadId: z.string(),
      escalated: z.boolean(),
      escalationReason: z.string().nullable(),
      newUserMessage: z.object({ role: z.literal('user'), content: z.string(), ts: z.number() }),
      newAssistantMessage: z.object({ role: z.literal('assistant'), content: z.string(), ts: z.number() }),
      allMessages: z.array(z.object({ role: z.string(), content: z.string(), ts: z.number() })),
    }),
  })
    .then(
      createStep({
        id: 'chat',
        description: 'Process one turn of conversation',
        inputSchema: z.object({
          threadId: z.string(),
          resourceId: z.string(),
          message: z.string(),
        }),
        outputSchema: z.object({
          threadId: z.string(),
          escalated: z.boolean(),
          escalationReason: z.string().nullable(),
          newUserMessage: z.object({ role: z.string(), content: z.string(), ts: z.number() }),
          newAssistantMessage: z.object({ role: z.string(), content: z.string(), ts: z.number() }),
          allMessages: z.array(z.object({ role: z.string(), content: z.string(), ts: z.number() })),
        }),
        execute: async ({ inputData, abortSignal }) => {
          return timed(
            tracer,
            'chat',
            { threadId: inputData.threadId, messageLength: inputData.message.length },
            async () => {
              // 1. Load conversation history (Mastra's Memory would do this;
              //    we do it explicitly for transparency)
              const history = memoryStore.getMessages(inputData.threadId);

              // 2. Append the new user message
              const userMsg = memoryStore.appendUserMessage(inputData.threadId, inputData.message);

              // 3. Build a single prompt that includes the full conversation history.
              const transcriptLines = history
                .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
                .join('\n');
              const prompt = transcriptLines
                ? `Here is the conversation so far:\n\n${transcriptLines}\n\nUser: ${inputData.message}\n\nRespond to the latest user message. Be conversational. Keep it under 80 words.`
                : inputData.message;

              // 4. Call the agent with the assembled prompt
              const result = await agent.generate(prompt, { abortSignal });

              // 5. Append the assistant response
              const assistantContent = String(result.text);
              const assistantMsg = memoryStore.appendAssistantMessage(inputData.threadId, assistantContent);

              // 6. Check if the agent called escalate_to_human — the escalate tool
              // marks the thread via memoryStore.markEscalated when called.
              // We detect that by checking state after the call.
              const escalated = memoryStore.isEscalated(inputData.threadId);
              const state = memoryStore.getOrCreate(inputData.threadId);
              const escalationReason = escalated ? (state.escalationReason ?? null) : null;

              // Emit a tool:call event if escalation happened (visual signal in the trace)
              if (escalated) {
                toolCall(
                  tracer,
                  'chat',
                  'escalate_to_human',
                  { threadId: inputData.threadId, reason: escalationReason },
                  { escalated: true, reason: escalationReason },
                );
              }

              return {
                threadId: inputData.threadId,
                escalated,
                escalationReason,
                newUserMessage: userMsg,
                newAssistantMessage: assistantMsg,
                allMessages: memoryStore.getMessages(inputData.threadId),
              };
            },
          );
        },
      }),
    )
    .commit();
}

export interface RunOptions {
  threadId: string;
  resourceId: string;
  message: string;
  action?: 'new' | 'clear' | 'send'; // 'new' generates a new threadId, 'clear' wipes, 'send' (default) processes
  model?: string;
}

export async function runOne(input: RunOptions, tracer: Tracer, context?: RunContext) {
  const t0 = startRun(tracer, 'multi-turn-chat', input, STEPS);

  // Action: 'new' returns a fresh threadId; 'clear' wipes an existing thread
  if (input.action === 'new') {
    const newThreadId = `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    memoryStore.getOrCreate(newThreadId); // initialize
    const out = {
      action: 'new' as const,
      threadId: newThreadId,
      resourceId: input.resourceId,
      messages: [] as Message[],
      escalated: false,
    };
    return finalizeRunResult({ status: 'success', result: out }, tracer, t0, input);
  }

  if (input.action === 'clear') {
    memoryStore.clearMessages(input.threadId);
    const out = {
      action: 'clear' as const,
      threadId: input.threadId,
      resourceId: input.resourceId,
      messages: [] as Message[],
      escalated: false,
    };
    return finalizeRunResult({ status: 'success', result: out }, tracer, t0, input);
  }

  // Default: process one turn of the conversation
  const useModel = resolveModel(input.model);
  const mastra = new Mastra({
    agents: { 'multi-turn-chat': makeAgent(useModel) },
    workflows: { 'multi-turn-chat': makeWorkflow(tracer, useModel) },
    logger,
  });

  const wf = mastra.getWorkflow('multi-turn-chat');
  const run = await wf.createRun();
  cancelRunOnSignal(run, context);
  const result = await run.start({
    inputData: { threadId: input.threadId, resourceId: input.resourceId, message: input.message },
  });

  return finalizeRunResult(result, tracer, t0, input);
}

// ─── CLI demo ────────────────────────────────────────────────────────────
if (isMain(import.meta.url, process.argv[1])) {
  runCliExample(async (silentTracer) => {
    const threadId = `thread-cli-${Date.now()}`;
    const resourceId = 'cli-user';

    console.log('=== Multi-turn chat demo ===\n');
    for (const message of [
      'Hi, I want to check the status of order 12345',
      'When will it arrive?',
      'Actually, I am really upset. I want a refund. Get me a manager.',
    ]) {
      const r = await runOne({ threadId, resourceId, message }, silentTracer);
      const out = r.output as { escalated?: boolean; newAssistantMessage?: Message } | null;
      if (r.status === 'success' && out && out.newAssistantMessage) {
        console.log(`USER: ${message}`);
        console.log(`AGENT: ${out.newAssistantMessage.content}`);
        console.log(`[escalated: ${out.escalated ?? false}]\n`);
      } else {
        console.log(`  workflow ${r.status}: ${r.error ?? 'no output'}`);
      }
    }
  });
}
