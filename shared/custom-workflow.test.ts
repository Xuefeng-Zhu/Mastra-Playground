import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Tracer, type TraceEvent } from './tracer';
import {
  SEEDED_CUSTOM_WORKFLOW,
  runCustomWorkflow,
  validateCustomWorkflowRunRequest,
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
      { from: 'tool-1', to: 'output' },
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

  it('rejects ambiguous custom graph contracts before runtime', () => {
    const duplicateOutputKey = cloneWorkflow();
    const tool = duplicateOutputKey.nodes.find((node) => node.type === 'tool');
    if (tool?.type === 'tool') tool.outputKey = 'draft';
    expect(() => validateCustomWorkflowDefinition(duplicateOutputKey)).toThrow('Output key');

    const missingSource = cloneWorkflow();
    const branch = missingSource.nodes.find((node) => node.type === 'branch');
    if (branch?.type === 'branch') branch.sourceKey = 'missing_key';
    expect(() => validateCustomWorkflowDefinition(missingSource)).toThrow('source key');

    const downstreamSource: CustomWorkflowDefinition = {
      version: 1,
      id: 'downstream-source',
      name: 'Downstream Source',
      input: { label: 'Prompt' },
      nodes: [
        { id: 'input', type: 'input', label: 'Input' },
        {
          id: 'branch',
          type: 'branch',
          label: 'Branch',
          sourceKey: 'draft',
          operator: 'nonEmpty',
          trueTarget: 'draft',
          falseTarget: 'output',
        },
        {
          id: 'draft',
          type: 'llm',
          label: 'Draft',
          instruction: 'Draft',
          promptTemplate: '{{input.prompt}}',
          outputKey: 'draft',
        },
        { id: 'output', type: 'output', label: 'Output', template: '{{draft}}' },
      ],
      edges: [
        { from: 'input', to: 'branch' },
        { from: 'draft', to: 'output' },
      ],
    };
    expect(() => validateCustomWorkflowDefinition(downstreamSource)).toThrow('not available');

    const danglingRoute = cloneWorkflow();
    const originalBranch = danglingRoute.nodes.find((node) => node.type === 'branch');
    if (originalBranch?.type === 'branch') originalBranch.falseTarget = 'fallback';
    danglingRoute.nodes.splice(4, 0, {
      id: 'fallback',
      type: 'tool',
      label: 'Fallback',
      toolId: 'echo',
      inputTemplate: 'fallback',
      outputKey: 'fallback',
    });
    expect(() => validateCustomWorkflowDefinition(danglingRoute)).toThrow('exactly one outgoing edge');
  });
});

describe('custom workflow run request validation', () => {
  it('uses shared request-scoped provider validation', () => {
    expect(
      validateCustomWorkflowRunRequest({
        workflow: cloneWorkflow(),
        input: { prompt: 'hello' },
        provider: 'custom',
        model: 'body-model',
        customBaseUrl: 'https://provider.example/v1',
        customApiKey: 'secret',
        customModel: 'custom-model',
      }),
    ).toMatchObject({
      provider: 'custom',
      model: 'body-model',
      llmConfig: {
        provider: 'custom',
        baseUrl: 'https://provider.example/v1',
        apiKey: 'secret',
        model: 'custom-model',
      },
    });

    expect(() =>
      validateCustomWorkflowRunRequest({
        workflow: cloneWorkflow(),
        input: { prompt: 'hello' },
        provider: 'custom',
        customBaseUrl: 'https://user:pass@provider.example/v1',
        customApiKey: 'secret',
        customModel: 'custom-model',
      }),
    ).toThrow('embedded credentials');
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
        { from: 'fallback', to: 'output' },
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

  it('runs tool-only workflows without resolving an LLM model', async () => {
    const workflow: CustomWorkflowDefinition = {
      version: 1,
      id: 'tool-only',
      name: 'Tool Only',
      input: { label: 'Prompt' },
      nodes: [
        { id: 'input', type: 'input', label: 'Input' },
        {
          id: 'echo',
          type: 'tool',
          label: 'Echo',
          toolId: 'echo',
          inputTemplate: '{{input.prompt}}',
          outputKey: 'echo_result',
        },
        { id: 'output', type: 'output', label: 'Output', template: '{{echo_result}}' },
      ],
      edges: [
        { from: 'input', to: 'echo' },
        { from: 'echo', to: 'output' },
      ],
    };
    const result = await runCustomWorkflow(workflow, { prompt: 'hello without llm' }, new Tracer());

    expect(result.output).toMatchObject({ answer: '{"text":"hello without llm"}' });
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
