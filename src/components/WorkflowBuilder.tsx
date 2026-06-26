import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
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
import {
  applyWorkflowConnection,
  buildWorkflowGraphEdges,
  CUSTOM_WORKFLOW_LAYOUT_STORAGE_KEY,
  defaultWorkflowLayout,
  normalizeWorkflowLayout,
  validateWorkflowClient,
  type WorkflowLayout,
} from '../registry/custom-workflow-flow';
import { traceEventToTimelineEntry } from './Workspace';

const MAX_NODES = 12;

type BuilderTab = 'result' | 'trace' | 'sources' | 'json';
type InspectorTab = 'config' | 'input' | 'output' | 'advanced';
type BuilderToolId = (typeof CLIENT_CUSTOM_TOOL_OPTIONS)[number]['value'];
type BranchOperator = Extract<CustomWorkflowNode, { type: 'branch' }>['operator'];
type NodeStatus = 'idle' | 'active' | 'done' | 'error';

type BuilderNodeData = {
  workflowNode: CustomWorkflowNode;
  subtitle: string;
  status: NodeStatus;
  issue?: string;
};
type BuilderFlowNode = Node<BuilderNodeData, 'builderNode'>;

const NODE_TYPE_LABELS: Record<CustomWorkflowNode['type'], string> = {
  input: 'Input',
  llm: 'LLM',
  tool: 'Tool',
  branch: 'IF / Else',
  output: 'Output',
};

const NODE_SYMBOLS: Record<CustomWorkflowNode['type'], string> = {
  input: '↳',
  llm: '✺',
  tool: '⌘',
  branch: '◇',
  output: '↦',
};

type PaletteNodeType = 'llm' | 'tool' | 'branch';
type PaletteDefaults =
  | {
      type: 'llm';
      instruction: string;
      promptTemplate: string;
      outputKeyBase: string;
    }
  | {
      type: 'tool';
      toolId: BuilderToolId;
      inputTemplate: string;
      outputKeyBase: string;
    }
  | {
      type: 'branch';
      sourceKey: string;
      operator: BranchOperator;
      value?: string;
    };
type PalettePreset = {
  id: string;
  type: PaletteNodeType;
  label: string;
  description: string;
  group: string;
  defaults: PaletteDefaults;
};

const PALETTE_ITEMS: PalettePreset[] = [
  {
    id: 'llm-step',
    type: 'llm',
    label: 'LLM Step',
    description: 'Call a language model',
    group: 'LLM',
    defaults: {
      type: 'llm',
      instruction: 'You are a helpful workflow step.',
      promptTemplate: '{{input.prompt}}',
      outputKeyBase: 'llm_result',
    },
  },
  {
    id: 'prompt-template',
    type: 'llm',
    label: 'Prompt Template',
    description: 'Create a structured prompt step',
    group: 'LLM',
    defaults: {
      type: 'llm',
      instruction: 'Follow the template and keep the response concise.',
      promptTemplate:
        'Input: {{input.prompt}}\n\nRespond with:\n- Summary:\n- Recommendation:\n- Next action:',
      outputKeyBase: 'templated_response',
    },
  },
  {
    id: 'classifier',
    type: 'llm',
    label: 'Classifier',
    description: 'Label intent, urgency, or category',
    group: 'LLM',
    defaults: {
      type: 'llm',
      instruction: 'Classify the input and explain the decision briefly.',
      promptTemplate:
        'Classify this request by intent and urgency:\n\n{{input.prompt}}\n\nReturn concise JSON with intent, urgency, and reason.',
      outputKeyBase: 'classification',
    },
  },
  {
    id: 'rewriter',
    type: 'llm',
    label: 'Rewriter',
    description: 'Rewrite text for clarity or tone',
    group: 'LLM',
    defaults: {
      type: 'llm',
      instruction: 'Rewrite the input while preserving the original meaning.',
      promptTemplate: 'Rewrite this for clarity, brevity, and a practical tone:\n\n{{input.prompt}}',
      outputKeyBase: 'rewritten_text',
    },
  },
  {
    id: 'structured-extractor',
    type: 'llm',
    label: 'Structured Extractor',
    description: 'Extract fields as JSON',
    group: 'LLM',
    defaults: {
      type: 'llm',
      instruction: 'Extract structured fields from the input. Return only valid JSON.',
      promptTemplate:
        'Extract entities, dates, action items, and risks from this input:\n\n{{input.prompt}}\n\nReturn JSON with keys: entities, dates, actions, risks.',
      outputKeyBase: 'extracted_fields',
    },
  },
  {
    id: 'echo',
    type: 'tool',
    label: 'Echo',
    description: 'Pass text through an approved tool',
    group: 'Tools',
    defaults: {
      type: 'tool',
      toolId: 'echo',
      inputTemplate: '{{input.prompt}}',
      outputKeyBase: 'echo_result',
    },
  },
  {
    id: 'summarize',
    type: 'tool',
    label: 'Summarize',
    description: 'Create a deterministic short summary',
    group: 'Tools',
    defaults: {
      type: 'tool',
      toolId: 'summarize',
      inputTemplate: '{{input.prompt}}',
      outputKeyBase: 'summary_result',
    },
  },
  {
    id: 'keyword',
    type: 'tool',
    label: 'Keyword Extractor',
    description: 'Extract unique keywords',
    group: 'Tools',
    defaults: {
      type: 'tool',
      toolId: 'keyword',
      inputTemplate: '{{input.prompt}}',
      outputKeyBase: 'keyword_result',
    },
  },
  {
    id: 'branch-non-empty',
    type: 'branch',
    label: 'Non-empty Check',
    description: 'Route when a value exists',
    group: 'Branch',
    defaults: { type: 'branch', sourceKey: 'draft', operator: 'nonEmpty' },
  },
  {
    id: 'branch-contains',
    type: 'branch',
    label: 'Contains Text',
    description: 'Route when text includes a value',
    group: 'Branch',
    defaults: { type: 'branch', sourceKey: 'draft', operator: 'contains', value: 'approved' },
  },
  {
    id: 'branch-equals',
    type: 'branch',
    label: 'Equals Value',
    description: 'Route on an exact match',
    group: 'Branch',
    defaults: { type: 'branch', sourceKey: 'draft', operator: 'equals', value: 'yes' },
  },
];

function isWorkflowDefinitionLike(value: unknown): value is CustomWorkflowDefinition {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as {
    version?: unknown;
    id?: unknown;
    name?: unknown;
    description?: unknown;
    input?: unknown;
    nodes?: unknown;
    edges?: unknown;
  };
  const input = candidate.input as { label?: unknown; placeholder?: unknown } | null;
  return (
    candidate.version === 1 &&
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    (candidate.description === undefined || typeof candidate.description === 'string') &&
    input !== null &&
    typeof input === 'object' &&
    typeof input.label === 'string' &&
    (input.placeholder === undefined || typeof input.placeholder === 'string') &&
    Array.isArray(candidate.nodes) &&
    candidate.nodes.every(isWorkflowNodeLike) &&
    Array.isArray(candidate.edges) &&
    candidate.edges.every(isWorkflowEdgeLike)
  );
}

function isWorkflowNodeLike(value: unknown): value is CustomWorkflowNode {
  if (value === null || typeof value !== 'object') return false;
  const node = value as Record<string, unknown>;
  if (typeof node.id !== 'string' || typeof node.label !== 'string') return false;
  if (node.type === 'input') return true;
  if (node.type === 'llm') {
    return (
      typeof node.instruction === 'string' &&
      typeof node.promptTemplate === 'string' &&
      typeof node.outputKey === 'string'
    );
  }
  if (node.type === 'tool') {
    return (
      CLIENT_CUSTOM_TOOL_OPTIONS.some((tool) => tool.value === node.toolId) &&
      typeof node.inputTemplate === 'string' &&
      typeof node.outputKey === 'string'
    );
  }
  if (node.type === 'branch') {
    return (
      typeof node.sourceKey === 'string' &&
      (node.operator === 'contains' || node.operator === 'equals' || node.operator === 'nonEmpty') &&
      (node.value === undefined || typeof node.value === 'string') &&
      typeof node.trueTarget === 'string' &&
      typeof node.falseTarget === 'string'
    );
  }
  return node.type === 'output' && typeof node.template === 'string';
}

function isWorkflowEdgeLike(value: unknown) {
  if (value === null || typeof value !== 'object') return false;
  const edge = value as { from?: unknown; to?: unknown; label?: unknown };
  return (
    typeof edge.from === 'string' &&
    typeof edge.to === 'string' &&
    (edge.label === undefined || typeof edge.label === 'string')
  );
}

function parseWorkflowJson(text: string): CustomWorkflowDefinition {
  const parsed = JSON.parse(text) as unknown;
  if (!isWorkflowDefinitionLike(parsed)) {
    throw new Error('Workflow JSON is missing required fields.');
  }
  const issues = validateWorkflowClient(parsed);
  if (issues.length > 0) {
    throw new Error(issues[0]);
  }
  return parsed;
}

function tryWriteStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function traceErrorMessage(output: unknown, fallback: string) {
  if (!output || typeof output !== 'object') return fallback;
  const { error, errorId } = output as { error?: unknown; errorId?: unknown };
  const message = typeof error === 'string' && error.trim() ? error : fallback;
  return typeof errorId === 'string' && errorId.trim() ? `${message} (${errorId})` : message;
}

function loadInitialWorkflow(): CustomWorkflowDefinition {
  if (typeof window === 'undefined') return cloneSeedWorkflow();
  const saved = window.localStorage.getItem(CUSTOM_WORKFLOW_STORAGE_KEY);
  if (!saved) return cloneSeedWorkflow();
  try {
    return parseWorkflowJson(saved);
  } catch {
    window.localStorage.removeItem(CUSTOM_WORKFLOW_STORAGE_KEY);
  }
  return cloneSeedWorkflow();
}

function loadInitialLayout(workflow: CustomWorkflowDefinition): WorkflowLayout {
  if (typeof window === 'undefined') return defaultWorkflowLayout(workflow);
  const saved = window.localStorage.getItem(CUSTOM_WORKFLOW_LAYOUT_STORAGE_KEY);
  if (!saved) return defaultWorkflowLayout(workflow);
  try {
    const parsed = JSON.parse(saved) as WorkflowLayout;
    return normalizeWorkflowLayout(workflow, parsed);
  } catch {
    window.localStorage.removeItem(CUSTOM_WORKFLOW_LAYOUT_STORAGE_KEY);
    return defaultWorkflowLayout(workflow);
  }
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

function uniqueOutputKey(nodes: CustomWorkflowNode[], base: string) {
  const normalized = base
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9_]/g, '_')
    .replaceAll(/_+/g, '_')
    .replaceAll(/^_+|_+$/g, '');
  const safeBase = /^[a-z]/.test(normalized) ? normalized : `step_${normalized || 'result'}`;
  const used = new Set(
    nodes.flatMap((node) => (node.type === 'llm' || node.type === 'tool' ? [node.outputKey] : [])),
  );
  if (!used.has(safeBase)) return safeBase;

  let index = 2;
  let candidate = `${safeBase}_${index}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${safeBase}_${index}`;
  }
  return candidate;
}

function sourceKeyForNewBranch(workflow: CustomWorkflowDefinition) {
  const output = workflow.nodes.find((node) => node.type === 'output');
  const incoming = output ? workflow.edges.find((edge) => edge.to === output.id) : undefined;
  const previous = incoming ? workflow.nodes.find((node) => node.id === incoming.from) : undefined;
  if (previous?.type === 'llm' || previous?.type === 'tool') return previous.outputKey;
  const firstProducedValue = workflow.nodes.find((node) => node.type === 'llm' || node.type === 'tool');
  return firstProducedValue && (firstProducedValue.type === 'llm' || firstProducedValue.type === 'tool')
    ? firstProducedValue.outputKey
    : 'draft';
}

function nodeFromPalettePreset(
  preset: PalettePreset,
  workflow: CustomWorkflowDefinition,
  id: string,
  outputId: string,
): CustomWorkflowNode {
  const defaults = preset.defaults;
  if (defaults.type === 'llm') {
    return {
      id,
      type: 'llm',
      label: preset.label,
      instruction: defaults.instruction,
      promptTemplate: defaults.promptTemplate,
      outputKey: uniqueOutputKey(workflow.nodes, defaults.outputKeyBase),
    };
  }
  if (defaults.type === 'tool') {
    return {
      id,
      type: 'tool',
      label: preset.label,
      toolId: defaults.toolId,
      inputTemplate: defaults.inputTemplate,
      outputKey: uniqueOutputKey(workflow.nodes, defaults.outputKeyBase),
    };
  }

  return {
    id,
    type: 'branch',
    label: preset.label,
    sourceKey: defaults.sourceKey === 'draft' ? sourceKeyForNewBranch(workflow) : defaults.sourceKey,
    operator: defaults.operator,
    value: defaults.value,
    trueTarget: outputId,
    falseTarget: outputId,
  };
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

function nodeSubtitle(node: CustomWorkflowNode) {
  if (node.type === 'llm') return node.outputKey;
  if (node.type === 'tool')
    return CLIENT_CUSTOM_TOOL_OPTIONS.find((tool) => tool.value === node.toolId)?.label ?? node.toolId;
  if (node.type === 'branch') return `${node.sourceKey} ${node.operator}`;
  if (node.type === 'output') return 'Final result';
  return 'Run input';
}

function JsonBlock({ value }: { value: unknown }) {
  return <pre className="json-pre">{JSON.stringify(value, null, 2)}</pre>;
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

function WorkflowFlowNode({ data, selected }: NodeProps<BuilderFlowNode>) {
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

const nodeTypes = { builderNode: WorkflowFlowNode };

function NodePalette({
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

function NodeInspector({
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

function BuilderConsole({
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
              <p className="response-text">{String(out?.answer ?? '')}</p>
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

export function WorkflowBuilder() {
  const initialWorkflowRef = useRef<CustomWorkflowDefinition | null>(null);
  if (!initialWorkflowRef.current) initialWorkflowRef.current = loadInitialWorkflow();

  const [workflow, setWorkflow] = useState<CustomWorkflowDefinition>(initialWorkflowRef.current);
  const [layout, setLayout] = useState<WorkflowLayout>(() => loadInitialLayout(initialWorkflowRef.current!));
  const [selectedId, setSelectedId] = useState(firstConfigurableNodeId(initialWorkflowRef.current));
  const [paletteQuery, setPaletteQuery] = useState('');
  const [prompt, setPrompt] = useState('Summarize why visual workflow builders help people learn agents.');
  const [importText, setImportText] = useState('');
  const [builderNotice, setBuilderNotice] = useState(initialBuilderNotice);
  const [activeTab, setActiveTab] = useState<BuilderTab>('result');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('config');
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
  const validationIssues = useMemo(() => validateWorkflowClient(workflow), [workflow]);
  const normalizedLayout = useMemo(() => normalizeWorkflowLayout(workflow, layout), [layout, workflow]);

  const flowNodes: BuilderFlowNode[] = useMemo(
    () =>
      workflow.nodes.map((node) => {
        const status: NodeStatus =
          activeNode === node.id
            ? 'active'
            : completedNodes.includes(node.id)
              ? 'done'
              : error
                ? 'error'
                : 'idle';
        return {
          id: node.id,
          type: 'builderNode',
          position: normalizedLayout[node.id] ?? { x: 80, y: 110 },
          selected: selectedId === node.id,
          data: {
            workflowNode: node,
            subtitle: nodeSubtitle(node),
            status,
            issue: validationIssues.find((issue) => issue.includes(node.id) || issue.includes(node.label)),
          },
        };
      }),
    [activeNode, completedNodes, error, normalizedLayout, selectedId, validationIssues, workflow.nodes],
  );

  const flowEdges: Edge[] = useMemo(
    () =>
      buildWorkflowGraphEdges(workflow).map((edge) => {
        const active = activeNode === edge.from || activeNode === edge.to;
        const done = completedNodes.includes(edge.from) && completedNodes.includes(edge.to);
        return {
          id: `${edge.from}-${edge.to}-${edge.label ?? 'edge'}`,
          source: edge.from,
          target: edge.to,
          label: edge.label,
          type: 'smoothstep',
          animated: active,
          className: `${edge.className ?? ''} ${done ? 'builder-flow-edge-done' : ''}`.trim(),
          markerEnd: { type: MarkerType.ArrowClosed },
        };
      }),
    [activeNode, completedNodes, workflow],
  );

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
    setLayout((current) => normalizeWorkflowLayout(workflow, current));
  }, [workflow]);

  useEffect(() => {
    tryWriteStorage(CUSTOM_WORKFLOW_LAYOUT_STORAGE_KEY, JSON.stringify(normalizedLayout));
  }, [normalizedLayout]);

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

  const addNode = (preset: PalettePreset) => {
    if (workflow.nodes.length >= MAX_NODES) return;
    const output = workflow.nodes.find((node) => node.type === 'output');
    const id = uniqueNodeId(workflow.nodes, preset.type);
    const node = nodeFromPalettePreset(preset, workflow, id, output?.id ?? 'output');

    const next = insertBeforeOutput(workflow, node);
    setWorkflow(next);
    setLayout((current) => ({
      ...normalizeWorkflowLayout(next, current),
      [id]: defaultWorkflowLayout(next)[id] ?? { x: 560, y: 180 },
    }));
    setSelectedId(id);
    setInspectorTab('config');
    setBuilderNotice(`${node.label} added before Output`);
  };

  const resetWorkflow = () => {
    const seed = cloneSeedWorkflow();
    setWorkflow(seed);
    setLayout(defaultWorkflowLayout(seed));
    setSelectedId('draft');
    setOutput(null);
    setSources([]);
    setError(null);
    setBuilderNotice('Starter workflow restored');
  };

  const saveWorkflow = () => {
    const savedWorkflow = tryWriteStorage(CUSTOM_WORKFLOW_STORAGE_KEY, JSON.stringify(workflow));
    const savedLayout = tryWriteStorage(CUSTOM_WORKFLOW_LAYOUT_STORAGE_KEY, JSON.stringify(normalizedLayout));
    setBuilderNotice(savedWorkflow && savedLayout ? 'Draft saved in this browser' : 'Save failed');
  };

  const loadSavedWorkflow = () => {
    const saved = localStorage.getItem(CUSTOM_WORKFLOW_STORAGE_KEY);
    if (!saved) {
      setBuilderNotice('No saved draft found');
      return;
    }
    try {
      const parsed = parseWorkflowJson(saved);
      setWorkflow(parsed);
      setLayout(loadInitialLayout(parsed));
      setSelectedId(firstConfigurableNodeId(parsed));
      setBuilderNotice('Saved draft loaded');
    } catch {
      localStorage.removeItem(CUSTOM_WORKFLOW_STORAGE_KEY);
      setBuilderNotice('Saved draft was invalid and has been cleared');
    }
  };

  const importWorkflow = () => {
    let parsed: CustomWorkflowDefinition;
    try {
      parsed = parseWorkflowJson(importText);
    } catch {
      setBuilderNotice('Import failed: JSON could not be parsed');
      return;
    }

    const nextLayout = defaultWorkflowLayout(parsed);
    setWorkflow(parsed);
    setLayout(nextLayout);
    setSelectedId(firstConfigurableNodeId(parsed));
    const savedWorkflow = tryWriteStorage(CUSTOM_WORKFLOW_STORAGE_KEY, JSON.stringify(parsed));
    const savedLayout = tryWriteStorage(CUSTOM_WORKFLOW_LAYOUT_STORAGE_KEY, JSON.stringify(nextLayout));
    setImportText('');
    setBuilderNotice(
      savedWorkflow && savedLayout
        ? 'Workflow JSON imported and saved'
        : 'Workflow JSON imported, but browser save failed',
    );
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
          setOutput(event.output);
          setError(traceErrorMessage(event.output, 'Workflow failed'));
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

  const onNodesChange = useCallback((changes: NodeChange<BuilderFlowNode>[]) => {
    const positionChanges = changes.filter(
      (change): change is Extract<NodeChange<BuilderFlowNode>, { type: 'position' }> =>
        change.type === 'position' && Boolean(change.position) && change.dragging === true,
    );
    if (positionChanges.length === 0) return;
    setLayout((current) => {
      const next = { ...current };
      for (const change of positionChanges) {
        if (change.position) next[change.id] = change.position;
      }
      return next;
    });
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      const next = applyWorkflowConnection(workflow, connection);
      setWorkflow(next);
      setBuilderNotice(
        next === workflow ? 'Branch routes are edited in the inspector' : 'Connection updated',
      );
    },
    [workflow],
  );

  const providerLabel =
    PROVIDER_OPTIONS.find((option) => option.value === preferences.provider)?.label.split(' · ')[0] ??
    'Provider';
  const isCustomProvider = preferences.provider === 'custom';
  const isValid = validationIssues.length === 0;

  return (
    <article
      className="workspace workspace-active workflow-builder"
      id="mp-workspace"
      data-example="prim-tag-workflow"
    >
      <h1 className="builder-page-title">Workflow Builder</h1>
      <div className="builder-topbar">
        <div className="builder-breadcrumb">
          <span>Workflows</span>
          <strong>{workflow.name}</strong>
          <span className="builder-version">v1 {isValid ? 'valid' : 'needs review'}</span>
        </div>
        <div className="builder-toolbar">
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

      <div className="builder-statusbar" aria-live="polite">
        <span className={running ? 'builder-status-live' : ''}>{running ? 'Running' : 'Ready to run'}</span>
        <span>
          {workflow.nodes.length}/{MAX_NODES} nodes
        </span>
        <span>{executableNodes} editable steps</span>
        <span>{isValid ? 'Workflow valid' : `${validationIssues.length} issue(s)`}</span>
        <span>{builderNotice}</span>
      </div>

      <div className="builder-shell">
        <NodePalette
          query={paletteQuery}
          setQuery={setPaletteQuery}
          onAdd={addNode}
          onSave={saveWorkflow}
          onLoad={loadSavedWorkflow}
          onReset={resetWorkflow}
          onOpenJson={() => setActiveTab('json')}
          disabled={workflow.nodes.length >= MAX_NODES}
        />

        <section className="builder-canvas-shell" aria-label="Workflow canvas">
          {!isValid ? (
            <div className="builder-validation-banner">
              {validationIssues.slice(0, 2).map((issue) => (
                <span key={issue}>{issue}</span>
              ))}
            </div>
          ) : null}
          <ReactFlowProvider>
            <ReactFlow
              className="builder-flow"
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onNodeClick={(_event, node) => setSelectedId(node.id)}
              onConnect={onConnect}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.35}
              maxZoom={1.4}
            >
              <Background color="rgba(148, 163, 184, 0.28)" gap={22} size={1} />
              <Controls showInteractive={false} />
              <MiniMap
                className="builder-minimap"
                pannable
                zoomable
                nodeStrokeWidth={3}
                nodeColor={(node) => {
                  const data = node.data as BuilderNodeData | undefined;
                  const type = data?.workflowNode.type;
                  if (type === 'llm') return '#19d3c5';
                  if (type === 'tool') return '#3b82f6';
                  if (type === 'branch') return '#f59e0b';
                  if (type === 'output') return '#8b5cf6';
                  return '#10b981';
                }}
              />
            </ReactFlow>
          </ReactFlowProvider>
        </section>

        <NodeInspector
          node={selectedNode}
          nodes={workflow.nodes}
          activeTab={inspectorTab}
          setActiveTab={setInspectorTab}
          workflowName={workflow.name}
          onWorkflowNameChange={(name) => setWorkflow((current) => ({ ...current, name }))}
          onUpdate={updateNode}
          onDelete={() => {
            const next = removeNode(workflow, selectedId);
            setWorkflow(next);
            setSelectedId('output');
            setBuilderNotice('Node deleted');
          }}
        />
      </div>

      <BuilderConsole
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        prompt={prompt}
        setPrompt={setPrompt}
        placeholder={workflow.input.placeholder}
        running={running}
        runWorkflow={runWorkflow}
        output={output}
        sources={sources}
        error={error}
        graph={graph}
        timeline={timeline}
        doneCount={doneCount}
        completedNodes={completedNodes}
        activeNode={activeNode}
        totalMs={totalMs}
        importText={importText}
        setImportText={setImportText}
        importWorkflow={importWorkflow}
        exportedJson={exportedJson}
      />

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
