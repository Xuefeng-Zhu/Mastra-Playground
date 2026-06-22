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
  eventType: string;
  payload: unknown;
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
      <div
        className="trace-tabs"
        role="tablist"
        aria-label="Trace view"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
          const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
          const next = (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          tabs[next]?.focus();
          tabs[next]?.click();
        }}
      >
        <button
          type="button"
          className={`trace-tab ${activeView === 'trace' ? 'trace-tab-active' : ''}`}
          data-tab="trace"
          role="tab"
          aria-selected={activeView === 'trace'}
          tabIndex={activeView === 'trace' ? 0 : -1}
          aria-controls="trace-graph-panel trace-events-panel"
          onClick={() => setActiveView('trace')}
        >
          Trace
        </button>
        <button
          type="button"
          className={`trace-tab ${activeView === 'graph' ? 'trace-tab-active' : ''}`}
          data-tab="graph"
          role="tab"
          aria-selected={activeView === 'graph'}
          tabIndex={activeView === 'graph' ? 0 : -1}
          aria-controls="trace-graph-panel"
          onClick={() => setActiveView('graph')}
        >
          Graph
        </button>
        <button
          type="button"
          className={`trace-tab ${activeView === 'events' ? 'trace-tab-active' : ''}`}
          data-tab="events"
          role="tab"
          aria-selected={activeView === 'events'}
          tabIndex={activeView === 'events' ? 0 : -1}
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
      <div id="trace-graph-panel" className="trace-graph" role="tabpanel" hidden={!showGraph}>
        <Graph key={graphDef.nodes[0]?.id} def={graphDef} containerId={graphContainerId} />
      </div>
      <div
        id="trace-events-panel"
        className="trace-timeline"
        role="tabpanel"
        ref={timelineRef}
        hidden={!showEvents}
      >
        {timeline.length === 0 ? (
          <div className="tl-row" data-step="">
            <span className="tl-ts">—</span>
            <span className="tl-kind tl-kind-step">step</span>
            <span className="tl-msg">Submit to start the workflow.</span>
            <span className="tl-step">idle</span>
          </div>
        ) : (
          timeline.map((row) => (
            <details key={row.id} className="tl-event" data-step={row.step}>
              <summary className={`tl-row ${row.active ? 'tl-active' : ''}`}>
                <span className="tl-ts">{formatSec(row.ts)}</span>
                <span className={`tl-kind tl-kind-${row.kind}`}>{row.kind}</span>
                <span className="tl-msg">{row.msg}</span>
                <span className="tl-step">{row.step}</span>
                <span className="tl-expand" aria-hidden="true"></span>
              </summary>
              <div className="tl-detail">
                <div className="tl-detail-meta">
                  <span>
                    Event <strong>{row.eventType}</strong>
                  </span>
                  <span>
                    Recorded <strong>{formatSec(row.ts)}</strong>
                  </span>
                </div>
                <pre>{JSON.stringify(row.payload, null, 2)}</pre>
              </div>
            </details>
          ))
        )}
      </div>
    </section>
  );
}
