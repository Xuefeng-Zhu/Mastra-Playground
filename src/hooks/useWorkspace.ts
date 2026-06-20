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
import type { V2Example } from '../registry/examples.js';
import type { TraceEvent } from '../registry/utils.js';
import type { CapturedSource } from '../registry/renderers.js';

export type OutputTab = 'result' | 'sources' | 'json' | 'compare';

export function useWorkspace(example: V2Example) {
  const [output, setOutput] = useState<any>(null);
  const [sources, setSources] = useState<CapturedSource[]>([]);
  const [totalMs, setTotalMs] = useState<number>(0);
  const [priorOutput, setPriorOutput] = useState<any>(null);
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

  // Reset everything when the example changes (the parent re-mounts this
  // hook by re-mounting <Workspace>, so this effect handles the cleanup).
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        try {
          eventSourceRef.current.close();
        } catch {}
        eventSourceRef.current = null;
      }
    };
  }, []);

  // Reset for a new run
  const reset = useCallback(() => {
    setOutput(null);
    setSources([]);
    setTotalMs(0);
    setStreamingText('');
    setStreamingModel('');
    setStreamingTokenCount(0);
    setDoneCount(0);
    setActiveNode('idle');
    setError(null);
  }, []);

  // Snapshot the prior output for Compare (called before a new run)
  const snapshotPrior = useCallback(() => {
    setOutput((prev: any) => {
      if (prev && (prev.synthesis || prev.triage || prev.formatted)) {
        setPriorOutput(prev);
      }
      return null;
    });
  }, []);

  // Handle a single SSE event
  const handleEvent = useCallback(
    (ev: TraceEvent) => {
      const t = runStart ? performance.now() - runStart : 0;
      const stepId = ev.stepId || ev.step;
      switch (ev.type) {
        case 'step:start':
          if (stepId) {
            setActiveNode(stepId);
            // Mark node active in DOM (used by the graph)
            requestAnimationFrame(() => {
              const g = document.querySelector(`#v2-graph [data-node="${stepId}"]`);
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
              const g = document.querySelector(`#v2-graph [data-node="${stepId}"]`);
              if (g) {
                g.classList.remove('active', 'skipped');
                g.classList.add('done');
              }
            });
          }
          break;
        case 'tool:call':
          if (ev.tool) {
            setSources((prev) => [...prev, { tool: ev.tool as string, input: ev.input, output: ev.output }]);
          }
          break;
        case 'llm:start':
          if (stepId) setActiveNode(stepId);
          if (ev.model) setStreamingModel(ev.model as string);
          break;
        case 'llm:end':
          if (stepId) setActiveNode('idle');
          break;
        case 'llm:delta':
          if (typeof ev.text === 'string') {
            setStreamingText((s) => s + (ev.text as string));
            setStreamingTokenCount((c) => c + 1);
          }
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
            setError(ev.error || (ev.output as any)?.error || 'workflow failed');
          }
          break;
      }
    },
    [runStart],
  );

  // Run the workflow
  const run = useCallback(
    (requestBody: Record<string, unknown>) => {
      // Abort any in-flight stream
      if (eventSourceRef.current) {
        try {
          eventSourceRef.current.close();
        } catch {}
        eventSourceRef.current = null;
      }
      // Snapshot prior before overwriting
      setOutput((prev: any) => {
        if (prev && (prev.synthesis || prev.triage || prev.formatted || prev.draft)) {
          setPriorOutput(prev);
        }
        return null;
      });
      // Reset for new run
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
      setRunStart(start);

      const url = `/api/stream/${encodeURIComponent(example.primTag ? '' : '')}${example.num === 4 ? 'parallel-research' : example.primTag === 'branch' ? 'support-triage' : ''}`;
      // The example's "id" is the kebab-case form we use in the URL.
      // We can derive it from the example's primTag or just hardcode the mapping.
      // Easier: pass the example's API id via a stable key.
      const exampleId = (example as any).__apiId || example.primTag;
      // Fallback: build URL from example name (parallel-research, support-triage, etc.)
      const slug = exampleNameToId(example);
      const fullUrl = `/api/stream/${encodeURIComponent(slug)}?input=${encodeURIComponent(JSON.stringify(requestBody))}`;

      const es = new EventSource(fullUrl);
      eventSourceRef.current = es;

      es.onmessage = (e) => {
        let ev: TraceEvent;
        try {
          ev = JSON.parse(e.data);
        } catch {
          return;
        }
        handleEvent(ev);
        if (ev.type === 'done') {
          es.close();
          eventSourceRef.current = null;
          setRunning(false);
        }
      };
      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        setRunning(false);
      };
    },
    [example, handleEvent],
  );

  // HITL: resume the suspended workflow with a decision
  const hitlDecide = useCallback(async (token: string, decision: 'approved' | 'rejected') => {
    try {
      const resp = await fetch(`/api/resume/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const json = await resp.json();
      if (json.ok) {
        setOutput((prev: any) => ({
          ...(prev || {}),
          ...(json.result.output || {}),
          decision,
          executed: !!json.result.output?.executed,
          message: json.result.output?.message || '',
        }));
      } else {
        setError(json.error || 'Resume failed');
      }
    } catch (err) {
      setError(String(err));
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
    reset,
    snapshotPrior,
    hitlDecide,
    closeStream: () => {
      if (eventSourceRef.current) {
        try {
          eventSourceRef.current.close();
        } catch {}
        eventSourceRef.current = null;
      }
    },
  };
}

// Derive the API example id from the V2Example config. The id is the
// kebab-case version of the example's num + name (e.g. "04-parallel-research").
// We do a simple mapping here; could be made explicit on the config.
function exampleNameToId(ex: V2Example): string {
  const map: Record<string, string> = {
    1: 'support-triage',
    2: 'research',
    3: 'code-review',
    4: 'parallel-research',
    5: 'multi-turn-chat',
    6: 'hitl-approval',
    7: 'streaming-chat',
    8: 'critic-loop',
    9: 'multi-agent-handoff',
    10: 'mastra-memory',
    11: 'content-pipeline',
  };
  return map[ex.num] || ex.name.toLowerCase().replace(/\s+/g, '-');
}
