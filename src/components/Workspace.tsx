import { useState, useRef, useEffect, useMemo } from 'react';
import type { PlaygroundExample } from '../registry/examples';
import { MODEL_OPTIONS } from '../registry/examples';
import { FormFieldView, SamplesGroup } from './FormField';
import { TracePane, type TimelineEntry } from './TracePane';
import { OutputPanel } from './OutputPanel';
import { useWorkspace, type ReceivedTraceEvent } from '../hooks/useWorkspace';

export function traceEventToTimelineEntry(received: ReceivedTraceEvent, active: boolean): TimelineEntry {
  const { event } = received;
  const step = 'stepId' in event ? event.stepId : event.type;
  let kind: TimelineEntry['kind'] = 'step';
  let msg: string;

  switch (event.type) {
    case 'start':
      msg = `Workflow started: ${event.workflow}`;
      break;
    case 'step:start':
      msg = 'Step started';
      break;
    case 'step:end':
      msg = `Step completed${event.durationMs === undefined ? '' : ` in ${event.durationMs}ms`}`;
      break;
    case 'branch:evaluate':
      kind = 'branch';
      msg = `Branch ${event.matched ? 'matched' : 'did not match'}${event.predicate ? `: ${event.predicate}` : ''}`;
      break;
    case 'llm:structured':
      kind = 'llm';
      msg = `Structured output: ${event.schema}`;
      break;
    case 'llm:start':
      kind = 'llm';
      msg = `LLM started${event.model ? `: ${event.model}` : ''}`;
      break;
    case 'llm:delta':
      kind = 'llm';
      msg = `LLM delta #${event.index}: ${event.text}`;
      break;
    case 'llm:end':
      kind = 'llm';
      msg = `LLM completed: ${event.totalChars} chars in ${event.durationMs}ms`;
      break;
    case 'tool:call':
      kind = 'tool';
      msg = `Tool called: ${event.tool}`;
      break;
    case 'suspend':
      kind = 'hitl';
      msg = 'Workflow suspended';
      break;
    case 'resume':
      kind = 'hitl';
      msg = `Workflow resumed: ${event.decision}`;
      break;
    case 'done':
      msg = `Workflow ${event.status}`;
      break;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }

  return { id: received.id, ts: received.ts, kind, msg, step, active };
}

interface WorkspaceProps {
  example: PlaygroundExample;
}

export function Workspace({ example }: WorkspaceProps) {
  const ws = useWorkspace(example);
  const [model, setModel] = useState(MODEL_OPTIONS[0].value);
  const formRef = useRef<HTMLFormElement>(null);
  const timeline = useMemo(
    () =>
      ws.traceEvents.map((event, index) =>
        traceEventToTimelineEntry(event, ws.running && index === ws.traceEvents.length - 1),
      ),
    [ws.running, ws.traceEvents],
  );

  // Persist the model picker across reloads. README "per-example settings"
  // promise — the OLD vanilla app.js did this via localStorage; the new
  // shell had silently dropped it.
  useEffect(() => {
    const saved = localStorage.getItem('mpg:model');
    if (saved && MODEL_OPTIONS.some((o) => o.value === saved)) {
      setModel(saved);
    }
  }, []);
  useEffect(() => {
    localStorage.setItem('mpg:model', model);
  }, [model]);

  // Register the active run() handler with the global so App.tsx's Cmd+Enter
  // shortcut can call it. The handler closes over `ws.run`, which is stable
  // per example.
  useEffect(() => {
    window.__mpg = { run: () => ws.run(getFormBody()) };
    return () => {
      if (window.__mpg?.run) {
        delete window.__mpg.run;
      }
    };
  }, [ws.run, example.num, model]);

  const getFormBody = (): Record<string, unknown> => {
    const form = formRef.current;
    const body: Record<string, unknown> = {};
    if (form) {
      const fd = new FormData(form);
      for (const [k, v] of fd.entries()) {
        body[k] = v;
      }
    }
    body.model = model;
    return body;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    ws.run(getFormBody());
  };

  // The graph container uses a single id (`mp-graph`) so the trace
  // event handler in useWorkspace can mark nodes with a stable selector.
  // The Graph component is keyed by example.num so it remounts on switch.
  const graphContainerId = 'mp-graph';

  return (
    <article
      className="workspace workspace-active"
      id="mp-workspace"
      data-example={`prim-tag-${example.primTags[0]}`}
      data-example-num={example.num}
    >
      <div className="ex-header">
        <div className="ex-header-titles">
          <div className="ex-kicker">
            Example {example.num}{' '}
            {example.primTags.map((tag) => (
              <span key={tag} className={`prim-tag prim-tag-${tag}`}>
                {tag}
              </span>
            ))}
          </div>
          <h1 className="ex-title">{example.name}</h1>
          <p className="ex-desc" dangerouslySetInnerHTML={{ __html: example.description }} />
        </div>
        <div className="ex-header-controls">
          <label className="model-picker">
            <span className="model-label">Model</span>
            <select
              className="model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              title={
                model.includes('/')
                  ? 'Requires OPENAI_BASE_URL=https://openrouter.ai/api/v1 — see README.'
                  : undefined
              }
            >
              {MODEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="main-grid">
        <aside className="input-rail">
          <form
            key={example.num}
            className="input-form"
            data-form-tag={`prim-tag-${example.primTags[0]}`}
            ref={formRef}
            onSubmit={onSubmit}
          >
            {example.form.fields.map((f, i) => (
              <FormFieldView key={i} field={f} disabled={ws.running} />
            ))}
            <SamplesGroup samples={example.form.samples} disabled={ws.running} />
            <button type="submit" className="run-btn" disabled={ws.running}>
              <span className="run-icon">▶</span>
              {ws.running ? 'Running…' : example.runLabel}
              <span className="run-shortcut">⌘↵</span>
            </button>
          </form>
        </aside>

        <TracePane
          graphContainerId={graphContainerId}
          graphDef={example.graph}
          timeline={timeline}
          doneCount={ws.doneCount}
          activeNode={ws.activeNode}
          totalMs={ws.totalMs}
        />
      </div>

      <OutputPanel
        kind={example.output.kind}
        output={ws.output}
        priorOutput={ws.priorOutput}
        sources={ws.sources}
        totalMs={ws.totalMs}
        streamingText={ws.streamingText}
        streamingModel={ws.streamingModel}
        streamingTokenCount={ws.streamingTokenCount}
        activeTab={ws.activeTab}
        setActiveTab={ws.setActiveTab}
        onHitlApprove={(t) => ws.hitlDecide(t, 'approved')}
        onHitlReject={(t) => ws.hitlDecide(t, 'rejected')}
        error={ws.error}
      />
    </article>
  );
}
