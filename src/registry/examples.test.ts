import { describe, expect, it } from 'vitest';
import { MODEL_OPTIONS_BY_PROVIDER, PROVIDER_OPTIONS } from './examples';

describe('provider model options', () => {
  it('defaults to Gemini with provider-specific model lists', () => {
    expect(PROVIDER_OPTIONS[0].value).toBe('google');
    expect(MODEL_OPTIONS_BY_PROVIDER.google[0].value).toBe('gemini-2.5-flash-lite');
    expect(MODEL_OPTIONS_BY_PROVIDER.google.every(({ value }) => value.startsWith('gemini-'))).toBe(true);
    expect(
      MODEL_OPTIONS_BY_PROVIDER.openrouter.every(
        ({ value }) => value === 'openrouter/free' || value.endsWith(':free'),
      ),
    ).toBe(true);
  });
});
