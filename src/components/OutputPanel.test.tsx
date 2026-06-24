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

  it('renders the multi-agent handoff result', async () => {
    await act(async () =>
      root.render(
        <OutputPanel
          kind="handoff"
          output={{
            message: 'Your refund was processed two days ago.',
            agentPath: ['primary', 'specialist'],
            delegated: true,
          }}
          priorOutput={null}
          sources={[]}
          totalMs={2319}
          streamingText=""
          streamingModel=""
          streamingTokenCount={0}
          activeTab="result"
          setActiveTab={vi.fn()}
          onHitlApprove={vi.fn()}
          onHitlReject={vi.fn()}
          error={null}
        />,
      ),
    );

    expect(container.textContent).toContain('Your refund was processed two days ago.');
    expect(container.textContent).toContain('primary → specialist');
    expect(container.textContent).not.toContain('Send a message to start the conversation.');
  });

  it('does not show a blocked HITL result before the workflow runs', async () => {
    await act(async () =>
      root.render(
        <OutputPanel
          kind="hitl"
          output={null}
          priorOutput={null}
          sources={[]}
          totalMs={0}
          streamingText=""
          streamingModel=""
          streamingTokenCount={0}
          activeTab="result"
          setActiveTab={vi.fn()}
          onHitlApprove={vi.fn()}
          onHitlReject={vi.fn()}
          error={null}
        />,
      ),
    );

    expect(container.textContent).toContain('(no output)');
    expect(container.textContent).not.toContain('Action blocked');
  });

  it('renders the HITL final message without duplicating the status label', async () => {
    await act(async () =>
      root.render(
        <OutputPanel
          kind="hitl"
          output={{
            classified: { amount: 500, urgency: 'critical', reasoning: 'Needs review' },
            decision: 'approved',
            executed: true,
            message: 'Action executed: critical-$500 action approved.',
          }}
          priorOutput={null}
          sources={[]}
          totalMs={10}
          streamingText=""
          streamingModel=""
          streamingTokenCount={0}
          activeTab="result"
          setActiveTab={vi.fn()}
          onHitlApprove={vi.fn()}
          onHitlReject={vi.fn()}
          error={null}
        />,
      ),
    );

    expect(container.textContent).toContain('Action executed: critical-$500 action approved.');
    expect(container.textContent).not.toContain('Action executed: Action executed');
  });
});
