import { describe, expect, it } from 'vitest';
import { EXAMPLES, MODEL_OPTIONS_BY_PROVIDER, PROVIDER_OPTIONS } from './examples';
import { EXAMPLE_IDS, OUTPUT_KIND_BY_EXAMPLE } from '../../shared/example-manifest';
import { EXAMPLES as SERVER_EXAMPLES, EXAMPLE_LOADERS } from '../../shared/examples-registry';

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

describe('example output renderers', () => {
  it('keeps chat and handoff output shapes on their matching renderers', () => {
    expect(EXAMPLES['multi-turn-chat'].output.kind).toBe('chat');
    expect(EXAMPLES['multi-agent-handoff'].output.kind).toBe('handoff');
  });

  it('keeps browser metadata, server metadata, loaders, and output kinds aligned', () => {
    expect(Object.keys(EXAMPLES)).toEqual(EXAMPLE_IDS);
    expect(Object.keys(SERVER_EXAMPLES)).toEqual(EXAMPLE_IDS);
    expect(Object.keys(EXAMPLE_LOADERS)).toEqual(EXAMPLE_IDS);
    for (const id of EXAMPLE_IDS) expect(EXAMPLES[id].output.kind).toBe(OUTPUT_KIND_BY_EXAMPLE[id]);
  });
});
