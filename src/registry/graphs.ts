/**
 * GRAPHS — the static DAG definitions for each example's trace.
 * Migrated from public/app.js. The shape is unchanged so the existing
 * <TracePane> can render the SVG with the same `data-node` / `data-from`
 * attributes the trace animation depends on.
 */

export type NodeKind = 'input' | 'llm' | 'tool' | 'branch' | 'passthrough';

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  x: number;
  y: number;
  label2?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  predicate?: string;
  when?: { kind: string };
}

export interface GraphDef {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const GRAPHS: Record<string, GraphDef> = {
  'support-triage': {
    nodes: [
      { id: 'input', label: 'Customer message', kind: 'input', x: 60, y: 60 },
      { id: 'classify', label: 'Classify', kind: 'llm', x: 60, y: 160, label2: 'TriageSchema' },
      { id: 'branch.intent', label: 'branch.intent', kind: 'branch', x: 60, y: 260 },
      { id: 'respond', label: 'Bot responds', kind: 'passthrough', x: -60, y: 380 },
      { id: 'escalate', label: 'Escalate', kind: 'passthrough', x: 180, y: 380 },
    ],
    edges: [
      { from: 'input', to: 'classify' },
      { from: 'classify', to: 'branch.intent' },
      {
        from: 'branch.intent',
        to: 'respond',
        label: 'intent ∈ {how_to, billing}',
        predicate: 'intent how_to or billing',
      },
      { from: 'branch.intent', to: 'escalate', label: 'requires_human', predicate: 'requires_human' },
    ],
  },
  research: {
    nodes: [
      { id: 'input', label: 'Topic', kind: 'input', x: 60, y: 60 },
      { id: 'run-agent', label: 'Research (LLM)', kind: 'llm', x: 60, y: 160, label2: 'with tools' },
      { id: 'format', label: 'Format', kind: 'passthrough', x: 60, y: 260 },
    ],
    edges: [
      { from: 'input', to: 'run-agent' },
      { from: 'run-agent', to: 'format' },
    ],
  },
  'code-review': {
    nodes: [
      { id: 'input', label: 'Filename', kind: 'input', x: 60, y: 60 },
      { id: 'fetch-file', label: 'Read file', kind: 'tool', x: 60, y: 160 },
      { id: 'check-file', label: 'Run lint', kind: 'tool', x: 60, y: 260 },
      { id: 'branch.issues', label: 'branch.issues', kind: 'branch', x: 60, y: 360 },
      { id: 'approve', label: 'Approve (no LLM)', kind: 'passthrough', x: -80, y: 480 },
      { id: 'generate-review', label: 'Generate review', kind: 'llm', x: 200, y: 480, label2: 'LLM writes' },
    ],
    edges: [
      { from: 'input', to: 'fetch-file' },
      { from: 'fetch-file', to: 'check-file' },
      { from: 'check-file', to: 'branch.issues' },
      { from: 'branch.issues', to: 'approve', label: 'issues.length === 0', predicate: 'no issues' },
      { from: 'branch.issues', to: 'generate-review', label: 'issues.length > 0', predicate: 'has issues' },
    ],
  },
  'parallel-research': {
    nodes: [
      { id: 'input', label: 'Topic', kind: 'input', x: 60, y: 60 },
      { id: 'plan', label: 'Plan sub-questions', kind: 'llm', x: 60, y: 160, label2: 'LLM' },
      { id: 'fanout', label: 'Parallel fetch', kind: 'tool', x: 60, y: 260, label2: 'web + arxiv + wiki' },
      { id: 'synthesize', label: 'Synthesize', kind: 'llm', x: 60, y: 380, label2: 'LLM' },
    ],
    edges: [
      { from: 'input', to: 'plan' },
      { from: 'plan', to: 'fanout' },
      { from: 'fanout', to: 'synthesize' },
    ],
  },
  'multi-turn-chat': {
    nodes: [
      { id: 'input', label: 'User message', kind: 'input', x: 60, y: 60 },
      { id: 'chat', label: 'Chat (LLM)', kind: 'llm', x: 60, y: 160, label2: 'with memory' },
    ],
    edges: [{ from: 'input', to: 'chat' }],
  },
  'hitl-approval': {
    nodes: [
      { id: 'input', label: 'Proposed action', kind: 'input', x: 60, y: 60 },
      { id: 'classify', label: 'Classify (LLM)', kind: 'llm', x: 60, y: 160, label2: 'amount + urgency' },
      { id: 'gate', label: 'Gate', kind: 'branch', x: 60, y: 280, label2: 'suspend or auto' },
      { id: 'execute', label: 'Execute', kind: 'passthrough', x: 60, y: 420 },
    ],
    edges: [
      { from: 'input', to: 'classify' },
      { from: 'classify', to: 'gate' },
      { from: 'gate', to: 'execute', label: 'approved', when: { kind: 'auto-approved' } },
    ],
  },
  'streaming-chat': {
    nodes: [
      { id: 'input', label: 'Prompt', kind: 'input', x: 60, y: 60 },
      { id: 'stream', label: 'Stream (LLM)', kind: 'llm', x: 60, y: 180, label2: 'token-by-token' },
    ],
    edges: [{ from: 'input', to: 'stream' }],
  },
  'multi-agent-handoff': {
    nodes: [
      { id: 'input', label: 'Customer message', kind: 'input', x: 60, y: 60 },
      { id: 'primary', label: 'Triage agent', kind: 'llm', x: 60, y: 180, label2: 'routes' },
      {
        id: 'specialist',
        label: 'Billing specialist',
        kind: 'llm',
        x: 200,
        y: 320,
        label2: 'on delegate only',
      },
    ],
    edges: [
      { from: 'input', to: 'primary' },
      { from: 'primary', to: 'specialist', label: 'handoff', when: { kind: 'delegated' } },
    ],
  },
  'mastra-memory': {
    nodes: [
      { id: 'input', label: 'Thread + turns', kind: 'input', x: 60, y: 60 },
      { id: 'turn1', label: 'Turn 1 (set context)', kind: 'llm', x: 60, y: 180 },
      { id: 'turn2', label: 'Turn 2 (recall)', kind: 'llm', x: 60, y: 320, label2: 'same threadId' },
    ],
    edges: [
      { from: 'input', to: 'turn1' },
      { from: 'turn1', to: 'turn2', label: 'memory loaded' },
    ],
  },
  'content-pipeline': {
    nodes: [
      { id: 'input', label: 'Topic', kind: 'input', x: 60, y: 60 },
      { id: 'research', label: 'Researcher', kind: 'llm', x: 60, y: 180, label2: 'facts + sources' },
      { id: 'write', label: 'Writer', kind: 'llm', x: 60, y: 320, label2: '~150 words' },
      { id: 'edit', label: 'Editor', kind: 'llm', x: 60, y: 460, label2: 'score 0-10' },
    ],
    edges: [
      { from: 'input', to: 'research' },
      { from: 'research', to: 'write' },
      { from: 'write', to: 'edit' },
    ],
  },
  'critic-loop': {
    nodes: [
      { id: 'input', label: 'Topic', kind: 'input', x: 60, y: 60 },
      {
        id: 'iterate',
        label: 'Generate → critique → regenerate',
        kind: 'llm',
        x: 60,
        y: 200,
        label2: 'loop until score ≥ threshold',
      },
    ],
    edges: [{ from: 'input', to: 'iterate' }],
  },
};
