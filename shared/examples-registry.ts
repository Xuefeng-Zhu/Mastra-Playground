/**
 * Server-side example registry.
 *
 * Maps URL slugs to example file paths and metadata. Used by the Next.js
 * route handlers to dynamically load and run examples.
 */

import { ValidationError } from './validation';
import type { Tracer } from './tracer';
import type { CustomLlmConfig } from './llm';

export const EXAMPLES: Record<string, { file: string; exportName: string; description: string }> = {
  'support-triage': {
    file: 'examples/01-support-triage/index.ts',
    exportName: 'runOne',
    description: 'Customer-support triage. Classifies the message, routes to bot-reply or human-escalation.',
  },
  research: {
    file: 'examples/02-research-agent/index.ts',
    exportName: 'runOne',
    description: 'Research agent with two mocked tools (web-search, arxiv).',
  },
  'code-review': {
    file: 'examples/03-code-review-agent/index.ts',
    exportName: 'runOne',
    description: 'Code-review pipeline: read file → run lint → if issues, LLM writes a review.',
  },
  'parallel-research': {
    file: 'examples/04-parallel-research/index.ts',
    exportName: 'runOne',
    description: 'Parallel research: plan sub-questions, fan out to web+arxiv+wiki in parallel, synthesize.',
  },
  'multi-turn-chat': {
    file: 'examples/05-multi-turn-chat/index.ts',
    exportName: 'runOne',
    description:
      'Multi-turn chat with explicit conversation history. Send 3+ messages, see context persist, agent can escalate or look up orders.',
  },
  'hitl-approval': {
    file: 'examples/06-hitl-approval/index.ts',
    exportName: 'runOne',
    description:
      'Human-in-the-loop approval. High-risk actions suspend; human clicks Approve/Reject to resume.',
  },
  'streaming-chat': {
    file: 'examples/07-streaming-chat/index.ts',
    exportName: 'runOne',
    description: 'Streaming tokens: LLM response appears token-by-token via Agent.stream().',
  },
  'critic-loop': {
    file: 'examples/08-critic-loop/index.ts',
    exportName: 'runOne',
    description:
      'Evaluator-optimizer: generate → critique → regenerate using the feedback until the score meets the threshold or the iteration budget runs out.',
  },
  'multi-agent-handoff': {
    file: 'examples/09-multi-agent-handoff/index.ts',
    exportName: 'runOne',
    description:
      'Multi-agent handoff: primary triage agent delegates billing questions to a specialist agent with a narrower tool set.',
  },
  'content-pipeline': {
    file: 'examples/11-content-pipeline/index.ts',
    exportName: 'runOne',
    description:
      '3-agent content pipeline: researcher produces facts+sources, writer drafts, editor polishes and scores 0-10. Three narrow role prompts instead of one generalist.',
  },
  'mastra-memory': {
    file: 'examples/10-mastra-memory/index.ts',
    exportName: 'runOne',
    description:
      'Real @mastra/memory Memory class: threadId+resourceId tie generate() calls together. Compare to Example 05 hand-rolled Map.',
  },
};

export interface RunContext {
  signal?: AbortSignal;
  /** Request-scoped custom LLM configuration (browser-supplied, never logged). */
  customLlm?: CustomLlmConfig;
}

export type RunFn = (input: unknown, tracer: Tracer, context?: RunContext) => Promise<unknown>;

export function getExampleOrThrow(name: string) {
  if (!EXAMPLES[name]) {
    throw new ValidationError(
      `Unknown example: ${name}. Available: ${Object.keys(EXAMPLES).join(', ')}`,
      'example',
    );
  }
  return EXAMPLES[name];
}

/**
 * Static import map for examples.
 *
 * Next.js/Turbopack cannot resolve fully dynamic imports like
 * `import(\`../\${path}\`)`. We use a static map of lazy imports
 * that Turbopack can trace at build time.
 */
const EXAMPLE_LOADERS: Record<string, () => Promise<Record<string, unknown>>> = {
  'support-triage': () => import('../examples/01-support-triage/index'),
  research: () => import('../examples/02-research-agent/index'),
  'code-review': () => import('../examples/03-code-review-agent/index'),
  'parallel-research': () => import('../examples/04-parallel-research/index'),
  'multi-turn-chat': () => import('../examples/05-multi-turn-chat/index'),
  'hitl-approval': () => import('../examples/06-hitl-approval/index'),
  'streaming-chat': () => import('../examples/07-streaming-chat/index'),
  'critic-loop': () => import('../examples/08-critic-loop/index'),
  'multi-agent-handoff': () => import('../examples/09-multi-agent-handoff/index'),
  'mastra-memory': () => import('../examples/10-mastra-memory/index'),
  'content-pipeline': () => import('../examples/11-content-pipeline/index'),
};

export async function loadRunFn(name: string): Promise<RunFn> {
  const meta = getExampleOrThrow(name);
  const loader = EXAMPLE_LOADERS[name];
  if (!loader) {
    throw new ValidationError(`No loader registered for example '${name}'.`);
  }
  const mod = await loader();
  const fn = mod[meta.exportName] as RunFn | undefined;
  if (typeof fn !== 'function') {
    throw new ValidationError(`Example ${name} does not export '${meta.exportName}' as a function.`);
  }
  return fn;
}
