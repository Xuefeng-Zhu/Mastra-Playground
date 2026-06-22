import type { TraceEvent } from '../registry/utils';

/** Incremental parser for the subset of SSE used by the trace endpoint. */
export function createTraceEventParser(onEvent: (event: TraceEvent) => void) {
  let buffer = '';

  const drain = (flush = false) => {
    const normalized = buffer.replaceAll('\r\n', '\n');
    const frames = normalized.split('\n\n');
    buffer = flush ? '' : (frames.pop() ?? '');

    for (const frame of frames) {
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      onEvent(JSON.parse(data) as TraceEvent);
    }
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      drain();
    },
    finish() {
      if (buffer.trim()) buffer += '\n\n';
      drain(true);
    },
  };
}
