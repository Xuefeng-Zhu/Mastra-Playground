/**
 * Shared LLM configuration.
 *
 * Lesson: Mastra wants you to configure the model ONCE and pass it
 * into every Agent and Workflow. For multi-tenant code (like InboxPilot),
 * you'd want to support per-request model swaps — getModel(modelId) lets
 * the server pick a different model for each example run.
 *
 * The playground supports Gemini and OpenRouter. The provider and model can be
 * selected per request, while environment variables define CLI defaults.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';

export type LlmProvider = 'google' | 'openrouter';

const DEFAULT_PROVIDER: LlmProvider = 'google';
const DEFAULT_MODELS: Record<LlmProvider, string> = {
  google: 'gemini-2.5-flash-lite',
  openrouter: 'openai/gpt-oss-20b:free',
};

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY,
});
const openrouter = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1',
});

function parseProvider(value: string | undefined): LlmProvider {
  return value === 'openrouter' ? 'openrouter' : DEFAULT_PROVIDER;
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
 * Resolve the LLM model to use for a request. Falls back to the project
 * default (env-derived) when no per-request id is provided.
 */
export function resolveModel(inputModel?: string, inputProvider?: LlmProvider) {
  if (!inputModel && !inputProvider) return model;
  const provider = inputProvider ?? providerId;
  return getModel(inputModel ?? DEFAULT_MODELS[provider], provider);
}
