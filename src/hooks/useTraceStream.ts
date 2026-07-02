import { useCallback, useEffect, useRef, useState } from 'react';
import type { TraceEvent } from '../registry/utils';

export interface ReceivedTraceEvent {
  id: string;
  ts: number;
  event: TraceEvent;
}

type TraceStreamRunner = (params: {
  signal: AbortSignal;
  onEvent: (event: TraceEvent) => void;
}) => Promise<void>;

interface TraceStreamOptions {
  onEvent: (event: TraceEvent, elapsedMs: number) => void;
  onError: (error: unknown) => void;
}

export function useTraceStream({ onEvent, onError }: TraceStreamOptions) {
  const [running, setRunning] = useState(false);
  const [traceEvents, setTraceEvents] = useState<ReceivedTraceEvent[]>([]);
  const requestRef = useRef<AbortController | null>(null);
  const runStartRef = useRef(0);
  const traceEventIdRef = useRef(0);

  const disposeStream = useCallback((request: AbortController) => {
    request.abort();
    if (requestRef.current === request) requestRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (requestRef.current) {
        disposeStream(requestRef.current);
      }
    };
  }, [disposeStream]);

  const start = useCallback(
    (run: TraceStreamRunner, beforeStart?: () => void) => {
      if (requestRef.current) {
        disposeStream(requestRef.current);
      }

      beforeStart?.();
      setRunning(true);
      setTraceEvents([]);
      traceEventIdRef.current = 0;
      runStartRef.current = performance.now();

      const request = new AbortController();
      requestRef.current = request;

      const receive = (event: TraceEvent) => {
        if (requestRef.current !== request) return;
        const ts = runStartRef.current ? performance.now() - runStartRef.current : 0;
        const id = String(++traceEventIdRef.current);
        setTraceEvents((previous) => [...previous, { id, ts, event }]);
        onEvent(event, ts);
        if (event.type === 'done') {
          requestRef.current = null;
          setRunning(false);
        }
      };

      void (async () => {
        try {
          await run({ signal: request.signal, onEvent: receive });
        } catch (err) {
          if (request.signal.aborted || requestRef.current !== request) return;
          requestRef.current = null;
          setRunning(false);
          onError(err);
        }
      })();
    },
    [disposeStream, onError, onEvent],
  );

  return { running, traceEvents, start };
}
