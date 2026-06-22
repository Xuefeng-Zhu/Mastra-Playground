/**
 * EXAMPLES — config for each of the 11 examples.
 *
 * Each example drives its own workspace: the form fields, the graph, the
 * output renderer, and the run-button label. Adding a new example is one
 * entry here + one branch in `renderers.tsx` (only if the new example's
 * output shape doesn't fit an existing renderer).
 */

import type { GraphDef } from './graphs';
import { GRAPHS } from './graphs';

export type OutputKind =
  | 'parallel'
  | 'triage'
  | 'research'
  | 'codeReview'
  | 'chat'
  | 'streaming'
  | 'hitl'
  | 'criticLoop'
  | 'contentPipeline'
  | 'mastraMemory';

export interface FormFieldBase {
  name: string;
  label: string;
  required?: boolean;
}

export interface TextAreaField extends FormFieldBase {
  type: 'textarea';
  default?: string;
  rows?: number;
}

export interface InputField extends FormFieldBase {
  type: 'input';
  default?: string;
}

export interface SelectField extends FormFieldBase {
  type: 'select';
  default?: string;
  options: { value: string; label: string }[];
}

export interface SliderField extends FormFieldBase {
  type: 'slider';
  default: number;
  min: number;
  max: number;
  step: number;
}

export type FormField = TextAreaField | InputField | SelectField | SliderField;

export interface FormSample {
  fill: string;
  value: string;
  label: string;
}

export interface PlaygroundExample {
  num: number;
  name: string;
  primTags: string[];
  description: string;
  graph: GraphDef;
  form: { fields: FormField[]; samples: FormSample[] };
  output: { kind: OutputKind };
  runLabel: string;
}

export const EXAMPLES: Record<string, PlaygroundExample> = {
  'support-triage': {
    num: 1,
    name: 'Support Triage',
    primTags: ['workflow', 'agent'],
    description:
      'Classify a customer message, then branch by intent. Watch the LLM call fire <code>classify</code>, then the framework test each branch predicate in order until one matches.',
    graph: GRAPHS['support-triage'],
    form: {
      fields: [
        {
          name: 'message',
          type: 'textarea',
          label: 'Customer message',
          default: 'I want a refund — I was charged twice for the same order.',
          rows: 3,
        },
      ],
      samples: [
        { fill: 'message', value: 'How do I reset my password?', label: 'how-to' },
        { fill: 'message', value: 'I was charged twice this month, please refund me.', label: 'billing' },
        {
          fill: 'message',
          value: 'Your product is broken and I want a manager to call me.',
          label: 'complaint',
        },
        {
          fill: 'message',
          value: 'My account is locked and I cannot log in for my work meeting in 30 minutes.',
          label: 'urgent account',
        },
      ],
    },
    output: { kind: 'triage' },
    runLabel: 'Run',
  },
  research: {
    num: 2,
    name: 'Research Agent',
    primTags: ['agent', 'tool'],
    description:
      'The agent has two tools (<code>web-search</code>, <code>arxiv-search</code>) and decides when to use them.',
    graph: GRAPHS['research'],
    form: {
      fields: [
        {
          name: 'topic',
          type: 'textarea',
          label: 'Topic to research',
          default: 'Contextual Retrieval for RAG',
          rows: 2,
        },
      ],
      samples: [
        { fill: 'topic', value: 'Contextual Retrieval for RAG', label: 'RAG' },
        { fill: 'topic', value: 'hybrid search with BM25 and vector reranking', label: 'hybrid search' },
        { fill: 'topic', value: 'LLM observability with traces and spans', label: 'observability' },
      ],
    },
    output: { kind: 'research' },
    runLabel: 'Run',
  },
  'code-review': {
    num: 3,
    name: 'Code Review',
    primTags: ['workflow', 'tool'],
    description:
      'Deterministic pipeline: read file → run lint → if issues, the LLM writes a review; otherwise the file is auto-approved.',
    graph: GRAPHS['code-review'],
    form: {
      fields: [
        {
          name: 'path',
          type: 'input',
          label: 'File to review (one of: auth.ts, utils.ts, clean.ts)',
          default: 'auth.ts',
        },
      ],
      samples: [
        { fill: 'path', value: 'auth.ts', label: 'auth.ts (has hardcoded secret)' },
        { fill: 'path', value: 'utils.ts', label: 'utils.ts (unwrapped fetch)' },
        { fill: 'path', value: 'clean.ts', label: 'clean.ts (no issues)' },
      ],
    },
    output: { kind: 'codeReview' },
    runLabel: 'Run',
  },
  'parallel-research': {
    num: 4,
    name: 'Parallel Research',
    primTags: ['workflow', 'tool'],
    description:
      'One step fans out to <strong>3 sources in parallel</strong> via <code>Promise.all</code>, then an LLM synthesizes the results.',
    graph: GRAPHS['parallel-research'],
    form: {
      fields: [
        {
          name: 'topic',
          type: 'textarea',
          label: 'Research topic',
          default: 'hybrid search with BM25 and vector reranking',
          rows: 2,
        },
      ],
      samples: [
        { fill: 'topic', value: 'hybrid search with BM25 and vector reranking', label: 'hybrid search' },
        { fill: 'topic', value: 'prompt caching for LLM APIs', label: 'prompt caching' },
        { fill: 'topic', value: 'RAG evaluation metrics', label: 'RAG eval' },
      ],
    },
    output: { kind: 'parallel' },
    runLabel: 'Run',
  },
  'multi-turn-chat': {
    num: 5,
    name: 'Multi-turn Chat',
    primTags: ['agent', 'tool', 'memory'],
    description: 'Send multiple messages on the same <code>threadId</code> — the agent sees prior context.',
    graph: GRAPHS['multi-turn-chat'],
    form: {
      fields: [
        {
          name: 'message',
          type: 'textarea',
          label: 'Message',
          default: 'Hi, I want to check the status of order 12345',
          rows: 3,
        },
      ],
      samples: [
        { fill: 'message', value: 'Hi, I want to check the status of order 12345', label: 'order 12345' },
        { fill: 'message', value: 'When will it arrive?', label: 'when it arrives' },
        { fill: 'message', value: 'Actually I am really upset, I want a manager', label: 'escalate me' },
        {
          fill: 'message',
          value: "What's the difference between #12345 and #67890?",
          label: 'compare orders',
        },
      ],
    },
    output: { kind: 'chat' },
    runLabel: 'Send',
  },
  'hitl-approval': {
    num: 6,
    name: 'Human-in-the-Loop Approval',
    primTags: ['hitl', 'workflow', 'agent'],
    description:
      'Submit a proposed action. The workflow classifies it with an LLM, then the gate step decides whether to <strong>auto-approve</strong> (low risk) or <strong>suspend</strong> for human review.',
    graph: GRAPHS['hitl-approval'],
    form: {
      fields: [
        {
          name: 'action',
          type: 'textarea',
          label: 'Proposed action',
          default: 'Refund $200 to customer #12345',
          rows: 3,
        },
        {
          name: 'actionType',
          type: 'select',
          label: 'Action type',
          default: 'refund',
          options: [
            { value: 'refund', label: 'refund' },
            { value: 'send', label: 'bulk send' },
            { value: 'delete', label: 'delete records' },
          ],
        },
      ],
      samples: [
        { fill: 'action', value: 'Refund $20 for a duplicate charge', label: 'small refund' },
        { fill: 'action', value: 'Refund $500 — customer threatened to sue', label: 'large refund' },
        { fill: 'action', value: 'Bulk send announcement to 5000 customers', label: 'bulk send 5k' },
        { fill: 'action', value: 'Bulk send announcement to 50000 customers', label: 'bulk send 50k' },
        { fill: 'action', value: 'Delete all customer records older than 2 years', label: 'mass delete' },
      ],
    },
    output: { kind: 'hitl' },
    runLabel: 'Submit',
  },
  'streaming-chat': {
    num: 7,
    name: 'Streaming Chat',
    primTags: ['stream', 'agent'],
    description:
      'Watch the LLM generate tokens one at a time. This is the same <code>Agent</code> as the other examples, but uses <code>stream()</code> instead of <code>generate()</code>.',
    graph: GRAPHS['streaming-chat'],
    form: {
      fields: [
        {
          name: 'prompt',
          type: 'textarea',
          label: 'Prompt',
          default: 'Explain server-sent events in one paragraph.',
          rows: 3,
        },
      ],
      samples: [
        { fill: 'prompt', value: 'What is an LLM agent?', label: 'What is an LLM agent?' },
        { fill: 'prompt', value: 'Explain the CAP theorem in 2 sentences.', label: 'CAP theorem' },
        { fill: 'prompt', value: 'Write a haiku about TypeScript.', label: 'TS haiku' },
        {
          fill: 'prompt',
          value: "What's the difference between a thread and a process?",
          label: 'threads vs processes',
        },
      ],
    },
    output: { kind: 'streaming' },
    runLabel: 'Stream',
  },
  'critic-loop': {
    num: 8,
    name: 'Critic Loop',
    primTags: ['workflow', 'agent'],
    description:
      'The evaluator-optimizer pattern. A <em>generator</em> drafts an answer, a <em>critic</em> scores it 0-10, and the loop regenerates using the feedback until the score meets the threshold.',
    graph: GRAPHS['critic-loop'],
    form: {
      fields: [
        {
          name: 'topic',
          type: 'textarea',
          label: 'Topic',
          default: 'What is the difference between an AI agent and an AI workflow?',
          rows: 3,
        },
        {
          name: 'threshold',
          type: 'slider',
          label: 'Quality threshold',
          default: 7,
          min: 1,
          max: 10,
          step: 1,
        },
        { name: 'maxIterations', type: 'input', label: 'Max iterations (1-5)', default: '3' },
      ],
      samples: [
        {
          fill: 'topic',
          value: 'What is the difference between an AI agent and an AI workflow?',
          label: 'Agent vs workflow',
        },
        {
          fill: 'topic',
          value: 'How do I evaluate whether a small LLM is good enough for my use case?',
          label: 'Eval a small LLM',
        },
        {
          fill: 'topic',
          value: 'Explain the Model Context Protocol to a backend engineer in 150 words.',
          label: 'MCP, 150 words',
        },
      ],
    },
    output: { kind: 'criticLoop' },
    runLabel: 'Run critic loop',
  },
  'multi-agent-handoff': {
    num: 9,
    name: 'Multi-Agent Handoff',
    primTags: ['agent', 'tool'],
    description:
      "A <strong>triage agent</strong> handles the customer's first message. If the question is about billing, it calls a tool that <strong>hands off</strong> to a specialist agent.",
    graph: GRAPHS['multi-agent-handoff'],
    form: {
      fields: [
        {
          name: 'message',
          type: 'textarea',
          label: 'Customer message',
          default: 'Where is my refund for order-1234?',
          rows: 3,
        },
      ],
      samples: [
        { fill: 'message', value: 'Where is my refund for order-1234?', label: 'refund (delegates)' },
        { fill: 'message', value: "What's the status of order-5678?", label: 'order status (delegates)' },
        { fill: 'message', value: 'How do I reset my password?', label: 'password (no delegate)' },
        { fill: 'message', value: 'What time does support close?', label: 'hours (no delegate)' },
      ],
    },
    output: { kind: 'chat' },
    runLabel: 'Send to triage',
  },
  'mastra-memory': {
    num: 10,
    name: 'Mastra Memory',
    primTags: ['memory', 'agent'],
    description:
      'Uses the real <code>@mastra/memory</code> <code>Memory</code> class. The same <code>threadId</code> across two turns → second turn recalls what was said in the first.',
    graph: GRAPHS['mastra-memory'],
    form: {
      fields: [
        { name: 'threadId', type: 'input', label: 'Thread ID', default: 'thread-demo-1' },
        { name: 'resourceId', type: 'input', label: 'Resource ID (user/tenant)', default: 'user-1' },
        {
          name: 'turn1',
          type: 'textarea',
          label: 'Turn 1 (set context)',
          default: 'My name is Ada and my favorite color is teal.',
          rows: 2,
        },
        {
          name: 'turn2',
          type: 'textarea',
          label: 'Turn 2 (recall)',
          default: 'What is my name and what is my favorite color?',
          rows: 2,
        },
      ],
      samples: [],
    },
    output: { kind: 'mastraMemory' },
    runLabel: 'Run 2-turn demo',
  },
  'content-pipeline': {
    num: 11,
    name: 'Content Pipeline',
    primTags: ['agent', 'workflow'],
    description:
      'Three agents run in sequence as separate workflow steps: <strong>researcher</strong> gathers facts, <strong>writer</strong> drafts, and <strong>editor</strong> polishes and scores 0-10.',
    graph: GRAPHS['content-pipeline'],
    form: {
      fields: [
        {
          name: 'topic',
          type: 'textarea',
          label: 'Topic',
          default: 'Why is prompt caching essential for production LLM APIs?',
          rows: 3,
        },
        { name: 'audience', type: 'input', label: 'Audience (optional)', default: 'technical readers' },
      ],
      samples: [
        {
          fill: 'topic',
          value: 'Why is prompt caching essential for production LLM APIs?',
          label: 'prompt caching',
        },
        {
          fill: 'topic',
          value: 'How do I evaluate whether a small LLM is good enough for my use case?',
          label: 'eval small LLM',
        },
        {
          fill: 'topic',
          value: 'When should I use a multi-agent system vs a single agent with tools?',
          label: 'multi vs single agent',
        },
      ],
    },
    output: { kind: 'contentPipeline' },
    runLabel: 'Run pipeline',
  },
};

export type ModelProvider = 'google' | 'openrouter';

export const PROVIDER_OPTIONS: ReadonlyArray<{ value: ModelProvider; label: string }> = [
  { value: 'google', label: 'Gemini · default' },
  { value: 'openrouter', label: 'OpenRouter' },
];

export const MODEL_OPTIONS_BY_PROVIDER: Record<
  ModelProvider,
  ReadonlyArray<{ value: string; label: string }>
> = {
  google: [
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite · default' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
  ],
  openrouter: [
    { value: 'openai/gpt-oss-20b:free', label: 'GPT-OSS 20B · free · default' },
    { value: 'openrouter/free', label: 'Free Models Router' },
    { value: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super 120B · free' },
    { value: 'qwen/qwen3-next-80b-a3b-instruct:free', label: 'Qwen3 Next 80B · free' },
    { value: 'nvidia/nemotron-nano-9b-v2:free', label: 'Nemotron Nano 9B v2 · free' },
  ],
};

// Ordered example IDs (declaration order matches numeric order).
export const EXAMPLE_IDS = Object.keys(EXAMPLES);
