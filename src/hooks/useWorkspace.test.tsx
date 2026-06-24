// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from '../registry/examples';
import { useWorkspace } from './useWorkspace';

function Harness({
  expose,
  example = EXAMPLES.research,
}: {
  expose: (workspace: ReturnType<typeof useWorkspace>) => void;
  example?: (typeof EXAMPLES)[keyof typeof EXAMPLES];
}) {
  const workspace = useWorkspace(example);
  useEffect(() => {
    expose(workspace);
  }, [expose, workspace]);
  return (
    <div
      data-running={workspace.running}
      data-error={workspace.error ?? ''}
      data-active={workspace.activeNode}
      data-done={workspace.doneCount}
    >
      {workspace.totalMs}
    </div>
  );
}

function sseResponse(events: unknown[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useWorkspace stream lifecycle', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
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
  });

  it('uses POST and aborts a request replaced by a newer run', async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    let workspace: ReturnType<typeof useWorkspace> | undefined;
    await act(async () => root.render(<Harness expose={(value) => (workspace = value)} />));

    act(() => workspace!.run({ topic: 'first private prompt' }));
    const firstInit = fetchMock.mock.calls[0][1] as RequestInit;
    act(() => workspace!.run({ topic: 'second' }));

    expect(fetchMock.mock.calls[0][0]).toBe('/api/stream/research');
    expect(firstInit.method).toBe('POST');
    expect(firstInit.body).toContain('first private prompt');
    expect((firstInit.signal as AbortSignal).aborted).toBe(true);
  });

  it('records parsed events and completes a successful stream', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        { type: 'start', workflow: 'research', input: {}, steps: [] },
        { type: 'step:start', stepId: 'research' },
        { type: 'step:end', stepId: 'research', durationMs: 4 },
        { type: 'done', status: 'success', output: { formatted: 'ok' }, totalMs: 12 },
      ]),
    );
    let workspace: ReturnType<typeof useWorkspace> | undefined;
    await act(async () => root.render(<Harness expose={(value) => (workspace = value)} />));
    act(() => workspace!.run({ topic: 'events' }));
    await settle();

    expect(workspace!.traceEvents.map(({ event }) => event.type)).toEqual([
      'start',
      'step:start',
      'step:end',
      'done',
    ]);
    expect(container.firstElementChild?.getAttribute('data-running')).toBe('false');
    expect(container.firstElementChild?.getAttribute('data-active')).toBe('idle');
    expect(container.textContent).toBe('12');
  });

  it('clears the active node and surfaces a terminal workflow error', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        { type: 'step:start', stepId: 'research' },
        { type: 'done', status: 'failed', output: { error: 'provider unavailable' }, totalMs: 8 },
      ]),
    );
    let workspace: ReturnType<typeof useWorkspace> | undefined;
    await act(async () => root.render(<Harness expose={(value) => (workspace = value)} />));
    act(() => workspace!.run({ topic: 'failure' }));
    await settle();

    expect(container.firstElementChild?.getAttribute('data-running')).toBe('false');
    expect(container.firstElementChild?.getAttribute('data-active')).toBe('idle');
    expect(container.firstElementChild?.getAttribute('data-error')).toBe('provider unavailable');
  });

  it('uses the nested HITL suspend payload as the pending classification', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        {
          type: 'suspend',
          token: 'run-token',
          payload: { classified: { amount: 500, urgency: 'critical', reasoning: 'Needs approval' } },
        },
        { type: 'done', status: 'suspended', output: { token: 'run-token' }, totalMs: 8 },
      ]),
    );
    let workspace: ReturnType<typeof useWorkspace> | undefined;
    await act(async () =>
      root.render(<Harness example={EXAMPLES['hitl-approval']} expose={(value) => (workspace = value)} />),
    );
    act(() => workspace!.run({ action: 'Refund $500', actionType: 'refund' }));
    await settle();

    expect(workspace!.output).toEqual({
      token: 'run-token',
      classified: { amount: 500, urgency: 'critical', reasoning: 'Needs approval' },
    });
    expect(container.firstElementChild?.getAttribute('data-active')).toBe('suspended');
  });
});
