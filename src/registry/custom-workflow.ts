import type { CustomWorkflowDefinition, CustomWorkflowNode } from '../../shared/custom-workflow';
import { SEEDED_CUSTOM_WORKFLOW } from '../../shared/custom-workflow-seed';
import type { GraphDef, NodeKind } from './graphs';

export type { CustomWorkflowDefinition, CustomWorkflowNode };

export const CUSTOM_WORKFLOW_HASH = 'workflow-builder';
export const CUSTOM_WORKFLOW_STORAGE_KEY = 'mpg:custom-workflow:v1';

export const CLIENT_CUSTOM_TOOL_OPTIONS = [
  { value: 'echo', label: 'Echo' },
  { value: 'summarize', label: 'Summarize' },
  { value: 'keyword', label: 'Keyword Extractor' },
] as const;

export const SEEDED_CLIENT_CUSTOM_WORKFLOW: CustomWorkflowDefinition = SEEDED_CUSTOM_WORKFLOW;

function graphKind(node: CustomWorkflowNode): NodeKind {
  if (node.type === 'input') return 'input';
  if (node.type === 'llm') return 'llm';
  if (node.type === 'tool') return 'tool';
  if (node.type === 'branch') return 'branch';
  return 'passthrough';
}

export function customWorkflowToGraph(definition: CustomWorkflowDefinition): GraphDef {
  const nodes = definition.nodes.map((node, index) => {
    const isBranchTarget =
      node.type !== 'branch' &&
      definition.nodes.some((candidate) => {
        return (
          candidate.type === 'branch' &&
          (candidate.trueTarget === node.id || candidate.falseTarget === node.id)
        );
      });
    return {
      id: node.id,
      label: node.label || node.id,
      kind: graphKind(node),
      x: isBranchTarget ? 180 : 60,
      y: 60 + index * 120,
      label2:
        node.type === 'llm'
          ? node.outputKey
          : node.type === 'tool'
            ? node.toolId
            : node.type === 'branch'
              ? node.operator
              : undefined,
    };
  });

  const edgeMap = new Map<string, { from: string; to: string; label?: string; predicate?: string }>();
  for (const edge of definition.edges) {
    edgeMap.set(`${edge.from}->${edge.to}`, { from: edge.from, to: edge.to, label: edge.label });
  }
  for (const node of definition.nodes) {
    if (node.type !== 'branch') continue;
    edgeMap.set(`${node.id}->${node.trueTarget}`, {
      from: node.id,
      to: node.trueTarget,
      label: 'true',
      predicate: `${node.sourceKey} ${node.operator}`,
    });
    edgeMap.set(`${node.id}->${node.falseTarget}`, {
      from: node.id,
      to: node.falseTarget,
      label: 'false',
      predicate: `${node.sourceKey} ${node.operator}`,
    });
  }

  return { nodes, edges: Array.from(edgeMap.values()) };
}

export function cloneSeedWorkflow(): CustomWorkflowDefinition {
  return JSON.parse(JSON.stringify(SEEDED_CLIENT_CUSTOM_WORKFLOW)) as CustomWorkflowDefinition;
}
