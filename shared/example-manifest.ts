/** Canonical identifiers shared by the browser, API routes, and tests. */
export const EXAMPLE_DEFINITIONS = [
  { id: 'support-triage', num: 1, outputKind: 'triage' },
  { id: 'research', num: 2, outputKind: 'research' },
  { id: 'code-review', num: 3, outputKind: 'codeReview' },
  { id: 'parallel-research', num: 4, outputKind: 'parallel' },
  { id: 'multi-turn-chat', num: 5, outputKind: 'chat' },
  { id: 'hitl-approval', num: 6, outputKind: 'hitl' },
  { id: 'streaming-chat', num: 7, outputKind: 'streaming' },
  { id: 'critic-loop', num: 8, outputKind: 'criticLoop' },
  { id: 'multi-agent-handoff', num: 9, outputKind: 'handoff' },
  { id: 'mastra-memory', num: 10, outputKind: 'mastraMemory' },
  { id: 'content-pipeline', num: 11, outputKind: 'contentPipeline' },
] as const;

export type ExampleId = (typeof EXAMPLE_DEFINITIONS)[number]['id'];
export type OutputKind = (typeof EXAMPLE_DEFINITIONS)[number]['outputKind'];

export const EXAMPLE_IDS = EXAMPLE_DEFINITIONS.map(({ id }) => id) as readonly ExampleId[];
const EXAMPLE_ID_SET = new Set<string>(EXAMPLE_IDS);

export function isExampleId(value: string): value is ExampleId {
  return EXAMPLE_ID_SET.has(value);
}

export const EXAMPLE_ID_BY_NUMBER = new Map<number, ExampleId>(
  EXAMPLE_DEFINITIONS.map(({ id, num }) => [num, id]),
);

export const OUTPUT_KIND_BY_EXAMPLE = Object.fromEntries(
  EXAMPLE_DEFINITIONS.map(({ id, outputKind }) => [id, outputKind]),
) as Record<ExampleId, OutputKind>;
