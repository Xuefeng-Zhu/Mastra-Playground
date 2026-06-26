import { describe, expect, it } from 'vitest';
import {
  builtInLlmConfigFromProviderKey,
  customLlmConfigFromFields,
  parseRequestProvider,
} from './llm-request-config';
import { ValidationError } from './validation';

describe('LLM request config helpers', () => {
  it('builds request-scoped built-in provider configs only when a key is present', () => {
    expect(builtInLlmConfigFromProviderKey('google', ' gemini-key ')).toEqual({
      provider: 'google',
      apiKey: 'gemini-key',
    });
    expect(builtInLlmConfigFromProviderKey('openrouter', ' sk-or-test ')).toEqual({
      provider: 'openrouter',
      apiKey: 'sk-or-test',
    });
    expect(builtInLlmConfigFromProviderKey('google', '')).toBeUndefined();
    expect(builtInLlmConfigFromProviderKey('custom', 'secret')).toBeUndefined();
  });

  it('validates custom provider config without allowing unsafe base URLs', () => {
    expect(
      customLlmConfigFromFields({
        customBaseUrl: ' https://provider.example/v1 ',
        customApiKey: ' secret ',
        customModel: ' demo-model ',
      }),
    ).toEqual({
      provider: 'custom',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'secret',
      model: 'demo-model',
    });

    expect(() =>
      customLlmConfigFromFields({
        customBaseUrl: 'ftp://provider.example/v1',
        customApiKey: 'secret',
        customModel: 'demo-model',
      }),
    ).toThrow(ValidationError);

    expect(() =>
      customLlmConfigFromFields({
        customBaseUrl: 'https://user:pass@provider.example/v1',
        customApiKey: 'secret',
        customModel: 'demo-model',
      }),
    ).toThrow('embedded credentials');
  });

  it('parses only supported request provider ids', () => {
    expect(parseRequestProvider('google')).toBe('google');
    expect(parseRequestProvider('openrouter')).toBe('openrouter');
    expect(parseRequestProvider('custom')).toBe('custom');
    expect(parseRequestProvider('unknown')).toBeUndefined();
  });
});
