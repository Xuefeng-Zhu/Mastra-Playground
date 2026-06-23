import { describe, expect, it } from 'vitest';
import { ValidationError } from './validation';
import { prepareExampleInput, validateExampleInput } from './example-inputs';
import { EXAMPLE_IDS } from './example-manifest';

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

  it('has a validation schema for every canonical example', () => {
    const validInput = {
      'support-triage': { message: 'hello' },
      research: { topic: 'agents' },
      'code-review': { path: 'file.ts' },
      'parallel-research': { topic: 'agents' },
      'multi-turn-chat': { message: 'hello' },
      'hitl-approval': { action: 'refund' },
      'streaming-chat': { prompt: 'hello' },
      'critic-loop': { topic: 'agents' },
      'multi-agent-handoff': { message: 'hello' },
      'mastra-memory': { threadId: 'thread' },
      'content-pipeline': { topic: 'agents' },
      'guardrail-redaction': { message: 'hello' },
      'plan-and-execute': { task: 'agents' },
    } as const;

    for (const id of EXAMPLE_IDS) {
      expect(() => validateExampleInput(id, validInput[id])).not.toThrow();
    }
  });

  it('returns a credential-free copy with request-scoped custom configuration', () => {
    const original = {
      provider: 'custom',
      topic: 'agents',
      customBaseUrl: 'https://example.com/v1',
      customApiKey: 'secret',
      customModel: 'model-id',
    };
    expect(prepareExampleInput(original)).toEqual({
      input: { provider: 'custom', topic: 'agents' },
      llmConfig: {
        provider: 'custom',
        baseUrl: 'https://example.com/v1',
        apiKey: 'secret',
        model: 'model-id',
      },
    });
    expect(original.customApiKey).toBe('secret');
  });

  it('strips provider API keys while preserving env fallback when blank', () => {
    expect(
      prepareExampleInput({
        provider: 'openrouter',
        topic: 'agents',
        model: 'openai/gpt-oss-20b:free',
        providerApiKey: ' sk-or-test ',
      }),
    ).toEqual({
      input: { provider: 'openrouter', topic: 'agents', model: 'openai/gpt-oss-20b:free' },
      llmConfig: { provider: 'openrouter', apiKey: 'sk-or-test' },
    });

    expect(
      prepareExampleInput({
        provider: 'google',
        topic: 'agents',
        model: 'gemini-2.5-flash',
        providerApiKey: '',
      }),
    ).toEqual({
      input: { provider: 'google', topic: 'agents', model: 'gemini-2.5-flash' },
    });
  });
});
