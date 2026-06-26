// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelPreferences } from './useModelPreferences';

function Harness({ expose }: { expose: (value: ReturnType<typeof useModelPreferences>) => void }) {
  const preferences = useModelPreferences();
  useEffect(() => {
    expose(preferences);
  }, [expose, preferences]);
  return null;
}

describe('useModelPreferences', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('hydrates a saved preference without overwriting it with defaults', async () => {
    localStorage.setItem('mpg:llm:v2', JSON.stringify({ provider: 'openrouter', model: 'openrouter/free' }));
    let preferences: ReturnType<typeof useModelPreferences> | undefined;
    await act(async () => root.render(<Harness expose={(value) => (preferences = value)} />));
    expect(preferences?.provider).toBe('openrouter');
    expect(preferences?.model).toBe('openrouter/free');
    expect(localStorage.getItem('mpg:llm:v2')).toBeNull();
    expect(JSON.parse(localStorage.getItem('mpg:llm:v3') ?? '{}')).toMatchObject({
      provider: 'openrouter',
      providers: {
        openrouter: {
          model: 'openrouter/free',
          apiKey: '',
          customModel: '',
          useCustomModel: false,
        },
      },
    });
  });

  it('clears custom endpoint settings without re-saving blank credentials', async () => {
    localStorage.setItem(
      'mpg:llm:v2',
      JSON.stringify({
        provider: 'custom',
        customBaseUrl: 'https://api.example.com/v1',
        customApiKey: 'sk-test',
        customModel: 'custom-model',
      }),
    );
    let preferences: ReturnType<typeof useModelPreferences> | undefined;
    await act(async () => root.render(<Harness expose={(value) => (preferences = value)} />));
    expect(preferences?.provider).toBe('custom');

    await act(async () => preferences?.clearAllSettings());

    expect(preferences?.provider).toBe('google');
    expect(localStorage.getItem('mpg:llm:v2')).toBeNull();
    expect(localStorage.getItem('mpg:llm:v3')).toBeNull();
  });

  it('continues with in-memory settings when browser storage throws', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    try {
      let preferences: ReturnType<typeof useModelPreferences> | undefined;
      await act(async () => root.render(<Harness expose={(value) => (preferences = value)} />));
      expect(preferences?.provider).toBe('google');

      await act(async () => preferences?.selectProvider('openrouter'));
      expect(preferences?.provider).toBe('openrouter');

      await act(async () => preferences?.clearAllSettings());
      expect(preferences?.provider).toBe('google');
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
      removeItem.mockRestore();
    }
  });
});
