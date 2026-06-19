/**
 * Example 09 — Multi-agent handoff (delegate pattern)
 *
 * What it teaches:
 *   - Two agents with different roles (primary + specialist)
 *   - The "delegate" handoff pattern: primary agent has a tool that
 *     synchronously invokes a specialist agent and returns its response
 *   - Why this matters for InboxPilot: a single support agent with
 *     many specialized tools degrades in quality. A primary agent
 *     that delegates to specialists (billing, technical, escalation)
 *     keeps each agent's context narrow and prompt focused.
 *
 * Compare to:
 *   - Example 01 (support-triage): ONE agent with a structured-output branch.
 *     For "what category is this?" — fine. For "answer this billing question" —
 *     the agent's prompt is too generic and the tools compete for context.
 *   - Example 09: primary agent decides whether to delegate. When it delegates,
 *     only the specialist's prompt + tools run. Context stays focused.
 *
 * The handoff pattern in this example:
 *   1. User asks "where's my refund?"
 *   2. Primary agent decides this is billing. Calls transfer_to_billing_specialist.
 *   3. The tool calls the billing specialist agent synchronously with the user's question.
 *   4. Specialist answers (uses lookup_refund tool, returns status).
 *   5. Tool returns the specialist's response as a string.
 *   6. Primary agent relays the response to the user.
 *
 * What you'll see in the trace:
 *   - "agent:triage" fires when the primary agent is called
 *   - "tool:call" for transfer_to_billing_specialist with the user's question as input
 *   - "agent:specialist" fires when the specialist is called (nested)
 *   - "tool:call" for lookup_refund from inside the specialist
 *   - the tool's output is the specialist's text response, which the primary relays
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
  message: z.string(),
  model: z.string().optional(),
});

const OutputSchema = z.object({
  message: z.string(),
  agentPath: z.array(z.string()), // which agents handled the message, in order
  delegated: z.boolean(),
  specialistResponse: z.string().optional(),
});

// ─── Mocked data ──────────────────────────────────────────────────────────
const REFUNDS: Record<string, { amount: number; status: string; daysAgo: number }> = {
  'order-1234': { amount: 49.99, status: 'processed', daysAgo: 2 },
  'order-5678': { amount: 129.5, status: 'pending', daysAgo: 5 },
  'order-9999': { amount: 9.99, status: 'not_found', daysAgo: 0 },
};

// ─── Tracer events ────────────────────────────────────────────────────────
const STEPS: StepSpec[] = [
  { id: 'input', label: 'Customer message', kind: 'llm' },
  { id: 'primary', label: 'Triage agent', kind: 'llm' },
  { id: 'specialist', label: 'Billing specialist', kind: 'llm' },
];

// ─── The workflow factory ────────────────────────────────────────────────
function makeWorkflow(tracer: Tracer, useModel: ReturnType<typeof getModel> = defaultModel) {
  // The specialist agent: focused prompt, narrow tool set.
  const billingSpecialist = new Agent({
    id: 'billing-specialist',
    name: 'Billing Specialist',
    instructions: [
      'You are a billing specialist. You answer questions about refunds, charges, and invoices.',
      'Use the lookup_refund tool to check refund status. Cite the order ID in your response.',
      'Be concise: 1-3 sentences. No bullet points.',
    ].join('\n'),
    model: useModel,
  });

  // The specialist's tool: read-only access to a refund database.
  const lookupRefund = {
    id: 'lookup_refund',
    description: 'Look up the status of a refund for a given order ID',
    inputSchema: z.object({ orderId: z.string() }),
    outputSchema: z.object({
      found: z.boolean(),
      amount: z.number().optional(),
      status: z.string().optional(),
      daysAgo: z.number().optional(),
      message: z.string(),
    }),
    execute: async ({ orderId }: { orderId: string }) => {
      tracer.emit({
        type: 'tool:call',
        stepId: 'specialist',
        tool: 'lookup_refund',
        input: { orderId },
        output: '...',
      });
      const record = REFUNDS[orderId];
      if (!record) {
        return {
          found: false,
          message: `No refund found for order ${orderId}.`,
        };
      }
      return {
        found: true,
        amount: record.amount,
        status: record.status,
        daysAgo: record.daysAgo,
        message:
          `Refund for ${orderId}: $${record.amount.toFixed(2)} is ${record.status}` +
          (record.status === 'processed' ? ` (${record.daysAgo} days ago).` : '.'),
      };
    },
  };

  // The primary agent: general triage, decides whether to delegate.
  // Its single tool is the handoff itself. (Specialist's tool stays inside the specialist.)
  const triageAgent = new Agent({
    id: 'triage',
    name: 'Support Triage',
    instructions: [
      'You are the first point of contact for customer support.',
      "If the customer asks about a refund, billing, charges, or invoice, call the",
      "transfer_to_billing_specialist tool with the customer's full message.",
      'For all other questions, answer directly in 1-2 sentences.',
      'Do not try to answer billing questions yourself — always delegate.',
    ].join('\n'),
    model: useModel,
  });

  // The primary's handoff tool: synchronously invokes the specialist.
  const transferToBillingSpecialist = {
    id: 'transfer_to_billing_specialist',
    description: "Transfer a customer message to the billing specialist agent",
    inputSchema: z.object({ customerMessage: z.string() }),
    outputSchema: z.object({
      specialistResponse: z.string(),
    }),
    execute: async ({ customerMessage }: { customerMessage: string }) => {
      // Emit a tracer event so the user can see the handoff in the trace.
      tracer.emit({
        type: 'step:start',
        stepId: 'specialist',
        input: { customerMessage },
      });
      const t0 = Date.now();
      // Synchronously invoke the specialist agent with the customer's message.
      // The specialist agent already has lookup_refund attached as a tool on its
      // constructor — but since lookup_refund is defined above, we attach it via
      // toolsets so it's available to the specialist too.
      const response = await billingSpecialist.generate(customerMessage, {
        toolsets: {
          billing: {
            lookup_refund: lookupRefund,
          },
        },
        // Use 'auto' tool choice so the specialist decides when to call lookup_refund
        toolChoice: 'auto',
      });
      const text = response.text;
      tracer.emit({
        type: 'step:end',
        stepId: 'specialist',
        output: { specialistResponse: text },
        durationMs: Date.now() - t0,
      });
      return { specialistResponse: text };
    },
  };

  // Single-step workflow: the primary agent handles the message (with its
  // tool, which may invoke the specialist).
  const triageStep = createStep({
    id: 'primary',
    description: 'Primary triage agent — may delegate to billing specialist',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    execute: async ({ inputData }) => {
      stepStart(tracer, 'primary', { messageLength: inputData.message.length });

      tracer.emit({
        type: 'step:start',
        stepId: 'primary',
        input: { message: inputData.message },
      });
      const t0 = Date.now();
      const response = await triageAgent.generate(inputData.message, {
        toolsets: {
          triage: {
            transfer_to_billing_specialist: transferToBillingSpecialist,
          },
        },
      });
      const text = response.text;
      // Inspect tool calls/results to determine whether we delegated.
      // Mastra 1.43 returns these as ToolCallChunk[] / ToolResultChunk[]
      // with the actual data on `chunk.payload`.
      const delegated =
        response.toolCalls?.some(
          (tc) => (tc.payload as { toolName?: string })?.toolName === 'transfer_to_billing_specialist',
        ) ?? false;
      // Find the specialist's response in toolResults.
      let specialistResponse: string | undefined;
      const transferResult = response.toolResults?.find(
        (tr) => (tr.payload as { toolName?: string })?.toolName === 'transfer_to_billing_specialist',
      );
      if (transferResult) {
        const result = (transferResult.payload as { result?: { specialistResponse?: string } }).result;
        if (result && typeof result === 'object' && 'specialistResponse' in result) {
          specialistResponse = result.specialistResponse;
        }
      }
      tracer.emit({
        type: 'step:end',
        stepId: 'primary',
        output: { text, delegated, toolCallCount: response.toolCalls?.length ?? 0 },
        durationMs: Date.now() - t0,
      });
      stepEnd(tracer, 'primary', { delegated, textLength: text.length });

      return {
        message: text,
        agentPath: delegated ? ['primary', 'specialist'] : ['primary'],
        delegated,
        specialistResponse,
      };
    },
  });

  return createWorkflow({
    id: 'multi-agent-handoff',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
  })
    .then(triageStep)
    .commit();
}

function buildMastra(tracer: Tracer, useModel: ReturnType<typeof getModel> = defaultModel) {
  return new Mastra({
    workflows: { 'multi-agent-handoff': makeWorkflow(tracer, useModel) },
    logger,
  });
}

export interface RunOptions {
  message: string;
  model?: string;
}

export async function runOne(input: RunOptions, tracer: Tracer) {
  const t0 = Date.now();
  tracer.emit({ type: 'start', workflow: 'multi-agent-handoff', input, steps: STEPS });

  const useModel = input.model ? getModel(input.model) : defaultModel;
  const mastra = buildMastra(tracer, useModel);
  const wf = mastra.getWorkflow('multi-agent-handoff');
  const run = await wf.createRun();
  const result = await run.start({ inputData: { message: input.message, model: input.model } });

  const output = result.status === 'success' ? unwrapWorkflowOutput(result.result) : null;
  const errMsg = result.status !== 'success' ? JSON.stringify(result) ?? String(result) : null;
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
    if (e.type === 'step:end') {
      const out = (e as { output?: { delegated?: boolean; specialistResponse?: string } }).output;
      console.log(`[${e.stepId}] ${JSON.stringify(out ?? {})}`);
    }
  });

  console.log('=== Multi-agent handoff demo ===\n');
  console.log('--- Test 1: billing question (should delegate) ---');
  const r1 = await runOne({ message: 'Where is my refund for order-1234?' }, silentTracer);
  if (r1.output) {
    const o = r1.output as {
      delegated: boolean;
      agentPath: string[];
      message: string;
      specialistResponse?: string;
    };
    console.log(`  delegated: ${o.delegated}`);
    console.log(`  agent path: ${o.agentPath.join(' -> ')}`);
    console.log(`  final: ${o.message}`);
    if (o.specialistResponse) console.log(`  specialist said: ${o.specialistResponse}`);
  }

  console.log('\n--- Test 2: non-billing question (should NOT delegate) ---');
  const r2 = await runOne({ message: 'How do I reset my password?' }, silentTracer);
  if (r2.output) {
    const o = r2.output as { delegated: boolean; agentPath: string[]; message: string };
    console.log(`  delegated: ${o.delegated}`);
    console.log(`  agent path: ${o.agentPath.join(' -> ')}`);
    console.log(`  final: ${o.message}`);
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
