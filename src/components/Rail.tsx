import { EXAMPLES, V2_EXAMPLE_ORDER } from '../registry/examples.js';

interface RailProps {
  activeExampleId: string;
  onSelect: (id: string) => void;
}

const PRIMITIVES = [
  { id: 'agent', label: 'Agent', count: 4 },
  { id: 'workflow', label: 'Workflow', count: 5 },
  { id: 'tool', label: 'Tool', count: 3 },
  { id: 'memory', label: 'Memory', count: 2 },
  { id: 'hitl', label: 'HITL', count: 1 },
  { id: 'stream', label: 'Streaming', count: 1 },
];

function RailItem({ id, active, onSelect }: { id: string; active: boolean; onSelect: (id: string) => void }) {
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
        <span className={`prim-tag ${ex.primTagClass}`}>{ex.primTag}</span>
      </button>
    </li>
  );
}

export function Rail({ activeExampleId, onSelect }: RailProps) {
  return (
    <aside className="rail" aria-label="Examples">
      <div className="rail-section">
        <div className="rail-heading">Primitives</div>
        <ul className="rail-list rail-primitives">
          {PRIMITIVES.map((p) => (
            <li key={p.id}>
              <span className={`prim-dot prim-${p.id}`}></span>
              {p.label} <span className="rail-count">{p.count}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rail-section">
        <div className="rail-heading">
          Examples <span className="rail-count rail-count-muted">11</span>
        </div>
        <ul className="rail-list rail-examples" id="rail-examples">
          {V2_EXAMPLE_ORDER.map((id) => (
            <RailItem key={id} id={id} active={id === activeExampleId} onSelect={onSelect} />
          ))}
        </ul>
      </div>
    </aside>
  );
}
