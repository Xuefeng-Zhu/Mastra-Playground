import { describe, expect, it } from 'vitest';
import { SEEDED_CLIENT_CUSTOM_WORKFLOW } from './custom-workflow';
import {
  applyWorkflowConnection,
  buildWorkflowGraphEdges,
  defaultWorkflowLayout,
  normalizeWorkflowLayout,
  validateWorkflowClient,
} from './custom-workflow-flow';
import type { CustomWorkflowDefinition } from './custom-workflow';

describe('custom workflow flow helpers', () => {
  it('builds branch-labeled graph edges without changing executable JSON', () => {
    expect(buildWorkflowGraphEdges(SEEDED_CLIENT_CUSTOM_WORKFLOW)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'branch-1', to: 'tool-1', label: 'true' }),
        expect.objectContaining({ from: 'branch-1', to: 'output', label: 'false' }),
      ]),
    );
  });

  it('persists only node positions in layout helpers', () => {
    const layout = defaultWorkflowLayout(SEEDED_CLIENT_CUSTOM_WORKFLOW);
    const normalized = normalizeWorkflowLayout(SEEDED_CLIENT_CUSTOM_WORKFLOW, {
      draft: { x: 500, y: 240 },
    });

    expect(layout.input).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    expect(normalized.draft).toEqual({ x: 500, y: 240 });
    expect(Object.keys(normalized).sort()).toEqual(['branch-1', 'draft', 'input', 'output', 'tool-1']);
  });

  it('updates linear connections but leaves branch routing to node config', () => {
    const connected = applyWorkflowConnection(SEEDED_CLIENT_CUSTOM_WORKFLOW, {
      source: 'input',
      target: 'output',
    });
    expect(connected.edges).toContainEqual({ from: 'input', to: 'output' });
    expect(connected.edges).not.toContainEqual({ from: 'input', to: 'draft' });

    const withBranch: CustomWorkflowDefinition = {
      ...SEEDED_CLIENT_CUSTOM_WORKFLOW,
      nodes: SEEDED_CLIENT_CUSTOM_WORKFLOW.nodes.map((node) =>
        node.id === 'branch-1' && node.type === 'branch'
          ? { ...node, trueTarget: 'output', falseTarget: 'output' }
          : node,
      ),
    };
    expect(applyWorkflowConnection(withBranch, { source: 'branch-1', target: 'draft' })).toBe(withBranch);
  });

  it('reports lightweight client validation issues', () => {
    const invalid: CustomWorkflowDefinition = {
      ...SEEDED_CLIENT_CUSTOM_WORKFLOW,
      edges: [{ from: 'input', to: 'missing' }],
    };
    expect(validateWorkflowClient(invalid)).toEqual(
      expect.arrayContaining([
        'Edge targets missing node: missing',
        'Draft answer is not reachable from input.',
      ]),
    );
  });
});
