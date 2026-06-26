import type { CustomWorkflowDefinition } from './custom-workflow';

export const SEEDED_CUSTOM_WORKFLOW: CustomWorkflowDefinition = {
  version: 1,
  id: 'starter-builder-workflow',
  name: 'Starter Workflow',
  description: 'Input to LLM to output.',
  input: {
    label: 'Prompt',
    placeholder: 'Describe what you want the workflow to process.',
  },
  nodes: [
    { id: 'input', type: 'input', label: 'Input' },
    {
      id: 'draft',
      type: 'llm',
      label: 'Draft answer',
      instruction: 'You are a concise assistant in a workflow learning playground.',
      promptTemplate: 'User request: {{input.prompt}}\n\nWrite a practical answer.',
      outputKey: 'draft',
    },
    {
      id: 'branch-1',
      type: 'branch',
      label: 'Needs enrichment?',
      sourceKey: 'draft',
      operator: 'nonEmpty',
      trueTarget: 'tool-1',
      falseTarget: 'output',
    },
    {
      id: 'tool-1',
      type: 'tool',
      label: 'Echo context',
      toolId: 'echo',
      inputTemplate: '{{draft}}',
      outputKey: 'echo_result',
    },
    { id: 'output', type: 'output', label: 'Output', template: '{{draft}}\n\n{{echo_result}}' },
  ],
  edges: [
    { from: 'input', to: 'draft' },
    { from: 'draft', to: 'branch-1' },
    { from: 'tool-1', to: 'output' },
  ],
};
