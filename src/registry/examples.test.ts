import { describe, expect, it } from 'vitest';
import { MODEL_OPTIONS } from './examples';

describe('MODEL_OPTIONS', () => {
  it('defaults to OpenRouter free routing and only offers free models', () => {
    expect(MODEL_OPTIONS[0].value).toBe('openrouter/free');
    expect(MODEL_OPTIONS.every(({ value }) => value === 'openrouter/free' || value.endsWith(':free'))).toBe(
      true,
    );
  });
});
