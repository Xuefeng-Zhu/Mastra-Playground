import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const googleModel = vi.fn((id: string) => ({ provider: 'google', id }));
  const openAIChat = vi.fn((id: string) => ({ provider: 'openrouter-chat', id }));
  const openAIDefault = Object.assign(
    vi.fn((id: string) => ({ provider: 'openrouter-default', id })),
    {
      chat: openAIChat,
    },
  );

  return {
    createGoogleGenerativeAI: vi.fn(() => googleModel),
    createOpenAI: vi.fn(() => openAIDefault),
    googleModel,
    openAIChat,
    openAIDefault,
  };
});

vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: mocks.createGoogleGenerativeAI }));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mocks.createOpenAI }));

import { getCustomModel, getModel, getOpenRouterModel } from './llm';

describe('LLM provider factory', () => {
  it('uses chat completions for OpenRouter models', () => {
    mocks.openAIChat.mockClear();
    mocks.openAIDefault.mockClear();

    expect(getModel('openai/gpt-oss-20b:free', 'openrouter')).toEqual({
      provider: 'openrouter-chat',
      id: 'openai/gpt-oss-20b:free',
    });

    expect(mocks.openAIChat).toHaveBeenCalledWith('openai/gpt-oss-20b:free');
    expect(mocks.openAIDefault).not.toHaveBeenCalled();
  });

  it('uses chat completions for request-scoped OpenAI-compatible providers', () => {
    mocks.openAIChat.mockClear();

    expect(getOpenRouterModel('qwen/qwen3-next-80b-a3b-instruct:free', 'sk-test')).toEqual({
      provider: 'openrouter-chat',
      id: 'qwen/qwen3-next-80b-a3b-instruct:free',
    });
    expect(
      getCustomModel({
        provider: 'custom',
        baseUrl: 'https://example.test/v1',
        apiKey: 'sk-test',
        model: 'x',
      }),
    ).toEqual({
      provider: 'openrouter-chat',
      id: 'x',
    });

    expect(mocks.openAIChat).toHaveBeenCalledWith('qwen/qwen3-next-80b-a3b-instruct:free');
    expect(mocks.openAIChat).toHaveBeenCalledWith('x');
  });
});
