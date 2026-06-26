import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { ValidationError, isPlainObject, sanitizeText } from './validation';
import { resolveModel, type LlmProvider, type LlmRequestConfig } from './llm';
import {
  builtInLlmConfigFromProviderKey,
  customLlmConfigFromFields,
  parseRequestProvider,
} from './llm-request-config';
import type { RunContext } from './cancellable-run';
import type { Tracer } from './tracer';
import { SEEDED_CUSTOM_WORKFLOW } from './custom-workflow-seed';
import { branchEvaluate, startRun, stepEnd, stepStart, toolCall, type StepSpec } from './traced-step';

const MAX_NODES = 12;
const MAX_TEMPLATE_LENGTH = 4096;
const MAX_KEY_LENGTH = 64;

const nodeId = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Node ids may contain letters, numbers, underscores, and dashes.');
const outputKey = z
  .string()
  .trim()
  .min(1)
  .max(MAX_KEY_LENGTH)
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_]*$/,
    'Output keys must start with a letter and use letters, numbers, or underscores.',
  );
const safeText = (field: string, maxLength = MAX_TEMPLATE_LENGTH) =>
  z
    .string({ error: `Field "${field}" must be a string` })
    .max(maxLength, `Field "${field}" must be ${maxLength} characters or fewer.`)
    .transform((value) => sanitizeText(value, maxLength));

const BaseNodeSchema = z.object({
  id: nodeId,
  label: safeText('label', 80),
});

const InputNodeSchema = BaseNodeSchema.extend({
  type: z.literal('input'),
});

const LlmNodeSchema = BaseNodeSchema.extend({
  type: z.literal('llm'),
  instruction: safeText('instruction'),
  promptTemplate: safeText('promptTemplate'),
  outputKey,
});

const ToolIdSchema = z.enum(['echo', 'summarize', 'keyword']);

const ToolNodeSchema = BaseNodeSchema.extend({
  type: z.literal('tool'),
  toolId: ToolIdSchema,
  inputTemplate: safeText('inputTemplate'),
  outputKey,
});

const BranchNodeSchema = BaseNodeSchema.extend({
  type: z.literal('branch'),
  sourceKey: outputKey,
  operator: z.enum(['contains', 'equals', 'nonEmpty']),
  value: safeText('value', 256).optional(),
  trueTarget: nodeId,
  falseTarget: nodeId,
});

const OutputNodeSchema = BaseNodeSchema.extend({
  type: z.literal('output'),
  template: safeText('template'),
});

export const CustomWorkflowNodeSchema = z.discriminatedUnion('type', [
  InputNodeSchema,
  LlmNodeSchema,
  ToolNodeSchema,
  BranchNodeSchema,
  OutputNodeSchema,
]);

export const CustomWorkflowEdgeSchema = z.object({
  from: nodeId,
  to: nodeId,
  label: safeText('label', 80).optional(),
});

const RawCustomWorkflowDefinitionSchema = z.object({
  version: z.literal(1),
  id: nodeId,
  name: safeText('name', 80),
  description: safeText('description', 240).optional(),
  input: z.object({
    label: safeText('input.label', 80),
    placeholder: safeText('input.placeholder', 240).optional(),
  }),
  nodes: z.array(CustomWorkflowNodeSchema).min(2).max(MAX_NODES),
  edges: z.array(CustomWorkflowEdgeSchema).max(MAX_NODES * 2),
});

export type CustomWorkflowNode = z.infer<typeof CustomWorkflowNodeSchema>;
export type CustomWorkflowDefinition = z.infer<typeof RawCustomWorkflowDefinitionSchema>;
export type CustomWorkflowContext = Record<string, unknown>;
export type CustomToolId = z.infer<typeof ToolIdSchema>;
export interface CustomWorkflowRunRequest {
  workflow: CustomWorkflowDefinition;
  input: { prompt: string };
  provider?: LlmProvider;
  model?: string;
  llmConfig?: LlmRequestConfig;
}

export const CUSTOM_WORKFLOW_TOOLS: Record<CustomToolId, { label: string; run(input: string): unknown }> = {
  echo: {
    label: 'Echo',
    run: (input) => ({ text: input }),
  },
  summarize: {
    label: 'Summarize',
    run: (input) => {
      const words = input.split(/\s+/).filter(Boolean);
      return {
        summary: words.slice(0, 24).join(' '),
        wordCount: words.length,
      };
    },
  },
  keyword: {
    label: 'Keyword Extractor',
    run: (input) => {
      const keywords = Array.from(
        new Set(
          input
            .toLowerCase()
            .replaceAll(/[^a-z0-9\s-]/g, ' ')
            .split(/\s+/)
            .filter((word) => word.length > 4),
        ),
      ).slice(0, 8);
      return { keywords };
    },
  },
};

export { SEEDED_CUSTOM_WORKFLOW };

function addIssue(ctx: z.RefinementCtx, message: string, path: Array<string | number> = []) {
  ctx.addIssue({ code: 'custom', message, path });
}

function outgoingEdges(definition: CustomWorkflowDefinition, nodeIdValue: string) {
  return definition.edges.filter((edge) => edge.from === nodeIdValue);
}

function firstLinearTarget(definition: CustomWorkflowDefinition, nodeIdValue: string): string | undefined {
  return outgoingEdges(definition, nodeIdValue)[0]?.to;
}

function producedKey(node: CustomWorkflowNode): string | null {
  return node.type === 'llm' || node.type === 'tool' ? node.outputKey : null;
}

function validateGraph(definition: CustomWorkflowDefinition, ctx: z.RefinementCtx) {
  const ids = new Set<string>();
  const outputKeys = new Map<string, string>();
  for (const [index, node] of definition.nodes.entries()) {
    if (ids.has(node.id)) addIssue(ctx, `Duplicate node id "${node.id}".`, ['nodes', index, 'id']);
    ids.add(node.id);
    if (node.type === 'llm' || node.type === 'tool') {
      const previousNodeId = outputKeys.get(node.outputKey);
      if (previousNodeId) {
        addIssue(ctx, `Output key "${node.outputKey}" is already produced by "${previousNodeId}".`, [
          'nodes',
          index,
          'outputKey',
        ]);
      } else {
        outputKeys.set(node.outputKey, node.id);
      }
    }
  }

  const inputNodes = definition.nodes.filter((node) => node.type === 'input');
  const outputNodes = definition.nodes.filter((node) => node.type === 'output');
  if (inputNodes.length !== 1) addIssue(ctx, 'Custom workflows must have exactly one input node.', ['nodes']);
  if (outputNodes.length !== 1)
    addIssue(ctx, 'Custom workflows must have exactly one output node.', ['nodes']);

  for (const [index, edge] of definition.edges.entries()) {
    if (!ids.has(edge.from))
      addIssue(ctx, `Edge starts at unknown node "${edge.from}".`, ['edges', index, 'from']);
    if (!ids.has(edge.to)) addIssue(ctx, `Edge targets unknown node "${edge.to}".`, ['edges', index, 'to']);
  }

  for (const [index, node] of definition.nodes.entries()) {
    if (node.type === 'output') {
      if (outgoingEdges(definition, node.id).length > 0) {
        addIssue(ctx, 'Output nodes must not have outgoing edges.', ['nodes', index]);
      }
      continue;
    }

    if (node.type === 'branch') {
      if (!outputKeys.has(node.sourceKey)) {
        addIssue(ctx, `Branch source key "${node.sourceKey}" is not produced by an earlier step.`, [
          'nodes',
          index,
          'sourceKey',
        ]);
      }
      if (!ids.has(node.trueTarget))
        addIssue(ctx, `Branch true target "${node.trueTarget}" is missing.`, ['nodes', index]);
      if (!ids.has(node.falseTarget)) {
        addIssue(ctx, `Branch false target "${node.falseTarget}" is missing.`, ['nodes', index]);
      }
      continue;
    }

    const outgoing = outgoingEdges(definition, node.id);
    if (outgoing.length !== 1) {
      addIssue(ctx, `Node "${node.id}" must have exactly one outgoing edge.`, ['nodes', index]);
    }
  }

  const input = inputNodes[0];
  if (!input) return;

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) {
      addIssue(ctx, `Custom workflow contains a cycle at "${id}".`, ['nodes']);
      return;
    }
    if (visited.has(id)) return;
    const node = definition.nodes.find((candidate) => candidate.id === id);
    if (!node) return;
    visiting.add(id);
    const targets =
      node.type === 'branch'
        ? [node.trueTarget, node.falseTarget]
        : outgoingEdges(definition, id).map((edge) => edge.to);
    if (node.type !== 'output' && targets.length === 0) {
      addIssue(ctx, `Node "${node.id}" does not route to the output node.`, ['nodes']);
    }
    for (const target of targets) visit(target);
    visiting.delete(id);
    visited.add(id);
  };
  visit(input.id);

  for (const node of definition.nodes) {
    if (!visited.has(node.id)) addIssue(ctx, `Node "${node.id}" is not reachable from input.`, ['nodes']);
  }

  const branchSourceIssues = new Set<string>();
  const validateProducedKeys = (id: string, availableKeys: Set<string>, path: Set<string>) => {
    if (path.has(id)) return;
    const node = definition.nodes.find((candidate) => candidate.id === id);
    if (!node) return;

    const nextPath = new Set(path).add(id);
    let nextKeys = availableKeys;
    if (node.type === 'branch') {
      if (!availableKeys.has(node.sourceKey) && !branchSourceIssues.has(node.id)) {
        branchSourceIssues.add(node.id);
        const index = definition.nodes.findIndex((candidate) => candidate.id === node.id);
        addIssue(ctx, `Branch source key "${node.sourceKey}" is not available before "${node.id}".`, [
          'nodes',
          index,
          'sourceKey',
        ]);
      }
    } else {
      const key = producedKey(node);
      if (key) nextKeys = new Set(availableKeys).add(key);
    }

    const targets =
      node.type === 'branch'
        ? [node.trueTarget, node.falseTarget]
        : outgoingEdges(definition, id).map((edge) => edge.to);
    for (const target of targets) validateProducedKeys(target, nextKeys, nextPath);
  };
  validateProducedKeys(input.id, new Set(), new Set());
}

export const CustomWorkflowDefinitionSchema = RawCustomWorkflowDefinitionSchema.superRefine(validateGraph);

export function validateCustomWorkflowDefinition(body: unknown): CustomWorkflowDefinition {
  if (!isPlainObject(body))
    throw new ValidationError('Workflow definition must be a JSON object.', 'workflow');
  const result = CustomWorkflowDefinitionSchema.safeParse(body);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue?.path.join('.') || 'workflow';
  throw new ValidationError(issue?.message ?? 'Invalid workflow definition.', field);
}

export function validateCustomWorkflowRunRequest(body: unknown): CustomWorkflowRunRequest {
  if (!isPlainObject(body)) throw new ValidationError('Request body must be a JSON object.', 'body');
  const workflow = validateCustomWorkflowDefinition(body.workflow);
  const inputBody = isPlainObject(body.input) ? body.input : {};
  const prompt =
    typeof inputBody.prompt === 'string' ? sanitizeText(inputBody.prompt, MAX_TEMPLATE_LENGTH) : '';
  if (!prompt.trim())
    throw new ValidationError('Field "input.prompt" must be a non-empty string.', 'input.prompt');

  const provider = parseRequestProvider(body.provider);
  const model =
    typeof body.model === 'string' && body.model.trim() ? sanitizeText(body.model, 512) : undefined;

  if (provider === 'custom') {
    return {
      workflow,
      input: { prompt },
      provider,
      model,
      llmConfig: customLlmConfigFromFields({
        customBaseUrl: body.customBaseUrl,
        customApiKey: body.customApiKey,
        customModel: body.customModel,
      }),
    };
  }

  const llmConfig = builtInLlmConfigFromProviderKey(provider, body.providerApiKey);
  return { workflow, input: { prompt }, provider, model, llmConfig };
}

function lookupValue(context: CustomWorkflowContext, path: string): unknown {
  return path.split('.').reduce<unknown>((value, part) => {
    if (value && typeof value === 'object' && part in value) return (value as Record<string, unknown>)[part];
    return undefined;
  }, context);
}

export function renderTemplate(template: string, context: CustomWorkflowContext): string {
  return template.replaceAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*\}\}/g, (_match, key: string) => {
    const value = lookupValue(context, key);
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  });
}

function evaluateBranch(
  node: Extract<CustomWorkflowNode, { type: 'branch' }>,
  context: CustomWorkflowContext,
) {
  const value = lookupValue(context, node.sourceKey);
  const text = value === undefined || value === null ? '' : String(value);
  if (node.operator === 'nonEmpty') return text.trim().length > 0;
  if (node.operator === 'equals') return text === (node.value ?? '');
  return text.includes(node.value ?? '');
}

function nodeKind(node: CustomWorkflowNode): StepSpec['kind'] {
  if (node.type === 'input') return 'input';
  if (node.type === 'llm') return 'llm';
  if (node.type === 'tool') return 'tool';
  if (node.type === 'branch') return 'branch';
  return 'passthrough';
}

export async function runCustomWorkflow(
  definition: CustomWorkflowDefinition,
  input: { prompt: string },
  tracer: Tracer,
  context?: RunContext,
  request?: { provider?: LlmProvider; model?: string; llmConfig?: LlmRequestConfig },
) {
  const workflow = validateCustomWorkflowDefinition(definition);
  const safePrompt = sanitizeText(input.prompt, MAX_TEMPLATE_LENGTH);
  const runtime: CustomWorkflowContext = { input: { prompt: safePrompt } };
  const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const steps = workflow.nodes.map((node) => ({ id: node.id, label: node.label, kind: nodeKind(node) }));
  const t0 = startRun(tracer, workflow.name, { prompt: safePrompt }, steps);

  let current: string | undefined = workflow.nodes.find((node) => node.type === 'input')?.id;
  let output: unknown = null;
  const visited = new Set<string>();

  while (current) {
    if (context?.signal?.aborted) throw new Error('Workflow run aborted.');
    if (visited.has(current))
      throw new ValidationError(`Workflow cycle encountered at "${current}".`, 'workflow');
    visited.add(current);

    const node = nodesById.get(current);
    if (!node) throw new ValidationError(`Workflow node "${current}" was not found.`, 'workflow');

    stepStart(tracer, node.id, node.type === 'input' ? { prompt: safePrompt } : runtime);
    if (node.type === 'input') {
      stepEnd(tracer, node.id, { prompt: safePrompt });
      current = firstLinearTarget(workflow, node.id);
      continue;
    }

    if (node.type === 'llm') {
      const startedAt = Date.now();
      tracer.emit({ type: 'llm:start', stepId: node.id, model: request?.model });
      const model = resolveModel(request?.model, request?.provider, request?.llmConfig ?? context?.llmConfig);
      const agent = new Agent({
        id: `custom-${workflow.id}-${node.id}`,
        name: node.label,
        instructions: node.instruction,
        model,
      });
      const prompt = renderTemplate(node.promptTemplate, runtime);
      const result = await agent.generate(prompt, { abortSignal: context?.signal });
      const text = String(result.text ?? '').trim();
      runtime[node.outputKey] = text;
      tracer.emit({
        type: 'llm:end',
        stepId: node.id,
        totalChars: text.length,
        durationMs: Date.now() - startedAt,
      });
      stepEnd(tracer, node.id, { outputKey: node.outputKey, text });
      current = firstLinearTarget(workflow, node.id);
      continue;
    }

    if (node.type === 'tool') {
      const tool = CUSTOM_WORKFLOW_TOOLS[node.toolId];
      const toolInput = renderTemplate(node.inputTemplate, runtime);
      const toolOutput = tool.run(toolInput);
      runtime[node.outputKey] = toolOutput;
      toolCall(tracer, node.id, node.toolId, toolInput, toolOutput);
      stepEnd(tracer, node.id, { outputKey: node.outputKey, output: toolOutput });
      current = firstLinearTarget(workflow, node.id);
      continue;
    }

    if (node.type === 'branch') {
      const matched = evaluateBranch(node, runtime);
      branchEvaluate(tracer, node.id, matched, `${node.sourceKey} ${node.operator}`);
      stepEnd(tracer, node.id, { matched, next: matched ? node.trueTarget : node.falseTarget });
      current = matched ? node.trueTarget : node.falseTarget;
      continue;
    }

    output = {
      answer: renderTemplate(node.template, runtime),
      context: runtime,
      workflow: { id: workflow.id, name: workflow.name },
    };
    stepEnd(tracer, node.id, output);
    current = undefined;
  }

  const finalOutput = output ?? {
    answer: '',
    context: runtime,
    workflow: { id: workflow.id, name: workflow.name },
  };
  tracer.emit({ type: 'done', status: 'success', output: finalOutput, totalMs: Date.now() - t0 });
  return {
    status: 'success' as const,
    input: { prompt: safePrompt },
    output: finalOutput,
    totalMs: Date.now() - t0,
  };
}
