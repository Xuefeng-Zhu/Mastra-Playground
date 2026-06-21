import { useState, useRef, useEffect } from 'react';
import type { PlaygroundExample } from '../registry/examples';
import { MODEL_OPTIONS } from '../registry/examples';
import { FormFieldView, SamplesGroup } from './FormField';
import { TracePane, type TimelineEntry } from './TracePane';
import { OutputPanel } from './OutputPanel';
import { useWorkspace } from '../hooks/useWorkspace';

interface WorkspaceProps {
  example: PlaygroundExample;
}

export function Workspace({ example }: WorkspaceProps) {
  const ws = useWorkspace(example);
  const [model, setModel] = useState(MODEL_OPTIONS[0].value);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

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

  // Trace timeline updates driven by the workspace state. We add one row
  // per activeNode transition; the previous ternary `kind: ... === 'idle'
  // ? 'step' : 'step'` always returned 'step', so timeline pills never
  // differentiated node kinds. Map the active node id back to the
  // example's GRAPH definition so the pill picks up the kind colors.
  useEffect(() => {
    if (ws.activeNode === 'idle') return; // skip initial-mount idle
    const graphNode = example.graph.nodes.find((n) => n.id === ws.activeNode);
    const kind = graphNode?.kind ?? 'step';
    setTimeline((prev) => [
      ...prev,
      {
        id: String(prev.length + 1),
        ts: ws.runStart ? performance.now() - ws.runStart : 0,
        kind: kind === 'passthrough' ? 'step' : (kind as TimelineEntry['kind']),
        msg: ws.activeNode,
        step: ws.activeNode,
        active: ws.activeNode !== 'suspended',
      },
    ]);
  }, [ws.activeNode, ws.runStart, example.graph]);

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
    setTimeline([]); // reset timeline on new run
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
