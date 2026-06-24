import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Tracer, type TraceEvent } from './tracer';
import {
  SEEDED_CUSTOM_WORKFLOW,
  runCustomWorkflow,
  validateCustomWorkflowDefinition,
  type CustomWorkflowDefinition,
} from './custom-workflow';

vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    async generate() {
      return { text: 'mock llm output' };
    }
  },
}));

function cloneWorkflow(workflow = SEEDED_CUSTOM_WORKFLOW): CustomWorkflowDefinition {
  return JSON.parse(JSON.stringify(workflow)) as CustomWorkflowDefinition;
}

function captureEvents(tracer: Tracer): TraceEvent[] {
  const events: TraceEvent[] = [];
  tracer.subscribe((event) => events.push(event));
  return events;
}

describe('custom workflow definition validation', () => {
  it('accepts the seeded template', () => {
    expect(validateCustomWorkflowDefinition(SEEDED_CUSTOM_WORKFLOW)).toMatchObject({
      id: 'starter-builder-workflow',
      nodes: expect.arrayContaining([expect.objectContaining({ id: 'input' })]),
    });
  });

  it('rejects cycles, missing branch targets, duplicate ids, unknown tools, too many nodes, and oversized prompts', () => {
    const cyclic = cloneWorkflow();
    cyclic.edges = [
      { from: 'input', to: 'draft' },
      { from: 'draft', to: 'input' },
      { from: 'draft', to: 'output' },
    ];
    expect(() => validateCustomWorkflowDefinition(cyclic)).toThrow('cycle');

    const missingTarget = cloneWorkflow();
    missingTarget.nodes.splice(2, 0, {
      id: 'branch',
      type: 'branch',
      label: 'Branch',
      sourceKey: 'draft',
      operator: 'contains',
      value: 'yes',
      trueTarget: 'missing',
      falseTarget: 'output',
    });
    missingTarget.edges = [
      { from: 'input', to: 'draft' },
      { from: 'draft', to: 'branch' },
    ];
    expect(() => validateCustomWorkflowDefinition(missingTarget)).toThrow('true target');

    const duplicate = cloneWorkflow();
    duplicate.nodes[1] = { ...duplicate.nodes[1], id: 'input' };
    expect(() => validateCustomWorkflowDefinition(duplicate)).toThrow('Duplicate node id');

    const unknownTool = cloneWorkflow();
    unknownTool.nodes.splice(2, 0, {
      id: 'tool-1',
      type: 'tool',
      label: 'Tool',
      toolId: 'filesystem',
      inputTemplate: '{{input.prompt}}',
      outputKey: 'tool_1',
    } as unknown as CustomWorkflowDefinition['nodes'][number]);
    expect(() => validateCustomWorkflowDefinition(unknownTool)).toThrow();

    const tooMany = cloneWorkflow();
    for (let index = 0; index < 10; index += 1) {
      tooMany.nodes.splice(1, 0, {
        id: `llm-${index}`,
        type: 'llm',
        label: `LLM ${index}`,
        instruction: 'Help',
        promptTemplate: '{{input.prompt}}',
        outputKey: `llm_${index}`,
      });
    }
    expect(() => validateCustomWorkflowDefinition(tooMany)).toThrow();

    const oversized = cloneWorkflow();
    const llmNode = oversized.nodes.find((node) => node.type === 'llm');
    if (llmNode?.type === 'llm') llmNode.promptTemplate = 'x'.repeat(5000);
    expect(() => validateCustomWorkflowDefinition(oversized)).toThrow();
  });
});

describe('custom workflow runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs the seeded LLM branch/tool workflow and emits trace events', async () => {
    const tracer = new Tracer();
    const events = captureEvents(tracer);
    const result = await runCustomWorkflow(cloneWorkflow(), { prompt: 'hello' }, tracer);

    expect(result.output).toMatchObject({
      answer: 'mock llm output\n\n{"text":"mock llm output"}',
    });
    expect(events.map((event) => event.type)).toEqual([
      'start',
      'step:start',
      'step:end',
      'step:start',
      'llm:start',
      'llm:end',
      'step:end',
      'step:start',
      'branch:evaluate',
      'step:end',
      'step:start',
      'tool:call',
      'step:end',
      'step:start',
      'step:end',
      'done',
    ]);
  });

  it('records tool calls and routes branches', async () => {
    const workflow: CustomWorkflowDefinition = {
      version: 1,
      id: 'branch-tool',
      name: 'Branch Tool',
      input: { label: 'Prompt' },
      nodes: [
        { id: 'input', type: 'input', label: 'Input' },
        {
          id: 'keywords',
          type: 'tool',
          label: 'Keywords',
          toolId: 'keyword',
          inputTemplate: '{{input.prompt}}',
          outputKey: 'keywords',
        },
        {
          id: 'branch',
          type: 'branch',
          label: 'Has keywords',
          sourceKey: 'keywords',
          operator: 'nonEmpty',
          trueTarget: 'output',
          falseTarget: 'fallback',
        },
        {
          id: 'fallback',
          type: 'tool',
          label: 'Fallback',
          toolId: 'echo',
          inputTemplate: 'fallback',
          outputKey: 'fallback',
        },
        { id: 'output', type: 'output', label: 'Output', template: '{{keywords}}' },
      ],
      edges: [
        { from: 'input', to: 'keywords' },
        { from: 'keywords', to: 'branch' },
      ],
    };
    const tracer = new Tracer();
    const events = captureEvents(tracer);
    await runCustomWorkflow(workflow, { prompt: 'workflow builder keyword routing' }, tracer);

    expect(events).toContainEqual(
      expect.objectContaining({ type: 'tool:call', stepId: 'keywords', tool: 'keyword' }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'branch:evaluate', stepId: 'branch', matched: true }),
    );
  });

  it('rejects invalid workflows before emitting start', async () => {
    const invalid = cloneWorkflow();
    invalid.nodes[1] = { ...invalid.nodes[1], id: 'input' };
    const tracer = new Tracer();
    const events = captureEvents(tracer);

    await expect(runCustomWorkflow(invalid, { prompt: 'nope' }, tracer)).rejects.toThrow('Duplicate node id');
    expect(events).toEqual([]);
  });
});
