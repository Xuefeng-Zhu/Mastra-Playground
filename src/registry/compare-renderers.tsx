import type { ReactNode } from 'react';

export type CompareRenderer = (current: unknown, prior: unknown) => ReactNode;

function read(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function textAt(value: unknown, path: string[]): string {
  const result = read(value, path);
  return typeof result === 'string' ? result : '';
}

function numberAt(value: unknown, path: string[]): number {
  const result = read(value, path);
  return typeof result === 'number' ? result : 0;
}

function CompareGrid({
  currentLabel,
  priorLabel,
  currentText,
  priorText,
}: {
  currentLabel: string;
  priorLabel: string;
  currentText: string;
  priorText: string;
}) {
  return (
    <div className="compare-grid">
      <section className="compare-col">
        <header>{currentLabel}</header>
        <div className="compare-body">{currentText}</div>
      </section>
      <section className="compare-col">
        <header>{priorLabel}</header>
        <div className="compare-body">{priorText}</div>
      </section>
    </div>
  );
}

function createTextComparison(
  path: string[],
  labels: { current: string; prior: string } = { current: 'Current', prior: 'Prior' },
): CompareRenderer {
  return (current, prior) => {
    const currentText = textAt(current, path);
    const priorText = textAt(prior, path);
    if (!currentText && !priorText) return <p className="muted">Run the workflow twice to compare.</p>;
    if (!priorText) return <p className="muted">No prior run yet.</p>;
    return (
      <CompareGrid
        currentLabel={labels.current}
        priorLabel={labels.prior}
        currentText={currentText || '(empty)'}
        priorText={priorText}
      />
    );
  };
}

const compareCriticLoop: CompareRenderer = (current, prior) => {
  const currentText = textAt(current, ['draft']);
  const priorText = textAt(prior, ['draft']);
  if (!currentText && !priorText) return <p className="muted">Run the workflow twice to compare.</p>;
  if (!priorText) return <p className="muted">No prior run yet.</p>;
  return (
    <CompareGrid
      currentLabel={`Current (${numberAt(current, ['score'])}/10)`}
      priorLabel={`Prior (${numberAt(prior, ['score'])}/10)`}
      currentText={currentText || '(empty)'}
      priorText={priorText}
    />
  );
};

export const COMPARE_RENDERERS: Record<string, CompareRenderer> = {
  parallel: createTextComparison(['synthesis']),
  triage: createTextComparison(['triage', 'response_text']),
  research: createTextComparison(['formatted']),
  codeReview: createTextComparison(['review']),
  chat: () => <p className="muted">Chat threads aren't compared. Use Raw JSON for prior outputs.</p>,
  handoff: createTextComparison(['message']),
  streaming: createTextComparison(['finalText']),
  hitl: () => <p className="muted">HITL runs are stateful. Use Raw JSON for prior outputs.</p>,
  criticLoop: compareCriticLoop,
  contentPipeline: createTextComparison(['draft'], { current: 'Current draft', prior: 'Prior draft' }),
  mastraMemory: createTextComparison(['turn2', 'output']),
};
