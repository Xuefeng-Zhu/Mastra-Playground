// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutputPanel } from './OutputPanel';

describe('OutputPanel tabs', () => {
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

  it('exposes selected state and supports arrow navigation', async () => {
    const setActiveTab = vi.fn();
    await act(async () =>
      root.render(
        <OutputPanel
          kind="research"
          output={{ formatted: 'answer' }}
          priorOutput={null}
          sources={[]}
          totalMs={12}
          streamingText=""
          streamingModel=""
          streamingTokenCount={0}
          activeTab="result"
          setActiveTab={setActiveTab}
          onHitlApprove={vi.fn()}
          onHitlReject={vi.fn()}
          error={null}
        />,
      ),
    );

    const result = container.querySelector<HTMLButtonElement>('#output-tab-result')!;
    const json = container.querySelector<HTMLButtonElement>('#output-tab-json')!;
    expect(result.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('#output-panel-result')?.getAttribute('role')).toBe('tabpanel');

    result.focus();
    await act(async () =>
      result.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
    );
    expect(document.activeElement).toBe(json);
    expect(setActiveTab).toHaveBeenCalledWith('json');
  });
});
