// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from '../registry/examples';
import { useWorkspace } from './useWorkspace';

class MockEventSource {
  static instances: MockEventSource[] = [];
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }
}

function Harness({ expose }: { expose: (workspace: ReturnType<typeof useWorkspace>) => void }) {
  const workspace = useWorkspace(EXAMPLES.research);
  useEffect(() => {
    expose(workspace);
  }, [expose, workspace]);
  return (
    <div data-running={workspace.running} data-error={workspace.error ?? ''}>
      {workspace.totalMs}
    </div>
  );
}

describe('useWorkspace stream lifecycle', () => {
  const originalEventSource = globalThis.EventSource;
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    if (originalEventSource) globalThis.EventSource = originalEventSource;
  });

  it('ignores callbacks from a stream replaced by a newer run', async () => {
    let workspace: ReturnType<typeof useWorkspace> | undefined;
    await act(async () => root.render(<Harness expose={(value) => (workspace = value)} />));

    act(() => workspace!.run({ topic: 'first' }));
    const first = MockEventSource.instances[0];
    const staleError = first.onerror;

    act(() => workspace!.run({ topic: 'second' }));
    const second = MockEventSource.instances[1];
    expect(first.close).toHaveBeenCalledOnce();

    act(() => staleError?.());
    expect(container.firstElementChild?.getAttribute('data-running')).toBe('true');
    expect(container.firstElementChild?.getAttribute('data-error')).toBe('');

    act(() => second.onerror?.());
    expect(container.firstElementChild?.getAttribute('data-running')).toBe('false');
    expect(container.firstElementChild?.getAttribute('data-error')).toBe(
      'The workflow stream disconnected before it completed.',
    );
  });

  it('closes the active stream after a done event', async () => {
    let workspace: ReturnType<typeof useWorkspace> | undefined;
    await act(async () => root.render(<Harness expose={(value) => (workspace = value)} />));
    act(() => workspace!.run({ topic: 'done' }));
    const stream = MockEventSource.instances[0];

    act(() =>
      stream.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'done', status: 'success', output: { formatted: 'ok' }, totalMs: 12 }),
        }),
      ),
    );

    expect(stream.close).toHaveBeenCalledOnce();
    expect(container.firstElementChild?.getAttribute('data-running')).toBe('false');
    expect(container.textContent).toBe('12');
  });

  it('records every parsed SSE event in receipt order', async () => {
    let workspace: ReturnType<typeof useWorkspace> | undefined;
    await act(async () => root.render(<Harness expose={(value) => (workspace = value)} />));
    act(() => workspace!.run({ topic: 'events' }));
    const stream = MockEventSource.instances[0];
    const events = [
      { type: 'start', workflow: 'research', input: {}, steps: [] },
      { type: 'branch:evaluate', stepId: 'branch.route', matched: true, predicate: 'has sources' },
      { type: 'llm:delta', stepId: 'synthesize', text: 'Hello', index: 0 },
      { type: 'llm:delta', stepId: 'synthesize', text: ' world', index: 1 },
      { type: 'done', status: 'success', output: { formatted: 'ok' }, totalMs: 12 },
    ];

    for (const event of events) {
      act(() =>
        stream.onmessage?.(
          new MessageEvent('message', {
            data: JSON.stringify(event),
          }),
        ),
      );
    }

    expect(workspace!.traceEvents.map(({ event }) => event.type)).toEqual([
      'start',
      'branch:evaluate',
      'llm:delta',
      'llm:delta',
      'done',
    ]);
    expect(workspace!.traceEvents.map(({ id }) => id)).toEqual(['1', '2', '3', '4', '5']);
  });
});
