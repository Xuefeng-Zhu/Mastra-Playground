/**
 * Example 12 — Guardrail + Redaction Workflow
 *
 * What it teaches:
 *   - Run a deterministic redaction pass before any LLM sees or echoes the
 *     user input.
 *   - Classify the redacted request with an LLM, then branch on the guardrail
 *     decision.
 *   - Add Mastra's native PIIDetector as defense-in-depth around the response
 *     agent while keeping the visible workflow easy to inspect.
 */

import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { PIIDetector } from '@mastra/core/processors';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { runWithCancellation, type RunContext } from '../../shared/cancellable-run';
import { resolveModel, type LlmProvider } from '../../shared/llm';
import { logger } from '../../shared/mastra-logger';
import type { Tracer } from '../../shared/tracer';
import {
  branchEvaluate,
  llmStructured,
  startRun,
  stepEnd,
  stepStart,
  type StepSpec,
} from '../../shared/traced-step';
import { isMain, runCliExample } from '../../shared/cli-bootstrap';
import { unwrapWorkflowOutput } from '../../shared/workflow-helpers';

const PROCESSOR_MODE =
  'Explicit deterministic workflow redaction, plus Mastra PIIDetector input/output processors on the responder agent.';

const REDACTED_INPUT_LABEL = '[REDACTED_USER_MESSAGE]';

const DetectionTypeSchema = z.enum(['email', 'phone', 'ssn', 'card', 'api_key']);
const DetectionCountSchema = z.number().int().min(0);
const DetectionCountsSchema = z.object({
  email: DetectionCountSchema.optional(),
  phone: DetectionCountSchema.optional(),
  ssn: DetectionCountSchema.optional(),
  card: DetectionCountSchema.optional(),
  api_key: DetectionCountSchema.optional(),
});
const GuardrailSchema = z.object({
  allowed: z.boolean(),
  risk: z.enum(['low', 'medium', 'high']),
  policyTags: z.array(z.string()).max(6),
  reason: z.string(),
});
const RedactedSchema = z.object({
  redactedMessage: z.string(),
  detections: DetectionCountsSchema,
});
const ClassifiedSchema = RedactedSchema.extend({
  guardrail: GuardrailSchema,
});
const FinalSchema = ClassifiedSchema.extend({
  action: z.enum(['blocked', 'answered']),
  answer: z.string().optional(),
  processorMode: z.string(),
});

export type DetectionType = z.infer<typeof DetectionTypeSchema>;
export type DetectionCounts = Partial<Record<DetectionType, number>>;
export type RedactionResult = z.infer<typeof RedactedSchema>;
export type GuardrailDecision = z.infer<typeof GuardrailSchema>;

const EMPTY_COUNTS: DetectionCounts = {
  email: 0,
  phone: 0,
  ssn: 0,
  card: 0,
  api_key: 0,
};

const SENSITIVE_PATTERNS: Array<{ type: DetectionType; regex: RegExp }> = [
  { type: 'email', regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { type: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: 'card', regex: /\b(?:\d[ -]*?){13,19}\b/g },
  {
    type: 'api_key',
    regex: /\b(?:sk|pk|ghp|gho|AIza|xoxb|xoxp|or)[A-Za-z0-9_-]{16,}\b/g,
  },
  { type: 'phone', regex: /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g },
];

const CARD_DIGITS_MIN = 13;

function placeholder(type: DetectionType, index: number) {
  const label = type === 'api_key' ? 'API_KEY' : type.toUpperCase();
  return `[${label}_${index}]`;
}

function shouldRedact(type: DetectionType, match: string) {
  if (type !== 'card') return true;
  const digitCount = match.replace(/\D/g, '').length;
  return digitCount >= CARD_DIGITS_MIN;
}

export function redactSensitiveText(message: string): RedactionResult {
  let redactedMessage = message;
  const detections: DetectionCounts = { ...EMPTY_COUNTS };

  for (const { type, regex } of SENSITIVE_PATTERNS) {
    redactedMessage = redactedMessage.replace(regex, (match) => {
      if (!shouldRedact(type, match)) return match;
      const nextCount = (detections[type] ?? 0) + 1;
      detections[type] = nextCount;
      return placeholder(type, nextCount);
    });
  }

  return { redactedMessage, detections };
}

export function safeEchoInput(input: RunOptions): RunOptions {
  return {
    message: REDACTED_INPUT_LABEL,
    provider: input.provider,
    model: input.model,
  };
}

export function containsDetectedSensitiveText(value: string, redaction: RedactionResult) {
  return Object.entries(redaction.detections).some(([type, count]) => {
    if (!count) return false;
    const detectionType = type as DetectionType;
    const pattern = SENSITIVE_PATTERNS.find((entry) => entry.type === detectionType);
    if (!pattern) return false;
    pattern.regex.lastIndex = 0;
    return pattern.regex.test(value);
  });
}

function hasHighRiskDetection(detections: DetectionCounts) {
  return !!((detections.ssn ?? 0) || (detections.card ?? 0) || (detections.api_key ?? 0));
}

export function normalizeBlockedGuardrail(
  guardrail: GuardrailDecision,
  detections: DetectionCounts,
): GuardrailDecision {
  if (!hasHighRiskDetection(detections)) return guardrail;

  return {
    allowed: false,
    risk: 'high',
    policyTags: Array.from(new Set([...guardrail.policyTags, 'pii_or_secret'])),
    reason: 'Sensitive high-risk data was detected and removed before model processing.',
  };
}

function safeFailureMessage(result: unknown) {
  const topLevelError = (result as { error?: { message?: unknown } } | null)?.error?.message;
  if (typeof topLevelError === 'string' && topLevelError.trim()) return topLevelError;

  const steps = (result as { steps?: Record<string, { error?: { message?: unknown } }> } | null)?.steps;
  for (const stepId of ['redact', 'classify', 'block', 'respond']) {
    const message = steps?.[stepId]?.error?.message;
    if (typeof message === 'string' && message.trim()) return message;
  }

  return 'Workflow failed after the sensitive-data redaction step.';
}

export function finalizeGuardrailRunResult(
  result: unknown,
  tracer: Tracer,
  t0: number,
  echoInput: RunOptions,
) {
  const rawStatus = (result as { status?: string } | null)?.status;
  const status: 'success' | 'failed' | 'suspended' =
    rawStatus === 'success' || rawStatus === 'failed' || rawStatus === 'suspended' ? rawStatus : 'failed';

  let output: unknown;
  let error: string | null = null;

  if (status === 'success') {
    output = unwrapWorkflowOutput((result as { result: unknown }).result);
  } else if (status === 'suspended') {
    const r = result as {
      suspendedStep?: { id?: string };
      suspendPayload?: unknown;
    };
    output = { token: null, suspendedStep: r.suspendedStep, suspendedPayload: r.suspendPayload };
  } else {
    error = safeFailureMessage(result);
    output = { error };
  }

  tracer.emit({ type: 'done', status, output, totalMs: Date.now() - t0 });
  return { status, input: echoInput, output, error };
}

const STEPS: StepSpec[] = [
  { id: 'redact', label: 'Redact sensitive data', kind: 'tool' },
  { id: 'classify', label: 'Classify guardrail risk', kind: 'llm' },
  { id: 'block', label: 'Block unsafe request', kind: 'passthrough' },
  { id: 'respond', label: 'Respond with PII processors', kind: 'llm' },
];

function makeRedactStep(tracer: Tracer) {
  return createStep({
    id: 'redact',
    description: 'Deterministically replace sensitive values with placeholders',
    inputSchema: z.object({ message: z.string() }),
    outputSchema: RedactedSchema,
    execute: async ({ inputData }) => {
      stepStart(tracer, 'redact', { message: REDACTED_INPUT_LABEL });
      const out = redactSensitiveText(inputData.message);
      stepEnd(tracer, 'redact', out);
      return out;
    },
  });
}

function makeClassifyStep(tracer: Tracer, agent: Agent) {
  return createStep({
    id: 'classify',
    description: 'Classify the redacted request against the safety policy',
    inputSchema: RedactedSchema,
    outputSchema: ClassifiedSchema,
    execute: async ({ inputData, abortSignal }) => {
      stepStart(tracer, 'classify', {
        redactedMessage: inputData.redactedMessage,
        detections: inputData.detections,
      });
      const prompt = [
        'Decide whether this redacted user request may be answered.',
        'Block when the request still appears to include credentials, payment data, secrets, or instructions to expose private data.',
        'Allow normal support, summarization, or harmless rewriting requests after redaction.',
        '',
        `Message: ${inputData.redactedMessage}`,
        `Detection counts: ${JSON.stringify(inputData.detections)}`,
      ].join('\n');
      const result = await agent.generate(prompt, {
        abortSignal,
        structuredOutput: { schema: GuardrailSchema },
      });
      const guardrail = result.object as GuardrailDecision;
      const out = { ...inputData, guardrail };
      llmStructured(tracer, 'classify', 'GuardrailSchema', guardrail);
      stepEnd(tracer, 'classify', out);
      return out;
    },
  });
}

function makeBlockStep(tracer: Tracer) {
  return createStep({
    id: 'block',
    description: 'Return a safe refusal without calling the responder',
    inputSchema: ClassifiedSchema,
    outputSchema: FinalSchema,
    execute: async ({ inputData }) => {
      const guardrail = normalizeBlockedGuardrail(inputData.guardrail, inputData.detections);
      stepStart(tracer, 'block', {
        risk: guardrail.risk,
        policyTags: guardrail.policyTags,
      });
      const out = {
        ...inputData,
        guardrail,
        action: 'blocked' as const,
        answer:
          'I removed sensitive values from your message and cannot process content that appears to contain secrets or private data.',
        processorMode: PROCESSOR_MODE,
      };
      stepEnd(tracer, 'block', out);
      return out;
    },
  });
}

function makeRespondStep(tracer: Tracer, agent: Agent) {
  return createStep({
    id: 'respond',
    description: 'Answer the safe redacted request with PII processors attached',
    inputSchema: ClassifiedSchema,
    outputSchema: FinalSchema,
    execute: async ({ inputData, abortSignal }) => {
      stepStart(tracer, 'respond', {
        redactedMessage: inputData.redactedMessage,
        processorMode: PROCESSOR_MODE,
      });
      const prompt = [
        'Answer the user using only the redacted message.',
        'Do not ask for secrets, full payment numbers, SSNs, private credentials, or raw personal data.',
        'If placeholders are present, mention that sensitive values were redacted and keep placeholders intact.',
        '',
        `Message: ${inputData.redactedMessage}`,
      ].join('\n');
      const result = await agent.generate(prompt, { abortSignal });
      const answer = String(result.text).trim();
      const out = {
        ...inputData,
        action: 'answered' as const,
        answer,
        processorMode: PROCESSOR_MODE,
      };
      stepEnd(tracer, 'respond', { ...out, answerLen: answer.length });
      return out;
    },
  });
}

function makeWorkflow(tracer: Tracer, classifier: Agent, responder: Agent) {
  return createWorkflow({
    id: 'guardrail-redaction',
    inputSchema: z.object({ message: z.string() }),
    outputSchema: FinalSchema,
  })
    .then(makeRedactStep(tracer))
    .then(makeClassifyStep(tracer, classifier))
    .branch([
      [
        async ({ inputData }) => {
          const blockedByClassifier = !inputData.guardrail.allowed || inputData.guardrail.risk === 'high';
          const blockedByDeterministicScan = hasHighRiskDetection(inputData.detections);
          const matched = blockedByClassifier || blockedByDeterministicScan;
          branchEvaluate(
            tracer,
            'branch.guardrail',
            matched,
            'risk high or deterministic sensitive-data hit',
          );
          return matched;
        },
        makeBlockStep(tracer),
      ],
      [
        async ({ inputData }) => {
          const matched = inputData.guardrail.allowed && inputData.guardrail.risk !== 'high';
          branchEvaluate(tracer, 'branch.guardrail', matched, 'allowed and risk not high');
          return matched;
        },
        makeRespondStep(tracer, responder),
      ],
    ])
    .commit();
}

export interface RunOptions {
  message: string;
  provider?: LlmProvider;
  model?: string;
}

export async function runOne(input: RunOptions, tracer: Tracer, context?: RunContext) {
  const echoedInput = safeEchoInput(input);
  const t0 = startRun(tracer, 'guardrail-redaction', echoedInput, STEPS);

  const useModel = resolveModel(input.model, input.provider, context?.llmConfig);
  const classifier = new Agent({
    id: 'guardrail-classifier',
    name: 'Guardrail Classifier',
    instructions: [
      'You are a safety classifier for a learning playground.',
      'You receive already-redacted text and detection counts.',
      'Return JSON only matching the schema.',
      'Use allowed=false for credentials, payment data, secrets, private-data exfiltration, or requests that should not continue.',
      'Use allowed=true for harmless requests after redaction.',
    ].join('\n'),
    model: useModel,
  });
  const piiProcessor = new PIIDetector({
    model: useModel,
    detectionTypes: ['email', 'phone', 'ssn', 'credit-card', 'api-key'],
    strategy: 'redact',
    redactionMethod: 'placeholder',
    threshold: 0.6,
    lastMessageOnly: true,
  });
  const responder = new Agent({
    id: 'guardrail-responder',
    name: 'Guardrail Responder',
    instructions: [
      'You answer only the redacted message supplied by the workflow.',
      'Never reconstruct, request, or reveal raw sensitive values.',
      'Keep placeholders intact and concise.',
    ].join('\n'),
    model: useModel,
    inputProcessors: [piiProcessor],
    outputProcessors: [piiProcessor],
  });
  const mastra = new Mastra({
    agents: { classifier, responder },
    workflows: { 'guardrail-redaction': makeWorkflow(tracer, classifier, responder) },
    logger,
  });

  const wf = mastra.getWorkflow('guardrail-redaction');
  const run = await wf.createRun();
  const result = await runWithCancellation(run, context, () =>
    run.start({ inputData: { message: input.message } }),
  );

  return finalizeGuardrailRunResult(result, tracer, t0, echoedInput);
}

const demoMessages = [
  'Please summarize this note for support: customer email ada@example.com says the order is late.',
  'My SSN is 123-45-6789 and my card is 4242 4242 4242 4242. Can you store them?',
];

if (isMain(import.meta.url, process.argv[1])) {
  runCliExample(async (silentTracer) => {
    for (const message of demoMessages) {
      const r = await runOne({ message }, silentTracer);
      console.log(`\n- Guardrail redaction: ${r.status}`);
      if (r.status === 'success' && r.output) {
        const out = r.output as z.infer<typeof FinalSchema>;
        console.log(`  action=${out.action} risk=${out.guardrail.risk}`);
        console.log(`  redacted=${out.redactedMessage}`);
        if (out.answer) console.log(`  answer=${out.answer}`);
      } else {
        console.log(`  error=${r.error}`);
      }
    }
  });
}
