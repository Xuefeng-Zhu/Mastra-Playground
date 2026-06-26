import { z } from 'zod';
import type { LlmProvider } from '../../shared/llm';

export const PROCESSOR_MODE =
  'Explicit deterministic workflow redaction, plus Mastra PIIDetector input/output processors on the responder agent.';

export const REDACTED_INPUT_LABEL = '[REDACTED_USER_MESSAGE]';

const DetectionTypeSchema = z.enum(['email', 'phone', 'ssn', 'card', 'api_key']);
const DetectionCountSchema = z.number().int().min(0);
const DetectionCountsSchema = z.object({
  email: DetectionCountSchema.optional(),
  phone: DetectionCountSchema.optional(),
  ssn: DetectionCountSchema.optional(),
  card: DetectionCountSchema.optional(),
  api_key: DetectionCountSchema.optional(),
});

export const GuardrailSchema = z.object({
  allowed: z.boolean(),
  risk: z.enum(['low', 'medium', 'high']),
  policyTags: z.array(z.string()).max(6),
  reason: z.string(),
});

export const RedactedSchema = z.object({
  redactedMessage: z.string(),
  detections: DetectionCountsSchema,
});

export const ClassifiedSchema = RedactedSchema.extend({
  guardrail: GuardrailSchema,
});

export const FinalSchema = ClassifiedSchema.extend({
  action: z.enum(['blocked', 'answered']),
  answer: z.string().optional(),
  processorMode: z.string(),
});

export interface RunOptions {
  message: string;
  provider?: LlmProvider;
  model?: string;
}

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

export function hasHighRiskDetection(detections: DetectionCounts) {
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

export function safeFailureMessage(result: unknown) {
  const topLevelError = (result as { error?: { message?: unknown } } | null)?.error?.message;
  if (typeof topLevelError === 'string' && topLevelError.trim()) return topLevelError;

  const steps = (result as { steps?: Record<string, { error?: { message?: unknown } }> } | null)?.steps;
  for (const stepId of ['redact', 'classify', 'block', 'respond']) {
    const message = steps?.[stepId]?.error?.message;
    if (typeof message === 'string' && message.trim()) return message;
  }

  return 'Workflow failed after the sensitive-data redaction step.';
}
