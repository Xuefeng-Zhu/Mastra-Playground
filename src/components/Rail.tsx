import { useState } from 'react';
import { EXAMPLES, EXAMPLE_IDS } from '../registry/examples';
import type { ExampleId } from '../../shared/example-manifest';
import { CUSTOM_WORKFLOW_HASH } from '../registry/custom-workflow';
import type { ActiveWorkspaceId } from '../App';

interface RailProps {
  activeExampleId: ActiveWorkspaceId;
  onSelect: (id: ActiveWorkspaceId) => void;
}

const PRIM_IDS = ['agent', 'workflow', 'tool', 'memory', 'hitl', 'stream', 'guardrail'] as const;
const PRIM_LABELS: Record<string, string> = {
  agent: 'Agent',
  workflow: 'Workflow',
  tool: 'Tool',
  memory: 'Memory',
  hitl: 'HITL',
  stream: 'Streaming',
  guardrail: 'Guardrail',
};
const BUILDER_PRIMITIVE = 'workflow';

/** Compute counts dynamically from the example registry. */
function computePrimitives() {
  return PRIM_IDS.map((id) => {
    const exampleCount = EXAMPLE_IDS.filter((exId) => {
      const ex = EXAMPLES[exId];
      return ex && ex.primTags.includes(id);
    }).length;
    const count = exampleCount + (id === BUILDER_PRIMITIVE ? 1 : 0);
    return { id, label: PRIM_LABELS[id], count };
  });
}

const PRIMITIVES = computePrimitives();
const TOTAL_RAIL_ITEMS = EXAMPLE_IDS.length + 1;

function RailItem({
  id,
  active,
  onSelect,
}: {
  id: ExampleId;
  active: boolean;
  onSelect: (id: ActiveWorkspaceId) => void;
}) {
  const ex = EXAMPLES[id];
  if (!ex) return null;
  return (
    <li>
      <button
        type="button"
        className={`rail-ex ${active ? 'rail-ex-active' : ''}`}
        data-example={id}
        onClick={() => onSelect(id)}
        aria-current={active ? 'page' : undefined}
      >
        <span className="rail-ex-num">{String(ex.num).padStart(2, '0')}</span>
        <span className="rail-ex-name">{ex.name}</span>
      </button>
    </li>
  );
}

export function Rail({ activeExampleId, onSelect }: RailProps) {
  const [activePrim, setActivePrim] = useState<string | null>(null);

  const filteredExamples = activePrim
    ? EXAMPLE_IDS.filter((id) => {
        const ex = EXAMPLES[id];
        return ex && ex.primTags.includes(activePrim);
      })
    : EXAMPLE_IDS;
  const showBuilder = !activePrim || activePrim === BUILDER_PRIMITIVE;
  const visibleCount = filteredExamples.length + (showBuilder ? 1 : 0);

  return (
    <aside className="rail" aria-label="Examples">
      <div className="rail-section">
        <div className="rail-heading">Primitives</div>
        <ul className="rail-list rail-primitives">
          {PRIMITIVES.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`rail-prim-btn ${activePrim === p.id ? 'rail-prim-active' : ''}`}
                onClick={() => setActivePrim(activePrim === p.id ? null : p.id)}
                aria-pressed={activePrim === p.id}
              >
                <span className={`prim-dot prim-${p.id}`}></span>
                {p.label} <span className="rail-count">{p.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="rail-section">
        <div className="rail-heading">
          Examples{' '}
          <span className="rail-count rail-count-muted">
            {visibleCount}
            {activePrim ? ` / ${TOTAL_RAIL_ITEMS}` : ''}
          </span>
        </div>
        <ul className="rail-list rail-examples" id="rail-examples">
          {showBuilder ? (
            <li>
              <button
                type="button"
                className={`rail-ex rail-ex-builder ${activeExampleId === CUSTOM_WORKFLOW_HASH ? 'rail-ex-active' : ''}`}
                data-example={CUSTOM_WORKFLOW_HASH}
                onClick={() => onSelect(CUSTOM_WORKFLOW_HASH)}
                aria-current={activeExampleId === CUSTOM_WORKFLOW_HASH ? 'page' : undefined}
              >
                <span className="rail-ex-num">＋</span>
                <span className="rail-ex-name">Workflow Builder</span>
              </button>
            </li>
          ) : null}
          {filteredExamples.map((id) => (
            <RailItem key={id} id={id} active={id === activeExampleId} onSelect={onSelect} />
          ))}
        </ul>
      </div>
    </aside>
  );
}
