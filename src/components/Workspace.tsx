import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { PlaygroundExample } from '../registry/examples';
import { PROVIDER_OPTIONS } from '../registry/examples';
import { FormFieldView, SamplesGroup } from './FormField';
import { TracePane, type TimelineEntry } from './TracePane';
import { OutputPanel } from './OutputPanel';
import { SourceViewer } from './SourceViewer';
import { CustomProviderModal } from './CustomProviderModal';
import { useWorkspace, type ReceivedTraceEvent } from '../hooks/useWorkspace';
import { useModelPreferences } from '../hooks/useModelPreferences';

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

  return {
    id: received.id,
    ts: received.ts,
    kind,
    msg,
    step,
    active,
    eventType: event.type,
    payload: event,
  };
}

interface WorkspaceProps {
  example: PlaygroundExample;
}

export function Workspace({ example }: WorkspaceProps) {
  const ws = useWorkspace(example);
  const preferences = useModelPreferences();
  const [showSource, setShowSource] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const timeline = useMemo(
    () =>
      ws.traceEvents.map((event, index) =>
        traceEventToTimelineEntry(event, ws.running && index === ws.traceEvents.length - 1),
      ),
    [ws.running, ws.traceEvents],
  );

  const getFormBody = useCallback((): Record<string, unknown> => {
    const form = formRef.current;
    const body: Record<string, unknown> = {};
    if (form) {
      const fd = new FormData(form);
      for (const [k, v] of fd.entries()) {
        body[k] = v;
      }
    }
    return preferences.addToRequest(body);
  }, [preferences.addToRequest]);

  useEffect(() => {
    window.__mpg = { run: () => ws.run(getFormBody()) };
    return () => {
      if (window.__mpg?.run) delete window.__mpg.run;
    };
  }, [ws.run, getFormBody]);

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
          <button
            type="button"
            className="view-source-btn"
            title="View example source code"
            aria-label="View source code"
            onClick={() => setShowSource(true)}
          >
            <span className="view-source-icon">{'</>'}</span>
            Source
          </button>
          <label className="model-picker">
            <span className="model-label">Provider</span>
            <select
              className="model-select"
              value={preferences.provider}
              onChange={(event) => {
                const nextProvider = PROVIDER_OPTIONS.find(
                  ({ value }) => value === event.target.value,
                )?.value;
                if (!nextProvider) return;
                preferences.selectProvider(nextProvider);
              }}
            >
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {preferences.provider !== 'custom' && (
            <label className="model-picker">
              <span className="model-label">Model</span>
              <select
                className="model-select"
                value={preferences.model}
                onChange={(e) => preferences.setModel(e.target.value)}
                title={
                  preferences.provider === 'google'
                    ? 'Uses GOOGLE_GENERATIVE_AI_API_KEY — see README.'
                    : 'Uses OPENAI_API_KEY with the OpenRouter endpoint — see README.'
                }
              >
                {preferences.modelOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {preferences.provider === 'custom' && (
            <button
              type="button"
              className="custom-configure-btn"
              title="Configure custom endpoint"
              onClick={() => setShowCustomModal(true)}
            >
              <span className="custom-configure-icon">⚙</span>
              {preferences.customModel || 'Configure'}
            </button>
          )}
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
          completedNodes={ws.completedNodes}
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

      {showSource && (
        <SourceViewer
          exampleNum={example.num}
          exampleName={example.name}
          onClose={() => setShowSource(false)}
        />
      )}

      {showCustomModal && (
        <CustomProviderModal
          baseUrl={preferences.customBaseUrl}
          apiKey={preferences.customApiKey}
          model={preferences.customModel}
          onBaseUrlChange={preferences.setCustomBaseUrl}
          onApiKeyChange={preferences.setCustomApiKey}
          onModelChange={preferences.setCustomModel}
          onClear={preferences.clearCustomSettings}
          onClose={() => setShowCustomModal(false)}
        />
      )}
    </article>
  );
}
