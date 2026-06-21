import { z } from 'zod';
import { ValidationError, isPlainObject, sanitizeText } from './validation.js';

const model = z.string().trim().min(1).optional();
const text = (field: string, maxLength = 4096) =>
  z
    .string({ error: `Field "${field}" must be a string` })
    .transform((value) => sanitizeText(value, maxLength));
const requiredText = (field: string, maxLength = 4096) =>
  text(field, maxLength).refine((value) => value.trim().length > 0, {
    message: `Field "${field}" must be a non-empty string`,
  });

export const EXAMPLE_INPUT_SCHEMAS = {
  'support-triage': z.object({
    message: text('message').default(''),
    model,
    threshold: z.coerce.number().min(0).max(1).optional(),
  }),
  research: z.object({ topic: requiredText('topic'), model }),
  'code-review': z.object({ path: text('path', 512).default(''), model }),
  'parallel-research': z.object({ topic: requiredText('topic'), model }),
  'multi-turn-chat': z.object({
    threadId: text('threadId').default('thread-browser'),
    resourceId: text('resourceId').default('browser-user'),
    message: text('message').default(''),
    action: z.enum(['new', 'clear', 'send']).optional(),
    model,
  }),
  'hitl-approval': z.object({
    action: text('action').default(''),
    actionType: z.enum(['refund', 'send', 'delete']).default('refund'),
    model,
  }),
  'streaming-chat': z.object({ prompt: requiredText('prompt'), model }),
  'critic-loop': z.object({
    topic: requiredText('topic'),
    threshold: z.coerce.number().min(0).max(10).optional(),
    maxIterations: z.coerce.number().int().min(1).max(5).optional(),
    model,
  }),
  'multi-agent-handoff': z.object({ message: requiredText('message'), model }),
  'mastra-memory': z.object({
    threadId: requiredText('threadId'),
    resourceId: text('resourceId').optional(),
    turn1: text('turn1').optional(),
    turn2: text('turn2').optional(),
    model,
  }),
  'content-pipeline': z.object({
    topic: requiredText('topic'),
    audience: text('audience').optional(),
    model,
  }),
} satisfies Record<string, z.ZodType<Record<string, unknown>>>;

export type ExampleId = keyof typeof EXAMPLE_INPUT_SCHEMAS;

export function validateExampleInput(name: ExampleId, body: unknown): Record<string, unknown> {
  if (!isPlainObject(body)) {
    throw new ValidationError('Request body must be a JSON object', 'body');
  }

  const result = EXAMPLE_INPUT_SCHEMAS[name].safeParse(body);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  const field = issue?.path[0]?.toString();
  throw new ValidationError(issue?.message ?? 'Invalid example input', field);
}
