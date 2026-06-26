import { type LlmProvider, type LlmRequestConfig } from './llm';
import { sanitizeText, ValidationError } from './validation';

export function builtInLlmConfigFromProviderKey(
  provider: unknown,
  providerApiKey: unknown,
): LlmRequestConfig | undefined {
  const apiKey = typeof providerApiKey === 'string' ? providerApiKey.trim() : '';
  if (!apiKey) return undefined;
  if (provider === 'google') return { provider: 'google', apiKey };
  if (provider === 'openrouter') return { provider: 'openrouter', apiKey };
  return undefined;
}

export function customLlmConfigFromFields(fields: {
  customBaseUrl: unknown;
  customApiKey: unknown;
  customModel: unknown;
}): Extract<LlmRequestConfig, { provider: 'custom' }> {
  const customBaseUrl = typeof fields.customBaseUrl === 'string' ? fields.customBaseUrl.trim() : '';
  const customApiKey = typeof fields.customApiKey === 'string' ? fields.customApiKey.trim() : '';
  const customModel =
    typeof fields.customModel === 'string' && fields.customModel.trim()
      ? sanitizeText(fields.customModel, 512).trim()
      : '';

  if (!customBaseUrl) throw new ValidationError('Custom provider requires a base URL.', 'customBaseUrl');
  if (!customApiKey) throw new ValidationError('Custom provider requires an API key.', 'customApiKey');
  if (!customModel) throw new ValidationError('Custom provider requires a model ID.', 'customModel');

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
    provider: 'custom',
    baseUrl: customBaseUrl,
    apiKey: customApiKey,
    model: customModel,
  };
}

export function parseRequestProvider(value: unknown): LlmProvider | undefined {
  return value === 'google' || value === 'openrouter' || value === 'custom' ? value : undefined;
}
