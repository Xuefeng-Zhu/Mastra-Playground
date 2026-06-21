import { useEffect, useRef, useState } from 'react';
import { Graph } from './Graph';
import { formatSec } from '../registry/utils';
import type { GraphDef } from '../registry/graphs';

export interface TimelineEntry {
  id: string;
  ts: number;
  kind: 'step' | 'tool' | 'llm' | 'branch' | 'hitl';
  msg: string;
  step: string;
  active: boolean;
}

type TraceView = 'trace' | 'graph' | 'events';

interface TracePaneProps {
  graphContainerId: string;
  graphDef: GraphDef;
  timeline: TimelineEntry[];
  doneCount: number;
  activeNode: string;
  totalMs: number;
}

export function TracePane({
  graphContainerId,
  graphDef,
  timeline,
  doneCount,
  activeNode,
  totalMs,
}: TracePaneProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [activeView, setActiveView] = useState<TraceView>('trace');
  const showGraph = activeView !== 'events';
  const showEvents = activeView !== 'graph';

  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [timeline.length]);

  return (
    <section className="trace-pane" aria-label="Trace">
      <div className="trace-tabs" aria-label="Trace view">
        <button
          type="button"
          className={`trace-tab ${activeView === 'trace' ? 'trace-tab-active' : ''}`}
          data-tab="trace"
          aria-pressed={activeView === 'trace'}
          aria-controls="trace-graph-panel trace-events-panel"
          onClick={() => setActiveView('trace')}
        >
          Trace
        </button>
        <button
          type="button"
          className={`trace-tab ${activeView === 'graph' ? 'trace-tab-active' : ''}`}
          data-tab="graph"
          aria-pressed={activeView === 'graph'}
          aria-controls="trace-graph-panel"
          onClick={() => setActiveView('graph')}
        >
          Graph
        </button>
        <button
          type="button"
          className={`trace-tab ${activeView === 'events' ? 'trace-tab-active' : ''}`}
          data-tab="events"
          aria-pressed={activeView === 'events'}
          aria-controls="trace-events-panel"
          onClick={() => setActiveView('events')}
        >
          Events
        </button>
        <div className="trace-tabs-right">
          <span className="trace-stat">
            <span className="dot dot-green"></span>
            <span className="stat-done">{doneCount} done</span>
          </span>
          <span className="trace-stat">
            <span className="dot dot-blue"></span>
            <span className="stat-active">{activeNode}</span>
          </span>
          <span className="trace-stat trace-stat-time stat-time">
            {formatSec(totalMs)} · {totalMs > 0 ? 'done' : '—'}
          </span>
        </div>
      </div>
      <div id="trace-graph-panel" className="trace-graph" hidden={!showGraph}>
        <Graph key={graphDef.nodes[0]?.id} def={graphDef} containerId={graphContainerId} />
      </div>
      <div id="trace-events-panel" className="trace-timeline" ref={timelineRef} hidden={!showEvents}>
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
