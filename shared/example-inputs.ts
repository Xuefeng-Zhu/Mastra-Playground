import { z } from 'zod';
import { ValidationError, isPlainObject, sanitizeText } from './validation';
import type { ExampleId } from './example-manifest';
import type { LlmRequestConfig } from './llm';

const model = z.string().trim().min(1).optional();
const provider = z.enum(['google', 'openrouter', 'custom']).optional();
const text = (field: string, maxLength = 4096) =>
  z
    .string({ error: `Field "${field}" must be a string` })
    .transform((value) => sanitizeText(value, maxLength));
const requiredText = (field: string, maxLength = 4096) =>
  text(field, maxLength).refine((value) => value.trim().length > 0, {
    message: `Field "${field}" must be a non-empty string`,
  });

/**
 * Custom provider configuration fields. These are stripped from validated
 * input and passed via RunContext so they never reach example code directly.
 */
const customLlmFields = {
  providerApiKey: z.string().trim().max(2048).optional(),
  customBaseUrl: z.string().trim().max(2048).optional(),
  customApiKey: z.string().trim().max(2048).optional(),
  customModel: z.string().trim().max(512).optional(),
};

export const EXAMPLE_INPUT_SCHEMAS = {
  'support-triage': z.object({
    message: text('message').default(''),
    provider,
    model,
    threshold: z.coerce.number().min(0).max(1).optional(),
    ...customLlmFields,
  }),
  research: z.object({ topic: requiredText('topic'), provider, model, ...customLlmFields }),
  'code-review': z.object({ path: text('path', 512).default(''), provider, model, ...customLlmFields }),
  'parallel-research': z.object({ topic: requiredText('topic'), provider, model, ...customLlmFields }),
  'multi-turn-chat': z.object({
    threadId: text('threadId').default('thread-browser'),
    resourceId: text('resourceId').default('browser-user'),
    message: text('message').default(''),
    action: z.enum(['new', 'clear', 'send']).optional(),
    provider,
    model,
    ...customLlmFields,
  }),
  'hitl-approval': z.object({
    action: text('action').default(''),
    actionType: z.enum(['refund', 'send', 'delete']).default('refund'),
    provider,
    model,
    ...customLlmFields,
  }),
  'streaming-chat': z.object({ prompt: requiredText('prompt'), provider, model, ...customLlmFields }),
  'critic-loop': z.object({
    topic: requiredText('topic'),
    threshold: z.coerce.number().min(0).max(10).optional(),
    maxIterations: z.coerce.number().int().min(1).max(5).optional(),
    provider,
    model,
    ...customLlmFields,
  }),
  'multi-agent-handoff': z.object({ message: requiredText('message'), provider, model, ...customLlmFields }),
  'mastra-memory': z.object({
    threadId: requiredText('threadId'),
    resourceId: text('resourceId').optional(),
    turn1: text('turn1').optional(),
    turn2: text('turn2').optional(),
    provider,
    model,
    ...customLlmFields,
  }),
  'content-pipeline': z.object({
    topic: requiredText('topic'),
    audience: text('audience').optional(),
    provider,
    model,
    ...customLlmFields,
  }),
  'guardrail-redaction': z.object({ message: requiredText('message'), provider, model, ...customLlmFields }),
} satisfies Record<ExampleId, z.ZodType<Record<string, unknown>>>;

export type { ExampleId } from './example-manifest';

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

/**
 * Extract and validate Custom provider configuration from validated input.
 * Returns the config if all required fields are present and valid, or
 * undefined otherwise. Strips custom fields from the input object so they
 * never reach example code.
 */
export function prepareExampleInput(input: Record<string, unknown>): {
  input: Record<string, unknown>;
  llmConfig?: LlmRequestConfig;
} {
  const { providerApiKey, customBaseUrl, customApiKey, customModel, ...exampleInput } = input;

  if (exampleInput.provider !== 'custom') {
    if (
      typeof providerApiKey === 'string' &&
      providerApiKey.trim().length > 0 &&
      (exampleInput.provider === 'google' || exampleInput.provider === 'openrouter')
    ) {
      return {
        input: exampleInput,
        llmConfig: { provider: exampleInput.provider, apiKey: providerApiKey.trim() },
      };
    }
    return { input: exampleInput };
  }

  if (!customBaseUrl || typeof customBaseUrl !== 'string' || customBaseUrl.trim().length === 0) {
    throw new ValidationError('Custom provider requires a base URL.', 'customBaseUrl');
  }
  if (!customApiKey || typeof customApiKey !== 'string' || customApiKey.trim().length === 0) {
    throw new ValidationError('Custom provider requires an API key.', 'customApiKey');
  }
  if (!customModel || typeof customModel !== 'string' || customModel.trim().length === 0) {
    throw new ValidationError('Custom provider requires a model ID.', 'customModel');
  }

  // Validate base URL: must be absolute http or https, no embedded credentials
  let parsed: URL;
  try {
    parsed = new URL(customBaseUrl);
  } catch {
    throw new ValidationError('Custom base URL must be a valid absolute URL.', 'customBaseUrl');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError('Custom base URL must use http: or https: protocol.', 'customBaseUrl');
  }
  if (parsed.username || parsed.password) {
    throw new ValidationError('Custom base URL must not contain embedded credentials.', 'customBaseUrl');
  }

  return {
    input: exampleInput,
    llmConfig: {
      provider: 'custom',
      baseUrl: customBaseUrl.trim(),
      apiKey: customApiKey.trim(),
      model: customModel.trim(),
    },
  };
}
