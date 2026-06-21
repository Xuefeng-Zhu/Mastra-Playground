/**
 * <Graph> — renders a workflow DAG as inline SVG.
 *
 * Migrated from public/app.js renderGraph(). The output uses the same
 * `data-node`, `data-from`, `data-to` attributes the trace animation
 * hooks in <TracePane> depend on, so the existing CSS for `.gn-node`,
 * `.gn-edge`, and the `active`/`done`/`skipped` classes continues to
 * light up nodes as events stream in.
 */

import type { GraphDef } from '../registry/graphs';

const NODE_W = 180;
const NODE_H = 56;

export function Graph({ def, containerId }: { def: GraphDef; containerId: string }) {
  const xs = def.nodes.map((n) => n.x);
  const ys = def.nodes.map((n) => n.y);
  const padding = 30;
  const w = Math.max(...xs) - Math.min(...xs) + 200;
  const h = Math.max(...ys) - Math.min(...ys) + 100;
  const minX = Math.min(...xs) - 100 + padding;
  const minY = Math.min(...ys) - 30 + padding;

  const nodeEls = def.nodes.map((n) => {
    const tx = n.x - NODE_W / 2;
    const ty = n.y - NODE_H / 2;
    return (
      <g
        key={n.id}
        className={`gn-node kind-${n.kind}`}
        data-node={n.id}
        transform={`translate(${tx} ${ty})`}
      >
        <rect width={NODE_W} height={NODE_H} rx={8} />
        <text x={NODE_W / 2} y={22} textAnchor="middle">
          {n.label}
        </text>
        {n.label2 && (
          <text x={NODE_W / 2} y={40} textAnchor="middle" className="gn-id">
            {n.label2}
          </text>
        )}
        <text x={NODE_W / 2} y={50} textAnchor="middle" className="gn-kind gn-id">
          {n.kind}
        </text>
      </g>
    );
  });

  const edgeEls = def.edges
    .map((edge) => {
      const fromNode = def.nodes.find((n) => n.id === edge.from);
      const toNode = def.nodes.find((n) => n.id === edge.to);
      if (!fromNode || !toNode) return null;
      const x1 = fromNode.x;
      const y1 = fromNode.y + NODE_H / 2;
      const x2 = toNode.x;
      const y2 = toNode.y - NODE_H / 2;
      const midY = (y1 + y2) / 2;
      const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
      return (
        <g key={`${edge.from}->${edge.to}`}>
          <path
            d={path}
            className="gn-edge"
            data-from={edge.from}
            data-to={edge.to}
            markerEnd={`url(#arrow-${containerId})`}
          />
          {edge.label && (
            <text
              x={(x1 + x2) / 2}
              y={(y1 + y2) / 2}
              textAnchor="middle"
              className="gn-edge-label"
              data-from={edge.from}
              data-to={edge.to}
            >
              {edge.label}
            </text>
          )}
        </g>
      );
    })
    .filter(Boolean);

  return (
    <svg
      id={containerId}
      viewBox={`${minX - padding} ${minY - padding} ${w} ${h}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ maxHeight: '520px', display: 'block' }}
    >
      <defs>
        <marker
          id={`arrow-${containerId}`}
          viewBox="0 -5 10 10"
          refX={9}
          refY={0}
          markerWidth={6}
          markerHeight={6}
          orient="auto"
        >
          <path d="M0,-5L10,0L0,5" fill="var(--border)" />
        </marker>
        <marker
          id={`arrow-active-${containerId}`}
          viewBox="0 -5 10 10"
          refX={9}
          refY={0}
          markerWidth={6}
          markerHeight={6}
          orient="auto"
        >
          <path d="M0,-5L10,0L0,5" fill="var(--green)" />
        </marker>
      </defs>
      {edgeEls}
      {nodeEls}
    </svg>
  );
}
