import type { Connection } from '@xyflow/react';
import type { CustomWorkflowDefinition, CustomWorkflowNode } from './custom-workflow';

export const CUSTOM_WORKFLOW_LAYOUT_STORAGE_KEY = 'mpg:custom-workflow-layout:v3';

export type WorkflowNodePosition = { x: number; y: number };
export type WorkflowLayout = Record<string, WorkflowNodePosition>;
export type WorkflowGraphEdge = { from: string; to: string; label?: string; className?: string };

const NODE_X = 185;
const NODE_Y = 132;

function outgoingIds(definition: CustomWorkflowDefinition, node: CustomWorkflowNode) {
  if (node.type === 'branch') return [node.trueTarget, node.falseTarget];
  return definition.edges.filter((edge) => edge.from === node.id).map((edge) => edge.to);
}

export function defaultWorkflowLayout(definition: CustomWorkflowDefinition): WorkflowLayout {
  const nodesById = new Map(definition.nodes.map((node) => [node.id, node]));
  const input = definition.nodes.find((node) => node.type === 'input') ?? definition.nodes[0];
  const depthById = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = input ? [{ id: input.id, depth: 0 }] : [];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    const previousDepth = depthById.get(next.id);
    if (previousDepth !== undefined && previousDepth <= next.depth) continue;
    depthById.set(next.id, next.depth);
    const node = nodesById.get(next.id);
    if (!node) continue;
    for (const target of outgoingIds(definition, node)) {
      queue.push({ id: target, depth: next.depth + 1 });
    }
  }

  const columnCounts = new Map<number, number>();
  return Object.fromEntries(
    definition.nodes.map((node, index) => {
      const depth = depthById.get(node.id) ?? index;
      const row = columnCounts.get(depth) ?? 0;
      columnCounts.set(depth, row + 1);
      return [
        node.id,
        {
          x: 80 + depth * NODE_X,
          y: 110 + row * NODE_Y + (node.type === 'output' ? 54 : 0),
        },
      ];
    }),
  );
}

export function normalizeWorkflowLayout(
  definition: CustomWorkflowDefinition,
  layout: WorkflowLayout,
): WorkflowLayout {
  const fallback = defaultWorkflowLayout(definition);
  return Object.fromEntries(
    definition.nodes.map((node) => [node.id, layout[node.id] ?? fallback[node.id] ?? { x: 80, y: 110 }]),
  );
}

export function buildWorkflowGraphEdges(definition: CustomWorkflowDefinition): WorkflowGraphEdge[] {
  const edgeMap = new Map<string, WorkflowGraphEdge>();
  for (const edge of definition.edges) {
    edgeMap.set(`${edge.from}->${edge.to}`, { from: edge.from, to: edge.to, label: edge.label });
  }
  for (const node of definition.nodes) {
    if (node.type !== 'branch') continue;
    edgeMap.set(`${node.id}->${node.trueTarget}`, {
      from: node.id,
      to: node.trueTarget,
      label: 'true',
      className: 'builder-flow-edge-true',
    });
    edgeMap.set(`${node.id}->${node.falseTarget}`, {
      from: node.id,
      to: node.falseTarget,
      label: 'false',
      className: 'builder-flow-edge-false',
    });
  }
  return Array.from(edgeMap.values());
}

export function applyWorkflowConnection(
  definition: CustomWorkflowDefinition,
  connection: Pick<Connection, 'source' | 'target'>,
): CustomWorkflowDefinition {
  const source = connection.source;
  const target = connection.target;
  if (!source || !target || source === target) return definition;

  const sourceNode = definition.nodes.find((node) => node.id === source);
  const targetNode = definition.nodes.find((node) => node.id === target);
  if (!sourceNode || !targetNode) return definition;
  if (sourceNode.type === 'output' || targetNode.type === 'input' || sourceNode.type === 'branch') {
    return definition;
  }

  const edges = definition.edges.filter((edge) => edge.from !== source);
  edges.push({ from: source, to: target });
  return { ...definition, edges };
}

export function validateWorkflowClient(definition: CustomWorkflowDefinition): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const node of definition.nodes) {
    if (ids.has(node.id)) issues.push(`Duplicate node id: ${node.id}`);
    ids.add(node.id);
  }

  if (definition.nodes.length > 12) issues.push('Workflow has more than 12 nodes.');
  if (definition.nodes.filter((node) => node.type === 'input').length !== 1) {
    issues.push('Workflow needs exactly one input node.');
  }
  if (definition.nodes.filter((node) => node.type === 'output').length !== 1) {
    issues.push('Workflow needs exactly one output node.');
  }

  for (const edge of definition.edges) {
    if (!ids.has(edge.from)) issues.push(`Edge starts at missing node: ${edge.from}`);
    if (!ids.has(edge.to)) issues.push(`Edge targets missing node: ${edge.to}`);
  }

  for (const node of definition.nodes) {
    if (node.type !== 'branch') continue;
    if (!ids.has(node.trueTarget)) issues.push(`${node.label} has a missing true target.`);
    if (!ids.has(node.falseTarget)) issues.push(`${node.label} has a missing false target.`);
  }

  const input = definition.nodes.find((node) => node.type === 'input');
  if (!input) return issues;

  const reachable = new Set<string>();
  const queue = [input.id];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || reachable.has(id)) continue;
    reachable.add(id);
    const node = definition.nodes.find((candidate) => candidate.id === id);
    if (!node) continue;
    queue.push(...outgoingIds(definition, node));
  }

  for (const node of definition.nodes) {
    if (!reachable.has(node.id)) issues.push(`${node.label || node.id} is not reachable from input.`);
  }

  return issues;
}
