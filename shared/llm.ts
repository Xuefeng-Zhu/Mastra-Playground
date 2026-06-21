/**
 * Shared LLM configuration.
 *
 * Lesson: Mastra wants you to configure the model ONCE and pass it
 * into every Agent and Workflow. For multi-tenant code (like InboxPilot),
 * you'd want to support per-request model swaps — getModel(modelId) lets
 * the server pick a different model for each example run.
 *
 * For the playground, we use OpenRouter via the @ai-sdk/openai OpenAI-compatible
 * endpoint. The default model is set by OPENAI_MODEL env var.
 */

import { createOpenAI } from '@ai-sdk/openai';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error(
    'OPENAI_API_KEY is not set. Copy .env.example to .env and add your key. ' +
      'OpenRouter works too: set OPENAI_BASE_URL=https://openrouter.ai/api/v1 and use your OpenRouter key.',
  );
}

const openai = createOpenAI({
  apiKey,
  baseURL: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1',
});

/** Default model used when no override is supplied. */
const modelId = process.env.OPENAI_MODEL || 'openrouter/free';

/** The default model — used by CLI examples without settings. */
export const model = openai(modelId);

/**
 * Build a model instance for a specific model ID.
 * Used by the server when the UI requests a different model.
 */
export function getModel(id: string) {
  return openai(id);
}

/**
 * Resolve the LLM model to use for a request. Falls back to the project
 * default (env-derived) when no per-request id is provided.
 */
export function resolveModel(inputModel?: string) {
  return inputModel ? getModel(inputModel) : model;
}
