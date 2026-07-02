// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TraceEvent } from '../registry/utils';
import { useTraceStream } from './useTraceStream';

type TraceStream = ReturnType<typeof useTraceStream>;

function Harness({
  expose,
  onEvent,
  onError,
}: {
  expose: (stream: TraceStream) => void;
  onEvent: (event: TraceEvent, elapsedMs: number) => void;
  onError: (error: unknown) => void;
}) {
  const stream = useTraceStream({ onEvent, onError });
  useEffect(() => {
    expose(stream);
  }, [expose, stream]);
  return <div data-running={stream.running}>{stream.traceEvents.length}</div>;
}

function doneEvent(totalMs = 10): TraceEvent {
  return { type: 'done', status: 'success', output: { ok: true }, totalMs };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useTraceStream', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let stream: TraceStream | undefined;
  let onEvent: ReturnType<typeof vi.fn<(event: TraceEvent, elapsedMs: number) => void>>;
  let onError: ReturnType<typeof vi.fn<(error: unknown) => void>>;

  beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onEvent = vi.fn<(event: TraceEvent, elapsedMs: number) => void>();
    onError = vi.fn<(error: unknown) => void>();
    await act(async () =>
      root.render(<Harness expose={(value) => (stream = value)} onEvent={onEvent} onError={onError} />),
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('records events and clears running after a terminal done event', async () => {
    const beforeStart = vi.fn();

    act(() =>
      stream!.start(async ({ onEvent: receive }) => {
        receive({
          type: 'start',
          workflow: 'test',
          input: {},
          steps: [{ id: 'step-1', label: 'Step 1', kind: 'tool' }],
        });
        receive(doneEvent(12));
      }, beforeStart),
    );
    await settle();

    expect(beforeStart).toHaveBeenCalledTimes(1);
    expect(container.firstElementChild?.getAttribute('data-running')).toBe('false');
    expect(stream!.traceEvents.map(({ id, event }) => [id, event.type])).toEqual([
      ['1', 'start'],
      ['2', 'done'],
    ]);
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  });

  it('aborts a replaced stream and ignores stale events from it', async () => {
    let firstSignal: AbortSignal | undefined;
    let firstReceive: ((event: TraceEvent) => void) | undefined;

    act(() =>
      stream!.start(async ({ signal, onEvent: receive }) => {
        firstSignal = signal;
        firstReceive = receive;
        await new Promise(() => undefined);
      }, vi.fn()),
    );

    act(() =>
      stream!.start(async ({ onEvent: receive }) => {
        receive({ type: 'step:start', stepId: 'fresh' });
        receive(doneEvent(5));
      }),
    );
    await settle();

    act(() => firstReceive?.({ type: 'step:start', stepId: 'stale' }));

    expect(firstSignal?.aborted).toBe(true);
    expect(stream!.traceEvents.map(({ event }) => event.type)).toEqual(['step:start', 'done']);
    expect(stream!.traceEvents.map(({ event }) => ('stepId' in event ? event.stepId : undefined))).toEqual([
      'fresh',
      undefined,
    ]);
  });

  it('clears running and reports non-aborted runner errors', async () => {
    const err = new Error('stream failed');

    act(() =>
      stream!.start(async () => {
        throw err;
      }),
    );
    await settle();

    expect(container.firstElementChild?.getAttribute('data-running')).toBe('false');
    expect(onError).toHaveBeenCalledWith(err);
  });

  it('aborts an active stream when unmounted', async () => {
    let signal: AbortSignal | undefined;
    act(() =>
      stream!.start(async ({ signal: currentSignal }) => {
        signal = currentSignal;
        await new Promise(() => undefined);
      }),
    );

    await act(async () => root.unmount());

    expect(signal?.aborted).toBe(true);
  });
});
