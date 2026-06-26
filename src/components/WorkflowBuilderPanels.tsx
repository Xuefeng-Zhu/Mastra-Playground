import { Handle, Position, type NodeProps } from '@xyflow/react';
import { TracePane, type TimelineEntry } from './TracePane';
import {
  CLIENT_CUSTOM_TOOL_OPTIONS,
  customWorkflowToGraph,
  type CustomWorkflowNode,
} from '../registry/custom-workflow';
import type { CapturedSource } from '../registry/renderers';
import {
  NODE_SYMBOLS,
  NODE_TYPE_LABELS,
  PALETTE_ITEMS,
  type BranchOperator,
  type BuilderFlowNode,
  type BuilderTab,
  type BuilderToolId,
  type InspectorTab,
  type PalettePreset,
} from './workflow-builder-model';

export type {
  BuilderFlowNode,
  BuilderTab,
  BuilderToolId,
  InspectorTab,
  PalettePreset,
} from './workflow-builder-model';

export function JsonBlock({ value }: { value: unknown }) {
  return <pre className="json-pre">{JSON.stringify(value, null, 2)}</pre>;
}

function parseJsonAnswer(answer: unknown): unknown | null {
  if (typeof answer !== 'string') return null;
  const trimmed = answer.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function TextField({
  label,
  value,
  onChange,
  multiline,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="builder-field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          rows={4}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

export function WorkflowFlowNode({ data, selected }: NodeProps<BuilderFlowNode>) {
  const { workflowNode: node, status, subtitle, issue } = data;
  return (
    <div
      className={`builder-flow-node builder-flow-node-${node.type} builder-flow-node-${status} ${
        selected ? 'builder-flow-node-selected' : ''
      }`}
    >
      <Handle className="builder-flow-handle" type="target" position={Position.Left} />
      <div className="builder-flow-node-top">
        <span className="builder-flow-node-symbol">{NODE_SYMBOLS[node.type]}</span>
        <span className="builder-flow-node-kind">{NODE_TYPE_LABELS[node.type]}</span>
        <span className="builder-flow-node-state">
          {status === 'active' ? 'Running' : status === 'done' ? 'Done' : 'Ready'}
        </span>
      </div>
      <div className="builder-flow-node-label">{node.label}</div>
      <div className="builder-flow-node-subtitle">{subtitle}</div>
      {issue ? <div className="builder-flow-node-issue">{issue}</div> : null}
      {node.type !== 'output' ? (
        <Handle className="builder-flow-handle" type="source" position={Position.Right} />
      ) : null}
    </div>
  );
}

export function NodePalette({
  query,
  setQuery,
  onAdd,
  onSave,
  onLoad,
  onReset,
  onOpenJson,
  disabled,
}: {
  query: string;
  setQuery: (query: string) => void;
  onAdd: (preset: PalettePreset) => void;
  onSave: () => void;
  onLoad: () => void;
  onReset: () => void;
  onOpenJson: () => void;
  disabled: boolean;
}) {
  const filtered = PALETTE_ITEMS.filter((item) =>
    `${item.group} ${item.label} ${item.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const groups = Array.from(new Set(filtered.map((item) => item.group)));

  return (
    <aside className="builder-palette" aria-label="Node palette">
      <label className="builder-search">
        <span>Search nodes</span>
        <input
          type="search"
          value={query}
          placeholder="Search nodes..."
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <p className="builder-palette-hint">Add nodes to the workflow canvas.</p>
      {groups.map((group) => (
        <div className="builder-palette-group" key={group}>
          <div className="builder-palette-group-title">{group}</div>
          {filtered
            .filter((item) => item.group === group)
            .map((item) => (
              <button
                type="button"
                className={`builder-template-card builder-template-card-${item.type}`}
                key={item.id}
                onClick={() => onAdd(item)}
                disabled={disabled}
              >
                <span className="builder-template-icon">{NODE_SYMBOLS[item.type]}</span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
              </button>
            ))}
        </div>
      ))}
      <div className="builder-palette-actions" aria-label="Workflow actions">
        <button type="button" className="builder-primary-btn" onClick={onSave}>
          Save
        </button>
        <button type="button" className="builder-secondary-btn" onClick={onLoad}>
          Load
        </button>
        <button type="button" className="builder-secondary-btn" onClick={onReset}>
          Reset
        </button>
      </div>
      <div className="builder-palette-footer">
        <button type="button" className="builder-secondary-btn" onClick={onOpenJson}>
          Import JSON
        </button>
        <button type="button" className="builder-secondary-btn" onClick={onOpenJson}>
          Export JSON
        </button>
      </div>
    </aside>
  );
}

export function NodeInspector({
  node,
  nodes,
  activeTab,
  setActiveTab,
  workflowName,
  onWorkflowNameChange,
  onUpdate,
  onDelete,
}: {
  node: CustomWorkflowNode | undefined;
  nodes: CustomWorkflowNode[];
  activeTab: InspectorTab;
  setActiveTab: (tab: InspectorTab) => void;
  workflowName: string;
  onWorkflowNameChange: (name: string) => void;
  onUpdate: (node: CustomWorkflowNode) => void;
  onDelete: () => void;
}) {
  const targetOptions = node ? nodes.filter((candidate) => candidate.id !== node.id) : [];

  return (
    <aside className="builder-inspector" aria-label="Workflow inspector">
      <div className="builder-panel-title-row">
        <div>
          <div className="builder-panel-heading">Inspector</div>
          <h2>{node?.label ?? 'No node selected'}</h2>
        </div>
      </div>
      <div className="builder-inspector-tabs" role="tablist" aria-label="Inspector sections">
        {(['config', 'input', 'output', 'advanced'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? 'builder-inspector-tab-active' : ''}
            aria-selected={activeTab === tab}
            role="tab"
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="builder-inspector-fields">
        {activeTab === 'config' ? (
          <>
            <TextField label="Workflow name" value={workflowName} onChange={onWorkflowNameChange} />
            {node ? (
              <TextField
                label="Node label"
                value={node.label}
                onChange={(label) => onUpdate({ ...node, label })}
              />
            ) : (
              <p className="muted">Select a node to edit its settings.</p>
            )}
            {node?.type === 'llm' ? (
              <TextField
                label="System prompt"
                value={node.instruction}
                multiline
                onChange={(instruction) => onUpdate({ ...node, instruction })}
              />
            ) : null}
            {node?.type === 'tool' ? (
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
            ) : null}
            {node?.type === 'branch' ? (
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
              </>
            ) : null}
          </>
        ) : null}

        {activeTab === 'input' ? (
          <>
            {node?.type === 'input' ? <p className="muted">The input node receives the run prompt.</p> : null}
            {node?.type === 'llm' ? (
              <TextField
                label="Prompt template"
                value={node.promptTemplate}
                multiline
                onChange={(promptTemplate) => onUpdate({ ...node, promptTemplate })}
              />
            ) : null}
            {node?.type === 'tool' ? (
              <TextField
                label="Input template"
                value={node.inputTemplate}
                multiline
                onChange={(inputTemplate) => onUpdate({ ...node, inputTemplate })}
              />
            ) : null}
            {node?.type === 'branch' ? (
              <>
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
          </>
        ) : null}

        {activeTab === 'output' ? (
          <>
            {node?.type === 'llm' ? (
              <TextField
                label="Output key"
                value={node.outputKey}
                onChange={(outputKey) => onUpdate({ ...node, outputKey })}
              />
            ) : null}
            {node?.type === 'tool' ? (
              <TextField
                label="Output key"
                value={node.outputKey}
                onChange={(outputKey) => onUpdate({ ...node, outputKey })}
              />
            ) : null}
            {node?.type === 'output' ? (
              <TextField
                label="Output template"
                value={node.template}
                multiline
                onChange={(template) => onUpdate({ ...node, template })}
              />
            ) : null}
            {!node || node.type === 'input' || node.type === 'branch' ? (
              <p className="muted">This node does not define a direct output field.</p>
            ) : null}
          </>
        ) : null}

        {activeTab === 'advanced' ? (
          <>
            {node ? <JsonBlock value={node} /> : <p className="muted">No selected node metadata.</p>}
            {node && node.type !== 'input' && node.type !== 'output' ? (
              <button type="button" className="builder-danger-btn" onClick={onDelete}>
                Delete node
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}

export function BuilderConsole({
  activeTab,
  setActiveTab,
  prompt,
  setPrompt,
  placeholder,
  running,
  runWorkflow,
  output,
  sources,
  error,
  graph,
  timeline,
  doneCount,
  completedNodes,
  activeNode,
  totalMs,
  importText,
  setImportText,
  importWorkflow,
  exportedJson,
}: {
  activeTab: BuilderTab;
  setActiveTab: (tab: BuilderTab) => void;
  prompt: string;
  setPrompt: (prompt: string) => void;
  placeholder?: string;
  running: boolean;
  runWorkflow: () => void;
  output: unknown;
  sources: CapturedSource[];
  error: string | null;
  graph: ReturnType<typeof customWorkflowToGraph>;
  timeline: TimelineEntry[];
  doneCount: number;
  completedNodes: string[];
  activeNode: string;
  totalMs: number;
  importText: string;
  setImportText: (text: string) => void;
  importWorkflow: () => void;
  exportedJson: string;
}) {
  const out = output && typeof output === 'object' ? (output as { answer?: unknown }) : null;
  const parsedAnswer = parseJsonAnswer(out?.answer);
  return (
    <section className="builder-console" aria-label="Workflow run console">
      <div className="builder-run-strip">
        <label className="builder-field builder-run-input">
          <span>Prompt</span>
          <textarea
            value={prompt}
            rows={4}
            placeholder={placeholder}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>
        <button type="button" className="run-btn builder-run-btn" onClick={runWorkflow} disabled={running}>
          <span className="run-icon">▶</span>
          {running ? 'Running...' : 'Run'}
          <span className="run-shortcut">⌘↵</span>
        </button>
      </div>
      <div className="builder-console-main">
        <div className="builder-console-tabs" role="tablist" aria-label="Run output views">
          {(['result', 'trace', 'sources', 'json'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? 'builder-console-tab-active' : ''}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'sources' ? `Sources (${sources.length})` : tab}
            </button>
          ))}
        </div>
        <div className="builder-console-body">
          {error ? <p className="muted output-error">⚠ {error}</p> : null}
          {activeTab === 'result' && !error ? (
            output ? (
              parsedAnswer ? (
                <JsonBlock value={parsedAnswer} />
              ) : (
                <p className="response-text">{String(out?.answer ?? '')}</p>
              )
            ) : (
              <p className="muted">Run the custom workflow to see output.</p>
            )
          ) : null}
          {activeTab === 'trace' ? (
            <TracePane
              graphContainerId="mp-custom-graph"
              graphDef={graph}
              timeline={timeline}
              doneCount={doneCount}
              completedNodes={completedNodes}
              activeNode={activeNode}
              totalMs={totalMs}
            />
          ) : null}
          {activeTab === 'sources' ? (
            sources.length > 0 ? (
              <JsonBlock value={sources} />
            ) : (
              <p className="muted">No tool calls captured yet.</p>
            )
          ) : null}
          {activeTab === 'json' ? (
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
          ) : null}
        </div>
      </div>
    </section>
  );
}
