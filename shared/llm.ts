/**
 * Shared LLM configuration.
 *
 * Lesson: Mastra wants you to configure the model ONCE and pass it
 * into every Agent and Workflow. For multi-tenant code (like InboxPilot),
 * you'd want to support per-request model swaps — getModel(modelId) lets
 * the server pick a different model for each example run.
 *
 * The playground supports Gemini, OpenRouter, and a user-configurable Custom
 * provider (any OpenAI-compatible endpoint). The provider and model can be
 * selected per request, while environment variables define CLI defaults.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';

export type LlmProvider = 'google' | 'openrouter' | 'custom';

/** Browser-supplied configuration for the Custom provider. */
export interface CustomLlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const DEFAULT_PROVIDER: LlmProvider = 'google';
const DEFAULT_MODELS: Record<LlmProvider, string> = {
  google: 'gemini-2.5-flash-lite',
  openrouter: 'openai/gpt-oss-20b:free',
  custom: 'gpt-3.5-turbo',
};

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY,
});
const openrouter = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1',
});

function parseProvider(value: string | undefined): LlmProvider {
  if (value === 'openrouter') return 'openrouter';
  if (value === 'custom') return 'custom';
  return DEFAULT_PROVIDER;
}

/** Default provider and model used when no per-request override is supplied. */
export const providerId = parseProvider(process.env.LLM_PROVIDER);
export const modelId =
  providerId === 'google'
    ? process.env.GOOGLE_MODEL || DEFAULT_MODELS.google
    : process.env.OPENAI_MODEL || DEFAULT_MODELS.openrouter;

/** The default model — used by CLI examples without settings. */
export const model = getModel(modelId, providerId);

/**
 * Build a model instance for a specific model ID.
 * Used by the server when the UI requests a different model.
 */
export function getModel(id: string, provider: LlmProvider = providerId) {
  if (provider === 'google') {
    return google(id);
  }
  return openrouter(id);
}

/**
 * Build a request-scoped model instance for the Custom provider.
 * Creates a fresh OpenAI-compatible client using the browser-supplied
 * baseUrl and apiKey. Never falls back to server-side credentials.
 */
export function getCustomModel(config: CustomLlmConfig) {
  const client = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
  return client(config.model);
}

/**
 * Resolve the LLM model to use for a request. Falls back to the project
 * default (env-derived) when no per-request id is provided.
 *
 * For the 'custom' provider, a CustomLlmConfig must be supplied — the
 * function throws if it's missing, to avoid silently falling back to
 * server-side credentials.
 */
export function resolveModel(
  inputModel?: string,
  inputProvider?: LlmProvider,
  customConfig?: CustomLlmConfig,
) {
  if (inputProvider === 'custom') {
    if (!customConfig) {
      throw new Error('Custom provider selected but no configuration supplied.');
    }
    return getCustomModel(customConfig);
  }
  if (!inputModel && !inputProvider) return model;
  const provider = inputProvider ?? providerId;
  return getModel(inputModel ?? DEFAULT_MODELS[provider], provider);
}
