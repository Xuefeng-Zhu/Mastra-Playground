// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomProviderModal } from './CustomProviderModal';

describe('CustomProviderModal', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('updates provider fields and clears settings', async () => {
    const onBaseUrlChange = vi.fn();
    const onApiKeyChange = vi.fn();
    const onModelChange = vi.fn();
    const onClear = vi.fn();

    await act(async () =>
      root.render(
        <CustomProviderModal
          title="Custom endpoint"
          showBaseUrl
          baseUrl="https://api.example.com/v1"
          apiKey="sk-test"
          model="model-a"
          apiKeyPlaceholder="sk-..."
          modelPlaceholder="model-id"
          onBaseUrlChange={onBaseUrlChange}
          onApiKeyChange={onApiKeyChange}
          onModelChange={onModelChange}
          onClear={onClear}
          onClose={vi.fn()}
        />,
      ),
    );

    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input'));
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(inputs[0], 'https://local.example/v1');
      inputs[0]!.dispatchEvent(new Event('input', { bubbles: true }));
      setter?.call(inputs[1], 'model-b');
      inputs[1]!.dispatchEvent(new Event('input', { bubbles: true }));
      setter?.call(inputs[2], 'sk-next');
      inputs[2]!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onBaseUrlChange).toHaveBeenCalledWith('https://local.example/v1');
    expect(onModelChange).toHaveBeenCalledWith('model-b');
    expect(onApiKeyChange).toHaveBeenCalledWith('sk-next');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.custom-modal-clear-btn')?.click();
    });
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('closes from Escape, overlay click, and Done without closing on panel clicks', async () => {
    const onClose = vi.fn();
    await act(async () =>
      root.render(
        <CustomProviderModal
          title="Google settings"
          showBaseUrl={false}
          apiKey=""
          model="gemini"
          apiKeyPlaceholder="AIza..."
          modelPlaceholder="gemini-2.5-flash"
          onApiKeyChange={vi.fn()}
          onModelChange={vi.fn()}
          onClear={vi.fn()}
          onClose={onClose}
        />,
      ),
    );

    await act(async () => {
      container.querySelector<HTMLElement>('.custom-modal')?.click();
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.custom-modal-done-btn')?.click();
    });
    await act(async () => {
      container.querySelector<HTMLElement>('.custom-modal-overlay')?.click();
    });

    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
