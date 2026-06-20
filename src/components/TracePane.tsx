import { useEffect, useRef } from 'react';
import { Graph } from './Graph.js';
import { formatSec } from '../registry/utils.js';

export interface TimelineEntry {
  id: string;
  ts: number;
  kind: 'step' | 'tool' | 'llm' | 'branch' | 'hitl';
  msg: string;
  step: string;
  active: boolean;
}

interface TracePaneProps {
  graphContainerId: string;
  graphDef: any;
  timeline: TimelineEntry[];
  doneCount: number;
  activeNode: string;
  totalMs: number;
  sourceCount: number;
  hasSources: boolean;
}

export function TracePane({
  graphContainerId,
  graphDef,
  timeline,
  doneCount,
  activeNode,
  totalMs,
  sourceCount,
}: TracePaneProps) {
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [timeline.length]);

  return (
    <section className="trace-v2" aria-label="Trace">
      <div className="trace-tabs">
        <button type="button" className="trace-tab trace-tab-active" data-v2-tab="trace">
          Trace
        </button>
        <button type="button" className="trace-tab" data-v2-tab="graph">
          Graph
        </button>
        <button type="button" className="trace-tab" data-v2-tab="events">
          Events
        </button>
        <div className="trace-tabs-right">
          <span className="trace-stat">
            <span className="dot dot-green"></span>
            <span className="v2-stat-done">{doneCount} done</span>
          </span>
          <span className="trace-stat">
            <span className="dot dot-blue"></span>
            <span className="v2-stat-active">{activeNode}</span>
          </span>
          <span className="trace-stat trace-stat-time v2-stat-time">
            {formatSec(totalMs)} · {totalMs > 0 ? 'done' : '—'}
          </span>
        </div>
      </div>
      <div className="trace-graph">
        <Graph key={graphDef.nodes[0]?.id} def={graphDef} containerId={graphContainerId} />
      </div>
      <div className="trace-timeline" ref={timelineRef}>
        {timeline.length === 0 ? (
          <div className="tl-row" data-step="">
            <span className="tl-ts">—</span>
            <span className="tl-kind tl-kind-step">step</span>
            <span className="tl-msg">Submit to start the workflow.</span>
            <span className="tl-step">idle</span>
          </div>
        ) : (
          timeline.map((row) => (
            <div key={row.id} className={`tl-row ${row.active ? 'tl-active' : ''}`} data-step={row.step}>
              <span className="tl-ts">{formatSec(row.ts)}</span>
              <span className={`tl-kind tl-kind-${row.kind}`}>{row.kind}</span>
              <span className="tl-msg">{row.msg}</span>
              <span className="tl-step">{row.step}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
