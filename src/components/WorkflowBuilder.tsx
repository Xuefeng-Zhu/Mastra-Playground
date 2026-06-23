import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TracePane, type TimelineEntry } from './TracePane';
import { CustomProviderModal } from './CustomProviderModal';
import { PROVIDER_OPTIONS } from '../registry/examples';
import { CUSTOM_MODEL_OPTION, useModelPreferences } from '../hooks/useModelPreferences';
import { streamCustomWorkflow } from '../hooks/workflow-stream';
import type { ReceivedTraceEvent } from '../hooks/useWorkspace';
import type { TraceEvent } from '../registry/utils';
import type { CapturedSource } from '../registry/renderers';
import {
  CLIENT_CUSTOM_TOOL_OPTIONS,
  cloneSeedWorkflow,
  customWorkflowToGraph,
  CUSTOM_WORKFLOW_STORAGE_KEY,
  type CustomWorkflowDefinition,
  type CustomWorkflowNode,
} from '../registry/custom-workflow';
import { traceEventToTimelineEntry } from './Workspace';

const MAX_NODES = 12;

type BuilderTab = 'result' | 'sources' | 'json';
type BuilderToolId = (typeof CLIENT_CUSTOM_TOOL_OPTIONS)[number]['value'];
type BranchOperator = Extract<CustomWorkflowNode, { type: 'branch' }>['operator'];

function loadInitialWorkflow(): CustomWorkflowDefinition {
  if (typeof window === 'undefined') return cloneSeedWorkflow();
  const saved = window.localStorage.getItem(CUSTOM_WORKFLOW_STORAGE_KEY);
  if (!saved) return cloneSeedWorkflow();
  try {
    const parsed = JSON.parse(saved) as CustomWorkflowDefinition;
    if (parsed.version === 1 && Array.isArray(parsed.nodes)) return parsed;
  } catch {
    window.localStorage.removeItem(CUSTOM_WORKFLOW_STORAGE_KEY);
  }
  return cloneSeedWorkflow();
}

function initialBuilderNotice() {
  if (typeof window === 'undefined') return 'Starter workflow loaded';
  return window.localStorage.getItem(CUSTOM_WORKFLOW_STORAGE_KEY)
    ? 'Saved workflow loaded'
    : 'Starter workflow loaded';
}

function firstConfigurableNodeId(workflow: CustomWorkflowDefinition) {
  return workflow.nodes.find((node) => node.type !== 'input')?.id ?? 'input';
}

function uniqueNodeId(nodes: CustomWorkflowNode[], prefix: string) {
  const used = new Set(nodes.map((node) => node.id));
  let index = 1;
  let candidate = `${prefix}-${index}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${prefix}-${index}`;
  }
  return candidate;
}

function insertBeforeOutput(
  workflow: CustomWorkflowDefinition,
  node: CustomWorkflowNode,
): CustomWorkflowDefinition {
  const outputIndex = workflow.nodes.findIndex((candidate) => candidate.type === 'output');
  const output = workflow.nodes[outputIndex];
  const incoming = output ? workflow.edges.find((edge) => edge.to === output.id) : undefined;
  const previous = incoming?.from ?? 'input';
  const nodes =
    outputIndex >= 0
      ? [...workflow.nodes.slice(0, outputIndex), node, ...workflow.nodes.slice(outputIndex)]
      : [...workflow.nodes, node];
  const edges = workflow.edges.filter((edge) => edge !== incoming);
  return {
    ...workflow,
    nodes,
    edges: output ? [...edges, { from: previous, to: node.id }, { from: node.id, to: output.id }] : edges,
  };
}

function removeNode(workflow: CustomWorkflowDefinition, nodeId: string): CustomWorkflowDefinition {
  const node = workflow.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.type === 'input' || node.type === 'output') return workflow;
  const incoming = workflow.edges.find((edge) => edge.to === nodeId);
  const outgoing = workflow.edges.find((edge) => edge.from === nodeId);
  const edges = workflow.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
  if (incoming && outgoing) edges.push({ from: incoming.from, to: outgoing.to });
  return {
    ...workflow,
    nodes: workflow.nodes.filter((candidate) => candidate.id !== nodeId),
    edges,
  };
}

function JsonBlock({ value }: { value: unknown }) {
  return <pre className="json-pre">{JSON.stringify(value, null, 2)}</pre>;
}

function TextField({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="builder-field">
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} rows={4} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input type="text" value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function BuilderOutput({
  activeTab,
  setActiveTab,
  output,
  sources,
  error,
}: {
  activeTab: BuilderTab;
  setActiveTab: (tab: BuilderTab) => void;
  output: unknown;
  sources: CapturedSource[];
  error: string | null;
}) {
  const out = output && typeof output === 'object' ? (output as { answer?: unknown }) : null;
  return (
    <section className="output-panel builder-output" aria-label="Custom workflow output">
      <div className="output-tabs" role="tablist" aria-label="Custom workflow output view">
        {(['result', 'sources', 'json'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`output-tab ${activeTab === tab ? 'output-tab-active' : ''}`}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'result' ? 'Result' : tab === 'sources' ? `Sources (${sources.length})` : 'Raw JSON'}
          </button>
        ))}
      </div>
      <div className="output-body">
        <div className="output-content prose">
          {error ? <p className="muted output-error">⚠ {error}</p> : null}
          {!error && activeTab === 'result' ? (
            output ? (
              <p className="response-text">{String(out?.answer ?? '')}</p>
            ) : (
              <p className="muted">Run the custom workflow to see output.</p>
            )
          ) : null}
          {!error && activeTab === 'sources' ? (
            sources.length > 0 ? (
              <JsonBlock value={sources} />
            ) : (
              <p className="muted">No tool calls captured yet.</p>
            )
          ) : null}
          {!error && activeTab === 'json' ? <JsonBlock value={output ?? {}} /> : null}
        </div>
      </div>
    </section>
  );
}

function NodeInspector({
  node,
  nodes,
  onUpdate,
  onDelete,
}: {
  node: CustomWorkflowNode | undefined;
  nodes: CustomWorkflowNode[];
  onUpdate: (node: CustomWorkflowNode) => void;
  onDelete: () => void;
}) {
  if (!node) return <p className="muted">Select a node to edit its settings.</p>;
  const targetOptions = nodes.filter((candidate) => candidate.id !== node.id);

  return (
    <div className="builder-inspector-fields">
      <TextField label="Label" value={node.label} onChange={(label) => onUpdate({ ...node, label })} />
      {node.type === 'input' ? <p className="muted">The input node receives the run prompt.</p> : null}
      {node.type === 'llm' ? (
        <>
          <TextField
            label="Instruction"
            value={node.instruction}
            multiline
            onChange={(instruction) => onUpdate({ ...node, instruction })}
          />
          <TextField
            label="Prompt template"
            value={node.promptTemplate}
            multiline
            onChange={(promptTemplate) => onUpdate({ ...node, promptTemplate })}
          />
          <TextField
            label="Output key"
            value={node.outputKey}
            onChange={(outputKey) => onUpdate({ ...node, outputKey })}
          />
        </>
      ) : null}
      {node.type === 'tool' ? (
        <>
          <label className="builder-field">
            <span>Tool</span>
            <select
              value={node.toolId}
              onChange={(event) =>
                onUpdate({
                  ...node,
                  toolId: event.target.value as BuilderToolId,
                })
              }
            >
              {CLIENT_CUSTOM_TOOL_OPTIONS.map((tool) => (
                <option key={tool.value} value={tool.value}>
                  {tool.label}
                </option>
              ))}
            </select>
          </label>
          <TextField
            label="Input template"
            value={node.inputTemplate}
            multiline
            onChange={(inputTemplate) => onUpdate({ ...node, inputTemplate })}
          />
          <TextField
            label="Output key"
            value={node.outputKey}
            onChange={(outputKey) => onUpdate({ ...node, outputKey })}
          />
        </>
      ) : null}
      {node.type === 'branch' ? (
        <>
          <TextField
            label="Source key"
            value={node.sourceKey}
            onChange={(sourceKey) => onUpdate({ ...node, sourceKey })}
          />
          <label className="builder-field">
            <span>Operator</span>
            <select
              value={node.operator}
              onChange={(event) =>
                onUpdate({
                  ...node,
                  operator: event.target.value as BranchOperator,
                })
              }
            >
              <option value="contains">contains</option>
              <option value="equals">equals</option>
              <option value="nonEmpty">nonEmpty</option>
            </select>
          </label>
          {node.operator !== 'nonEmpty' ? (
            <TextField
              label="Compare value"
              value={node.value ?? ''}
              onChange={(value) => onUpdate({ ...node, value })}
            />
          ) : null}
          <label className="builder-field">
            <span>True target</span>
            <select
              value={node.trueTarget}
              onChange={(event) => onUpdate({ ...node, trueTarget: event.target.value })}
            >
              {targetOptions.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </label>
          <label className="builder-field">
            <span>False target</span>
            <select
              value={node.falseTarget}
              onChange={(event) => onUpdate({ ...node, falseTarget: event.target.value })}
            >
              {targetOptions.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
      {node.type === 'output' ? (
        <TextField
          label="Output template"
          value={node.template}
          multiline
          onChange={(template) => onUpdate({ ...node, template })}
        />
      ) : null}
      {node.type !== 'input' && node.type !== 'output' ? (
        <button type="button" className="builder-danger-btn" onClick={onDelete}>
          Delete node
        </button>
      ) : null}
    </div>
  );
}

export function WorkflowBuilder() {
  const [workflow, setWorkflow] = useState<CustomWorkflowDefinition>(loadInitialWorkflow);
  const [selectedId, setSelectedId] = useState('draft');
  const [prompt, setPrompt] = useState('Summarize why visual workflow builders help people learn agents.');
  const [importText, setImportText] = useState('');
  const [builderNotice, setBuilderNotice] = useState(initialBuilderNotice);
  const [jsonDrawerOpen, setJsonDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<BuilderTab>('result');
  const [output, setOutput] = useState<unknown>(null);
  const [sources, setSources] = useState<CapturedSource[]>([]);
  const [totalMs, setTotalMs] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [completedNodes, setCompletedNodes] = useState<string[]>([]);
  const [activeNode, setActiveNode] = useState('idle');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [traceEvents, setTraceEvents] = useState<ReceivedTraceEvent[]>([]);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const runStartRef = useRef(0);
  const traceEventIdRef = useRef(0);
  const preferences = useModelPreferences();

  const selectedNode = workflow.nodes.find((node) => node.id === selectedId);
  const graph = useMemo(() => customWorkflowToGraph(workflow), [workflow]);
  const timeline: TimelineEntry[] = useMemo(
    () =>
      traceEvents.map((event, index) =>
        traceEventToTimelineEntry(event, running && index === traceEvents.length - 1),
      ),
    [running, traceEvents],
  );
  const exportedJson = useMemo(() => JSON.stringify(workflow, null, 2), [workflow]);
  const executableNodes = workflow.nodes.filter(
    (node) => node.type !== 'input' && node.type !== 'output',
  ).length;

  const disposeStream = useCallback((request: AbortController) => {
    request.abort();
    if (requestRef.current === request) requestRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (requestRef.current) disposeStream(requestRef.current);
    };
  }, [disposeStream]);

  useEffect(() => {
    if (!workflow.nodes.some((node) => node.id === selectedId)) {
      setSelectedId(firstConfigurableNodeId(workflow));
    }
  }, [selectedId, workflow]);

  useEffect(() => {
    window.__mpg = { run: () => runWorkflow() };
    return () => {
      if (window.__mpg?.run) delete window.__mpg.run;
    };
  });

  const updateNode = (node: CustomWorkflowNode) => {
    setWorkflow((current) => ({
      ...current,
      nodes: current.nodes.map((candidate) => (candidate.id === node.id ? node : candidate)),
    }));
  };

  const addNode = (type: 'llm' | 'tool' | 'branch') => {
    if (workflow.nodes.length >= MAX_NODES) return;
    const output = workflow.nodes.find((node) => node.type === 'output');
    const id = uniqueNodeId(workflow.nodes, type);
    const node: CustomWorkflowNode =
      type === 'llm'
        ? {
            id,
            type,
            label: 'LLM step',
            instruction: 'You are a helpful workflow step.',
            promptTemplate: '{{input.prompt}}',
            outputKey: id.replaceAll('-', '_'),
          }
        : type === 'tool'
          ? {
              id,
              type,
              label: 'Tool step',
              toolId: 'echo',
              inputTemplate: '{{input.prompt}}',
              outputKey: id.replaceAll('-', '_'),
            }
          : {
              id,
              type,
              label: 'Branch',
              sourceKey: 'draft',
              operator: 'nonEmpty',
              trueTarget: output?.id ?? 'output',
              falseTarget: output?.id ?? 'output',
            };
    setWorkflow((current) => insertBeforeOutput(current, node));
    setSelectedId(id);
    setBuilderNotice(`${node.label} added before Output`);
  };

  const resetWorkflow = () => {
    const seed = cloneSeedWorkflow();
    setWorkflow(seed);
    setSelectedId('draft');
    setOutput(null);
    setSources([]);
    setError(null);
    setBuilderNotice('Starter workflow restored');
  };

  const saveWorkflow = () => {
    localStorage.setItem(CUSTOM_WORKFLOW_STORAGE_KEY, JSON.stringify(workflow));
    setBuilderNotice('Draft saved in this browser');
  };

  const loadSavedWorkflow = () => {
    const saved = localStorage.getItem(CUSTOM_WORKFLOW_STORAGE_KEY);
    if (!saved) {
      setBuilderNotice('No saved draft found');
      return;
    }
    const parsed = JSON.parse(saved) as CustomWorkflowDefinition;
    setWorkflow(parsed);
    setSelectedId(firstConfigurableNodeId(parsed));
    setBuilderNotice('Saved draft loaded');
  };

  const importWorkflow = () => {
    try {
      const parsed = JSON.parse(importText) as CustomWorkflowDefinition;
      setWorkflow(parsed);
      setSelectedId(firstConfigurableNodeId(parsed));
      localStorage.setItem(CUSTOM_WORKFLOW_STORAGE_KEY, JSON.stringify(parsed));
      setImportText('');
      setJsonDrawerOpen(false);
      setBuilderNotice('Workflow JSON imported and saved');
    } catch {
      setBuilderNotice('Import failed: JSON could not be parsed');
    }
  };

  const handleEvent = useCallback((event: TraceEvent) => {
    const stepId = 'stepId' in event ? event.stepId : undefined;
    const elapsed = runStartRef.current ? performance.now() - runStartRef.current : 0;
    switch (event.type) {
      case 'step:start':
        if (stepId) setActiveNode(stepId);
        break;
      case 'step:end':
        if (stepId) {
          setActiveNode('idle');
          setDoneCount((count) => count + 1);
          setCompletedNodes((nodes) => (nodes.includes(stepId) ? nodes : [...nodes, stepId]));
        }
        break;
      case 'tool:call':
        setSources((previous) => [
          ...previous,
          { tool: event.tool, input: event.input, output: event.output },
        ]);
        break;
      case 'llm:start':
        if (stepId) setActiveNode(stepId);
        break;
      case 'llm:end':
        setActiveNode('idle');
        break;
      case 'done':
        setTotalMs(event.totalMs || elapsed);
        setActiveNode('idle');
        if (event.status === 'success') {
          setOutput(event.output);
          setBuilderNotice('Run completed');
        } else {
          setError((event.output as { error?: string } | null)?.error ?? 'Workflow failed');
          setBuilderNotice('Run failed');
        }
        break;
      default:
        break;
    }
  }, []);

  const runWorkflow = useCallback(() => {
    if (requestRef.current) disposeStream(requestRef.current);
    setOutput(null);
    setSources([]);
    setTotalMs(0);
    setDoneCount(0);
    setCompletedNodes([]);
    setActiveNode('idle');
    setError(null);
    setActiveTab('result');
    setRunning(true);
    setBuilderNotice('Running custom workflow');
    setTraceEvents([]);
    traceEventIdRef.current = 0;
    runStartRef.current = performance.now();

    const request = new AbortController();
    requestRef.current = request;
    const requestBody = preferences.addToRequest({ workflow, input: { prompt } });

    const receive = (event: TraceEvent) => {
      if (requestRef.current !== request) return;
      const ts = runStartRef.current ? performance.now() - runStartRef.current : 0;
      const id = String(++traceEventIdRef.current);
      setTraceEvents((previous) => [...previous, { id, ts, event }]);
      handleEvent(event);
      if (event.type === 'done') {
        requestRef.current = null;
        setRunning(false);
      }
    };

    void (async () => {
      try {
        await streamCustomWorkflow({ requestBody, signal: request.signal, onEvent: receive });
      } catch (err) {
        if (request.signal.aborted || requestRef.current !== request) return;
        requestRef.current = null;
        setError(err instanceof Error ? err.message : String(err));
        setBuilderNotice('Run failed');
        setActiveNode('idle');
        setRunning(false);
      }
    })();
  }, [disposeStream, handleEvent, preferences, prompt, workflow]);

  const providerLabel =
    PROVIDER_OPTIONS.find((option) => option.value === preferences.provider)?.label.split(' · ')[0] ??
    'Provider';
  const isCustomProvider = preferences.provider === 'custom';

  return (
    <article
      className="workspace workspace-active workflow-builder"
      id="mp-workspace"
      data-example="prim-tag-workflow"
    >
      <div className="ex-header">
        <div className="ex-header-titles">
          <div className="ex-kicker">
            Builder <span className="prim-tag prim-tag-workflow">workflow</span>
          </div>
          <h1 className="ex-title">Workflow Builder</h1>
          <p className="ex-desc">
            Compose a safe custom workflow from approved nodes, run it, and inspect the live trace.
          </p>
        </div>
        <div className="ex-header-controls">
          <button type="button" className="view-source-btn" onClick={saveWorkflow}>
            Save Draft
          </button>
          <button type="button" className="view-source-btn" onClick={loadSavedWorkflow}>
            Load Saved
          </button>
          <button type="button" className="view-source-btn" onClick={resetWorkflow}>
            Reset
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
                if (nextProvider) preferences.selectProvider(nextProvider);
              }}
            >
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {!isCustomProvider ? (
            <label className="model-picker">
              <span className="model-label">Model</span>
              <select
                className="model-select"
                value={preferences.model}
                onChange={(event) => {
                  preferences.setModel(event.target.value);
                  if (event.target.value === CUSTOM_MODEL_OPTION) setShowCustomModal(true);
                }}
              >
                {preferences.modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button type="button" className="custom-configure-btn" onClick={() => setShowCustomModal(true)}>
            <span className="custom-configure-icon">⚙</span>
            {isCustomProvider
              ? preferences.customModel || 'Setting'
              : preferences.providerApiKey
                ? 'Key set'
                : 'Settings'}
          </button>
        </div>
      </div>

      <section className="builder-commandbar" aria-label="Workflow builder actions">
        <div className="builder-commandbar-main">
          <span className="builder-commandbar-label">Add node</span>
          <button type="button" className="builder-palette-btn" onClick={() => addNode('llm')}>
            LLM prompt
          </button>
          <button type="button" className="builder-palette-btn" onClick={() => addNode('tool')}>
            Mock tool
          </button>
          <button type="button" className="builder-palette-btn" onClick={() => addNode('branch')}>
            Branch
          </button>
        </div>
        <div className="builder-commandbar-meta" aria-live="polite">
          <span>
            {workflow.nodes.length}/{MAX_NODES} nodes
          </span>
          <span>{executableNodes} editable steps</span>
          <span>{builderNotice}</span>
        </div>
      </section>

      <div className="builder-grid">
        <section className="builder-panel builder-canvas" aria-label="Workflow canvas">
          <div className="builder-panel-title-row">
            <div>
              <div className="builder-panel-heading">Workflow</div>
              <h2>{workflow.name}</h2>
            </div>
            <span className="builder-status-pill">{running ? 'Running' : 'Ready'}</span>
          </div>
          <div className="builder-node-list">
            {workflow.nodes.map((node, index) => (
              <button
                key={node.id}
                type="button"
                className={`builder-node-row ${selectedId === node.id ? 'builder-node-selected' : ''}`}
                onClick={() => setSelectedId(node.id)}
              >
                <span className="builder-node-index">{String(index + 1).padStart(2, '0')}</span>
                <span className={`builder-node-type builder-node-type-${node.type}`}>{node.type}</span>
                <span className="builder-node-main">
                  <span className="builder-node-label">{node.label}</span>
                  <span className="builder-node-id">{node.id}</span>
                </span>
                <span className="builder-node-arrow">↓</span>
              </button>
            ))}
          </div>
          <div className="builder-run-card">
            <label className="builder-field builder-run-input">
              <span>{workflow.input.label}</span>
              <textarea
                value={prompt}
                rows={4}
                placeholder={workflow.input.placeholder}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="run-btn builder-run-btn"
              onClick={runWorkflow}
              disabled={running}
            >
              <span className="run-icon">▶</span>
              {running ? 'Running…' : 'Run custom workflow'}
              <span className="run-shortcut">⌘↵</span>
            </button>
          </div>
        </section>

        <aside className="builder-panel builder-inspector" aria-label="Workflow inspector">
          <div className="builder-panel-title-row">
            <div>
              <div className="builder-panel-heading">Inspector</div>
              <h2>{selectedNode?.label ?? 'No node selected'}</h2>
            </div>
          </div>
          <TextField
            label="Workflow name"
            value={workflow.name}
            onChange={(name) => setWorkflow((current) => ({ ...current, name }))}
          />
          <NodeInspector
            node={selectedNode}
            nodes={workflow.nodes}
            onUpdate={updateNode}
            onDelete={() => {
              setWorkflow((current) => removeNode(current, selectedId));
              setSelectedId('output');
              setBuilderNotice('Node deleted');
            }}
          />
        </aside>
      </div>

      <details
        className="builder-json-drawer"
        open={jsonDrawerOpen}
        onToggle={(event) => setJsonDrawerOpen(event.currentTarget.open)}
      >
        <summary>Import / export workflow JSON</summary>
        <div className="builder-json-grid">
          <div className="builder-import">
            <label className="builder-field">
              <span>Import JSON</span>
              <textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder="Paste workflow JSON"
                rows={7}
              />
            </label>
            <button
              type="button"
              className="builder-secondary-btn"
              onClick={importWorkflow}
              disabled={!importText.trim()}
            >
              Import JSON
            </button>
          </div>
          <section className="builder-export" aria-label="Workflow JSON">
            <div className="builder-panel-heading">Export JSON</div>
            <pre>{exportedJson}</pre>
          </section>
        </div>
      </details>

      <div className="builder-results-grid">
        <BuilderOutput
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          output={output}
          sources={sources}
          error={error}
        />
        <TracePane
          graphContainerId="mp-custom-graph"
          graphDef={graph}
          timeline={timeline}
          doneCount={doneCount}
          completedNodes={completedNodes}
          activeNode={activeNode}
          totalMs={totalMs}
        />
      </div>

      {showCustomModal ? (
        <CustomProviderModal
          title={isCustomProvider ? 'Custom endpoint' : `${providerLabel} settings`}
          showBaseUrl={isCustomProvider}
          baseUrl={preferences.customBaseUrl}
          apiKey={isCustomProvider ? preferences.customApiKey : preferences.providerApiKey}
          model={isCustomProvider ? preferences.customModel : preferences.providerCustomModel}
          apiKeyPlaceholder={
            isCustomProvider ? 'sk-...' : preferences.provider === 'google' ? 'AIza...' : 'sk-or-...'
          }
          modelPlaceholder={
            isCustomProvider
              ? 'gpt-4o-mini'
              : preferences.provider === 'google'
                ? 'gemini-2.5-flash'
                : 'openai/gpt-oss-20b:free'
          }
          onBaseUrlChange={preferences.setCustomBaseUrl}
          onApiKeyChange={isCustomProvider ? preferences.setCustomApiKey : preferences.setProviderApiKey}
          onModelChange={isCustomProvider ? preferences.setCustomModel : preferences.setProviderCustomModel}
          onClear={preferences.clearCurrentProviderSettings}
          onClose={() => setShowCustomModal(false)}
        />
      ) : null}
    </article>
  );
}
