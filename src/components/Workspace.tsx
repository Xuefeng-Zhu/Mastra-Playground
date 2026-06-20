import { useState, useRef, useEffect } from 'react';
import type { V2Example } from '../registry/examples.js';
import { V2_MODEL_OPTIONS } from '../registry/examples.js';
import { FormFieldView, SamplesGroup } from './FormField.js';
import { TracePane, type TimelineEntry } from './TracePane.js';
import { OutputPanel } from './OutputPanel.js';
import { useWorkspace, type OutputTab } from '../hooks/useWorkspace.js';
import { formatSec, escapeText } from '../registry/utils.js';

interface WorkspaceProps {
  example: V2Example;
}

export function Workspace({ example }: WorkspaceProps) {
  const ws = useWorkspace(example);
  const [model, setModel] = useState(V2_MODEL_OPTIONS[0].value);
  const [traceTab, setTraceTab] = useState<'trace' | 'graph' | 'events'>('trace');
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  // Trace timeline updates driven by the workspace state
  useEffect(() => {
    setTimeline((prev) => [
      ...prev,
      {
        id: String(prev.length + 1),
        ts: ws.runStart ? performance.now() - ws.runStart : 0,
        kind: ws.activeNode === 'idle' ? 'step' : 'step',
        msg: ws.activeNode === 'suspended' ? 'suspended' : ws.activeNode,
        step: ws.activeNode,
        active: ws.activeNode !== 'idle' && ws.activeNode !== 'suspended',
      },
    ]);
    // We only want a single entry per activeNode change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.activeNode]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);
    const body: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) {
      body[k] = v;
    }
    body.model = model;
    setTimeline([]); // reset timeline on new run
    ws.run(body);
  };

  // The graph container uses a single id (`v2-graph`) so the trace
  // event handler in useWorkspace can mark nodes with a stable selector.
  // The Graph component is keyed by example.num so it remounts on switch.
  const graphContainerId = 'v2-graph';

  return (
    <article
      className="workspace-v2 workspace-v2-active"
      id="v2-workspace"
      data-example={example.primTagClass}
    >
      <div className="ex-header">
        <div className="ex-header-titles">
          <div className="ex-kicker">
            Example {example.num}{' '}
            <span className={`prim-tag ${example.primTagClass}`}>{example.primTag}</span>
          </div>
          <h1 className="ex-title">{example.name}</h1>
          <p className="ex-desc" dangerouslySetInnerHTML={{ __html: example.description }} />
        </div>
        <div className="ex-header-controls">
          <label className="model-picker">
            <span className="model-label">Model</span>
            <select className="v2-model-select" value={model} onChange={(e) => setModel(e.target.value)}>
              {V2_MODEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button className="icon-btn" title="Settings" aria-label="Settings">
            ⚙
          </button>
        </div>
      </div>

      <div className="v2-grid">
        <aside className="input-rail">
          <form
            key={example.num}
            className="v2-form"
            data-form-v2={example.primTagClass}
            ref={formRef}
            onSubmit={onSubmit}
          >
            {example.form.fields.map((f, i) => (
              <FormFieldView key={i} field={f} disabled={ws.running} />
            ))}
            <SamplesGroup samples={example.form.samples} disabled={ws.running} />
            <details className="input-section">
              <summary>
                Recent runs <span className="muted v2-recent-count">(0)</span>
              </summary>
              <div className="recent v2-recent-list"></div>
            </details>
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
          sourceCount={ws.sources.length}
          hasSources={example.output.kind === 'parallel'}
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
