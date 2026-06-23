// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { CUSTOM_WORKFLOW_HASH } from './registry/custom-workflow';

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('Workflow Builder navigation', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    window.localStorage.clear();
    window.location.hash = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('opens the builder from the rail and command palette', async () => {
    await act(async () => root.render(<App />));

    const railButton = container.querySelector<HTMLButtonElement>(
      `button[data-example="${CUSTOM_WORKFLOW_HASH}"]`,
    );
    expect(railButton?.textContent).toContain('Workflow Builder');
    expect(container.querySelector('.rail-heading .rail-count-muted')?.textContent).toBe('14');
    expect(
      Array.from(container.querySelectorAll<HTMLButtonElement>('.rail-prim-btn')).find((button) =>
        button.textContent?.includes('Workflow'),
      )?.textContent,
    ).toContain('9');

    await act(async () => railButton?.click());
    expect(container.querySelector('h1')?.textContent).toBe('Workflow Builder');
    expect(window.location.hash).toBe(`#${CUSTOM_WORKFLOW_HASH}`);

    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('.rail-prim-btn'))
        .find((button) => button.textContent?.includes('Workflow'))
        ?.click();
    });
    expect(container.querySelector('.rail-heading .rail-count-muted')?.textContent).toBe('9 / 14');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('#cmd-k')?.click();
    });
    const input = container.querySelector<HTMLInputElement>('.cp-input');
    await act(async () => {
      input!.value = 'builder';
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle();

    const paletteButton = Array.from(container.querySelectorAll<HTMLButtonElement>('.cp-item')).find(
      (button) => button.textContent?.includes('Workflow Builder'),
    );
    expect(paletteButton).toBeTruthy();
    await act(async () => paletteButton?.click());
    expect(container.querySelector('h1')?.textContent).toBe('Workflow Builder');
  });
});
