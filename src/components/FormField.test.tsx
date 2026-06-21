// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FormFieldView } from './FormField.js';

describe('FormFieldView', () => {
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

  it('updates a slider label from the native input event', async () => {
    await act(async () =>
      root.render(
        <FormFieldView
          field={{
            name: 'threshold',
            type: 'slider',
            label: 'Quality threshold',
            default: 7,
            min: 1,
            max: 10,
            step: 1,
          }}
        />,
      ),
    );
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;

    await act(async () => {
      slider.value = '8';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(slider.value).toBe('8');
    expect(container.querySelector('label')?.textContent).toContain('Quality threshold: 8');
  });
});
