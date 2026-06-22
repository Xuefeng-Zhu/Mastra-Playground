import { describe, expect, it } from 'vitest';
import { ValidationError } from './validation';
import { validateExampleInput } from './example-inputs';

describe('validateExampleInput', () => {
  it('coerces critic-loop form values and preserves the selected model', () => {
    expect(
      validateExampleInput('critic-loop', {
        topic: 'Testing agents',
        threshold: '8',
        maxIterations: '4',
        provider: 'google',
        model: 'openai/gpt-4.1-mini',
      }),
    ).toEqual({
      topic: 'Testing agents',
      threshold: 8,
      maxIterations: 4,
      provider: 'google',
      model: 'openai/gpt-4.1-mini',
    });
  });

  it.each(['support-triage', 'research', 'code-review', 'parallel-research'] as const)(
    'preserves model overrides for %s',
    (name) => {
      const required =
        name === 'support-triage'
          ? { message: 'hello' }
          : name === 'code-review'
            ? { path: 'auth.ts' }
            : { topic: 'agents' };
      expect(validateExampleInput(name, { ...required, model: 'custom-model' })).toMatchObject({
        model: 'custom-model',
      });
    },
  );

  it('supplies stable browser chat identifiers when the form omits them', () => {
    expect(validateExampleInput('multi-turn-chat', { message: 'hello' })).toMatchObject({
      threadId: 'thread-browser',
      resourceId: 'browser-user',
      message: 'hello',
    });
  });

  it('reports the first invalid field as a ValidationError', () => {
    expect(() => validateExampleInput('critic-loop', { topic: 'x', threshold: 'nope' })).toThrow(
      ValidationError,
    );
  });

  it('rejects unsupported providers', () => {
    expect(() => validateExampleInput('research', { topic: 'agents', provider: 'unknown' })).toThrow(
      ValidationError,
    );
  });
});
