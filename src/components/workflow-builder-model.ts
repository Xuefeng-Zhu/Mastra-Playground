import type { Node } from '@xyflow/react';
import {
  CLIENT_CUSTOM_TOOL_OPTIONS,
  cloneSeedWorkflow,
  CUSTOM_WORKFLOW_STORAGE_KEY,
  type CustomWorkflowDefinition,
  type CustomWorkflowNode,
} from '../registry/custom-workflow';
import {
  CUSTOM_WORKFLOW_LAYOUT_STORAGE_KEY,
  defaultWorkflowLayout,
  normalizeWorkflowLayout,
  validateWorkflowClient,
  type WorkflowLayout,
} from '../registry/custom-workflow-flow';

export const MAX_NODES = 12;

export type BuilderToolId = (typeof CLIENT_CUSTOM_TOOL_OPTIONS)[number]['value'];
export type BranchOperator = Extract<CustomWorkflowNode, { type: 'branch' }>['operator'];
export type NodeStatus = 'idle' | 'active' | 'done' | 'error';

export type BuilderNodeData = {
  workflowNode: CustomWorkflowNode;
  subtitle: string;
  status: NodeStatus;
  issue?: string;
};
export type BuilderFlowNode = Node<BuilderNodeData, 'builderNode'>;

export const NODE_TYPE_LABELS: Record<CustomWorkflowNode['type'], string> = {
  input: 'Input',
  llm: 'LLM',
  tool: 'Tool',
  branch: 'IF / Else',
  output: 'Output',
};

export const NODE_SYMBOLS: Record<CustomWorkflowNode['type'], string> = {
  input: '↳',
  llm: '✺',
  tool: '⌘',
  branch: '◇',
  output: '↦',
};

export type BuilderTab = 'result' | 'trace' | 'sources' | 'json';
export type InspectorTab = 'config' | 'input' | 'output' | 'advanced';

export type PaletteNodeType = 'llm' | 'tool' | 'branch';
export type PaletteDefaults =
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
export type PalettePreset = {
  id: string;
  type: PaletteNodeType;
  label: string;
  description: string;
  group: string;
  defaults: PaletteDefaults;
};

export const PALETTE_ITEMS: PalettePreset[] = [
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

export function readBrowserStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeBrowserStorage(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeBrowserStorage(key: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Browser storage can be disabled; callers still update in-memory state.
  }
}

export function parseWorkflowJson(text: string): CustomWorkflowDefinition {
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

export function loadInitialWorkflow(): CustomWorkflowDefinition {
  const saved = readBrowserStorage(CUSTOM_WORKFLOW_STORAGE_KEY);
  if (!saved) return cloneSeedWorkflow();
  try {
    return parseWorkflowJson(saved);
  } catch {
    removeBrowserStorage(CUSTOM_WORKFLOW_STORAGE_KEY);
  }
  return cloneSeedWorkflow();
}

export function loadInitialLayout(workflow: CustomWorkflowDefinition): WorkflowLayout {
  const saved = readBrowserStorage(CUSTOM_WORKFLOW_LAYOUT_STORAGE_KEY);
  if (!saved) return defaultWorkflowLayout(workflow);
  try {
    const parsed = JSON.parse(saved) as WorkflowLayout;
    return normalizeWorkflowLayout(workflow, parsed);
  } catch {
    removeBrowserStorage(CUSTOM_WORKFLOW_LAYOUT_STORAGE_KEY);
    return defaultWorkflowLayout(workflow);
  }
}

export function initialBuilderNotice() {
  return readBrowserStorage(CUSTOM_WORKFLOW_STORAGE_KEY)
    ? 'Saved workflow loaded'
    : 'Starter workflow loaded';
}

export function firstConfigurableNodeId(workflow: CustomWorkflowDefinition) {
  return workflow.nodes.find((node) => node.type !== 'input')?.id ?? 'input';
}

export function uniqueNodeId(nodes: CustomWorkflowNode[], prefix: string) {
  const used = new Set(nodes.map((node) => node.id));
  let index = 1;
  let candidate = `${prefix}-${index}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${prefix}-${index}`;
  }
  return candidate;
}

export function uniqueOutputKey(nodes: CustomWorkflowNode[], base: string) {
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

export function sourceKeyForNewBranch(workflow: CustomWorkflowDefinition) {
  const output = workflow.nodes.find((node) => node.type === 'output');
  const incoming = output ? workflow.edges.find((edge) => edge.to === output.id) : undefined;
  const previous = incoming ? workflow.nodes.find((node) => node.id === incoming.from) : undefined;
  if (previous?.type === 'llm' || previous?.type === 'tool') return previous.outputKey;
  const firstProducedValue = workflow.nodes.find((node) => node.type === 'llm' || node.type === 'tool');
  return firstProducedValue && (firstProducedValue.type === 'llm' || firstProducedValue.type === 'tool')
    ? firstProducedValue.outputKey
    : 'draft';
}

export function nodeFromPalettePreset(
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

export function insertBeforeOutput(
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

export function removeNode(workflow: CustomWorkflowDefinition, nodeId: string): CustomWorkflowDefinition {
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

export function nodeSubtitle(node: CustomWorkflowNode) {
  if (node.type === 'llm') return node.outputKey;
  if (node.type === 'tool')
    return CLIENT_CUSTOM_TOOL_OPTIONS.find((tool) => tool.value === node.toolId)?.label ?? node.toolId;
  if (node.type === 'branch') return `${node.sourceKey} ${node.operator}`;
  if (node.type === 'output') return 'Final result';
  return 'Run input';
}
