/**
 * useWorkspace — the central state hook for an example's workspace.
 *
 * Holds the per-run state (output, sources, streaming buffer, prior run
 * for Compare, etc.) and exposes the imperative actions (run, abort,
 * resume HITL, switch output tab). The hook also opens the SSE stream
 * and dispatches incoming events to the per-example trace handler.
 *
 * One hook per example activation. When the user clicks a different
 * rail item, the parent re-mounts <Workspace> and this hook re-initializes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaygroundExample } from '../registry/examples';
import type { TraceEvent } from '../registry/utils';
import type { CapturedSource } from '../registry/renderers';
import { exampleNameToId } from '../registry/utils';

export type OutputTab = 'result' | 'sources' | 'json' | 'compare';

export function useWorkspace(example: PlaygroundExample) {
  const [output, setOutput] = useState<unknown>(null);
  const [sources, setSources] = useState<CapturedSource[]>([]);
  const [totalMs, setTotalMs] = useState<number>(0);
  const [priorOutput, setPriorOutput] = useState<unknown>(null);
  const [activeTab, setActiveTab] = useState<OutputTab>('result');
  const [streamingText, setStreamingText] = useState('');
  const [streamingModel, setStreamingModel] = useState('');
  const [streamingTokenCount, setStreamingTokenCount] = useState(0);
  const [runStart, setRunStart] = useState<number>(0);
  const [doneCount, setDoneCount] = useState<number>(0);
  const [activeNode, setActiveNode] = useState<string>('idle');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const runStartRef = useRef(0);

  const disposeStream = useCallback((stream: EventSource) => {
    stream.onmessage = null;
    stream.onerror = null;
    stream.close();
    if (eventSourceRef.current === stream) eventSourceRef.current = null;
  }, []);

  // Cleanup the SSE connection on unmount (i.e. when switching rail items).
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        disposeStream(eventSourceRef.current);
      }
    };
  }, [disposeStream]);

  // Handle a single SSE event. `stepId` is the per-step identifier the
  // example emits; fall back to `step` (legacy) only if present.
  const handleEvent = useCallback((ev: TraceEvent) => {
    const t = runStartRef.current ? performance.now() - runStartRef.current : 0;
    const stepId = 'stepId' in ev ? ev.stepId : undefined;
    switch (ev.type) {
      case 'step:start':
        if (stepId) {
          setActiveNode(stepId);
          requestAnimationFrame(() => {
            const g = document.querySelector(`#mp-graph [data-node="${stepId}"]`);
            if (g) {
              g.classList.remove('active', 'done', 'skipped');
              g.classList.add('active');
            }
          });
        }
        break;
      case 'step:end':
        if (stepId) {
          setActiveNode('idle');
          setDoneCount((c) => c + 1);
          requestAnimationFrame(() => {
            const g = document.querySelector(`#mp-graph [data-node="${stepId}"]`);
            if (g) {
              g.classList.remove('active', 'skipped');
              g.classList.add('done');
            }
          });
        }
        break;
      case 'tool:call':
        setSources((prev) => [...prev, { tool: ev.tool, input: ev.input, output: ev.output }]);
        break;
      case 'llm:start':
        if (stepId) setActiveNode(stepId);
        if (ev.model) setStreamingModel(ev.model);
        break;
      case 'llm:end':
        if (stepId) setActiveNode('idle');
        break;
      case 'llm:delta':
        setStreamingText((s) => s + ev.text);
        setStreamingTokenCount((c) => c + 1);
        break;
      case 'suspend':
        // HITL: render the pending approval card immediately.
        setOutput({ classified: ev.payload, token: ev.token });
        setActiveTab('result');
        setActiveNode('suspended');
        break;
      case 'done':
        if (ev.status === 'suspended') {
          // Don't overwrite the pending state set by `suspend`.
          return;
        }
        setTotalMs(ev.totalMs || t);
        if (ev.status === 'success') {
          setOutput(ev.output);
        } else {
          setError((ev.output as { error?: string } | null)?.error ?? 'workflow failed');
        }
        break;
    }
  }, []);

  // Run the workflow.
  const run = useCallback(
    (requestBody: Record<string, unknown>) => {
      // Abort any in-flight stream.
      if (eventSourceRef.current) {
        disposeStream(eventSourceRef.current);
      }
      // Snapshot prior before overwriting. We snapshot when the prior run
      // had any of the example-specific output shapes the Compare tab
      // knows how to render (parallel/triage/research/criticLoop, etc.).
      setOutput((prev: unknown) => {
        if (prev && typeof prev === 'object') {
          const p = prev as Record<string, unknown>;
          if (p.synthesis || p.triage || p.formatted || p.draft) {
            setPriorOutput(prev);
          }
        }
        return null;
      });
      // Reset for new run.
      setSources([]);
      setTotalMs(0);
      setStreamingText('');
      setStreamingModel('');
      setStreamingTokenCount(0);
      setDoneCount(0);
      setActiveNode('idle');
      setError(null);
      setActiveTab('result');
      setRunning(true);

      const start = performance.now();
      runStartRef.current = start;
      setRunStart(start);

      const slug = exampleNameToId(example.num, example.name);
      const fullUrl = `/api/stream/${encodeURIComponent(slug)}?input=${encodeURIComponent(JSON.stringify(requestBody))}`;

      const es = new EventSource(fullUrl);
      eventSourceRef.current = es;

      es.onmessage = (e) => {
        if (eventSourceRef.current !== es) return;
        let ev: TraceEvent;
        try {
          ev = JSON.parse(e.data) as TraceEvent;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('Failed to parse SSE event', err);
          return;
        }
        handleEvent(ev);
        if (ev.type === 'done') {
          disposeStream(es);
          setRunning(false);
        }
      };
      es.onerror = () => {
        if (eventSourceRef.current !== es) return;
        disposeStream(es);
        setError('The workflow stream disconnected before it completed.');
        setRunning(false);
      };
    },
    [disposeStream, example.num, example.name, handleEvent],
  );

  // HITL: resume the suspended workflow with a decision.
  const hitlDecide = useCallback(async (token: string, decision: 'approved' | 'rejected') => {
    try {
      const resp = await fetch(`/api/resume/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const json = (await resp.json().catch(() => null)) as
        | { ok: true; result: { status: string; output?: Record<string, unknown> } }
        | { ok: false; error?: string }
        | null;
      if (!resp.ok || !json) {
        setError(
          json && 'error' in json
            ? json.error || `Resume failed (${resp.status})`
            : `Resume failed (${resp.status})`,
        );
      } else if (json.ok) {
        setOutput((prev: unknown) => {
          const out = json.result.output ?? {};
          const prior = prev && typeof prev === 'object' ? (prev as Record<string, unknown>) : {};
          return {
            ...prior,
            ...out,
            decision,
            executed: !!out.executed,
            message: out.message ?? '',
          };
        });
      } else {
        setError(json.error || 'Resume failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return {
    output,
    sources,
    totalMs,
    priorOutput,
    activeTab,
    setActiveTab,
    streamingText,
    streamingModel,
    streamingTokenCount,
    runStart,
    doneCount,
    activeNode,
    error,
    running,
    run,
    hitlDecide,
  };
}
