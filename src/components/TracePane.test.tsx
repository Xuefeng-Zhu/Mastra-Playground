// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GRAPHS } from '../registry/graphs';
import { TracePane } from './TracePane';

describe('TracePane', () => {
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

  it('switches between the combined, graph, and events views', async () => {
    await act(async () =>
      root.render(
        <TracePane
          graphContainerId="test-graph"
          graphDef={GRAPHS['support-triage']}
          timeline={[]}
          doneCount={0}
          activeNode="idle"
          totalMs={0}
        />,
      ),
    );

    const graphPanel = container.querySelector<HTMLElement>('#trace-graph-panel')!;
    const eventsPanel = container.querySelector<HTMLElement>('#trace-events-panel')!;
    const button = (label: string) =>
      [...container.querySelectorAll<HTMLButtonElement>('.trace-tab')].find(
        (candidate) => candidate.textContent === label,
      )!;

    expect(button('Trace').getAttribute('aria-selected')).toBe('true');
    expect(graphPanel.hidden).toBe(false);
    expect(eventsPanel.hidden).toBe(false);

    await act(async () => button('Graph').click());
    expect(button('Graph').getAttribute('aria-selected')).toBe('true');
    expect(graphPanel.hidden).toBe(false);
    expect(eventsPanel.hidden).toBe(true);

    await act(async () => button('Events').click());
    expect(button('Events').getAttribute('aria-selected')).toBe('true');
    expect(graphPanel.hidden).toBe(true);
    expect(eventsPanel.hidden).toBe(false);

    await act(async () => button('Trace').click());
    expect(button('Trace').getAttribute('aria-selected')).toBe('true');
    expect(graphPanel.hidden).toBe(false);
    expect(eventsPanel.hidden).toBe(false);
  });

  it('supports arrow-key tab navigation', async () => {
    await act(async () =>
      root.render(
        <TracePane
          graphContainerId="test-graph"
          graphDef={GRAPHS['support-triage']}
          timeline={[]}
          doneCount={0}
          activeNode="idle"
          totalMs={0}
        />,
      ),
    );
    const trace = container.querySelector<HTMLButtonElement>('[data-tab="trace"]')!;
    trace.focus();
    await act(async () =>
      trace.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
    );
    const graph = container.querySelector<HTMLButtonElement>('[data-tab="graph"]')!;
    expect(document.activeElement).toBe(graph);
    expect(graph.getAttribute('aria-selected')).toBe('true');
  });

  it('reveals the full payload for each timeline event', async () => {
    await act(async () =>
      root.render(
        <TracePane
          graphContainerId="test-graph"
          graphDef={GRAPHS['support-triage']}
          timeline={[
            {
              id: 'event-1',
              ts: 125,
              kind: 'tool',
              msg: 'Tool called: lookup-account',
              step: 'lookup',
              active: false,
              eventType: 'tool:call',
              payload: {
                type: 'tool:call',
                stepId: 'lookup',
                tool: 'lookup-account',
                input: { accountId: 'acct-42' },
                output: { plan: 'pro' },
              },
            },
          ]}
          doneCount={1}
          activeNode="idle"
          totalMs={125}
        />,
      ),
    );

    const event = container.querySelector<HTMLDetailsElement>('.tl-event')!;
    expect(event.open).toBe(false);
    expect(event.querySelector('.tl-detail')?.textContent).toContain('lookup-account');
    expect(event.querySelector('pre')?.textContent).toContain('"accountId": "acct-42"');

    await act(async () => event.querySelector<HTMLElement>('summary')!.click());
    expect(event.open).toBe(true);
  });
});
