import { useMemo } from 'react';
import type { CapturedSource } from '../registry/renderers.js';
import {
  RESULT_RENDERERS,
  COMPARE_RENDERERS,
  HAS_SOURCES_TAB,
  HAS_COMPARE_TAB,
  SourcesList,
} from '../registry/renderers.js';
import { formatSec, escapeText } from '../registry/utils.js';
import type { OutputTab } from '../hooks/useWorkspace.js';

interface OutputPanelProps {
  kind: string;
  output: any;
  priorOutput: any;
  sources: CapturedSource[];
  totalMs: number;
  streamingText: string;
  streamingModel: string;
  streamingTokenCount: number;
  activeTab: OutputTab;
  setActiveTab: (tab: OutputTab) => void;
  onHitlApprove: (token: string) => void;
  onHitlReject: (token: string) => void;
  error: string | null;
}

function OutputTabs({
  hasSources,
  hasCompare,
  active,
  onChange,
  sourceCount,
}: {
  hasSources: boolean;
  hasCompare: boolean;
  active: OutputTab;
  onChange: (tab: OutputTab) => void;
  sourceCount: number;
}) {
  return (
    <div className="output-tabs">
      <button
        type="button"
        className={`output-tab ${active === 'result' ? 'output-tab-active' : ''}`}
        data-v2-output-tab="result"
        onClick={() => onChange('result')}
      >
        Result
      </button>
      {hasSources && (
        <button
          type="button"
          className={`output-tab ${active === 'sources' ? 'output-tab-active' : ''}`}
          data-v2-output-tab="sources"
          onClick={() => onChange('sources')}
        >
          Sources (<span className="v2-source-count">{sourceCount}</span>)
        </button>
      )}
      <button
        type="button"
        className={`output-tab ${active === 'json' ? 'output-tab-active' : ''}`}
        data-v2-output-tab="json"
        onClick={() => onChange('json')}
      >
        Raw JSON
      </button>
      {hasCompare && (
        <button
          type="button"
          className={`output-tab ${active === 'compare' ? 'output-tab-active' : ''}`}
          data-v2-output-tab="compare"
          onClick={() => onChange('compare')}
        >
          Compare with prior
        </button>
      )}
      <div className="output-tabs-right">
        <button className="icon-btn" title="Copy as Markdown" aria-label="Copy as Markdown">
          ⧉
        </button>
      </div>
    </div>
  );
}

function highlightJSON(obj: unknown): string {
  const json = JSON.stringify(obj, null, 2);
  return escapeText(json)
    .replaceAll(/&quot;([^&]+?)&quot;\s*:/g, '<span class="json-key">&quot;$1&quot;</span>:')
    .replaceAll(/: &quot;([^&]*?)&quot;/g, ': <span class="json-string">&quot;$1&quot;</span>')
    .replaceAll(/: (true|false)/g, ': <span class="json-bool">$1</span>')
    .replaceAll(/: (null)/g, ': <span class="json-null">$1</span>')
    .replaceAll(/: (-?\d+\.?\d*)/g, ': <span class="json-number">$1</span>');
}

function RenderResult({
  kind,
  output,
  sources,
  totalMs,
  streamingText,
  streamingModel,
  streamingTokenCount,
  onHitlApprove,
  onHitlReject,
  error,
}: Omit<OutputPanelProps, 'activeTab' | 'setActiveTab' | 'priorOutput'>) {
  if (error) {
    return <p className="muted output-error">⚠ {error}</p>;
  }
  const renderer = RESULT_RENDERERS[kind];
  if (!renderer) {
    return <p className="muted">No renderer for this example.</p>;
  }
  return (
    <>
      {renderer(output, {
        totalMs,
        sources,
        streamingText,
        streamingModel,
        streamingTokenCount,
        onHitlApprove,
        onHitlReject,
      })}
    </>
  );
}

function RenderJSON({ output }: { output: any }) {
  if (!output) return <p className="muted">No output yet.</p>;
  return <pre className="json-pre" dangerouslySetInnerHTML={{ __html: highlightJSON(output) }} />;
}

function RenderCompare({ kind, cur, prior }: { kind: string; cur: any; prior: any }) {
  const renderer = COMPARE_RENDERERS[kind];
  if (!renderer) return <p className="muted">No compare renderer.</p>;
  return <>{renderer(cur, prior)}</>;
}

export function OutputPanel(props: OutputPanelProps) {
  const ctx = useMemo(
    () => ({
      totalMs: props.totalMs,
      sources: props.sources,
      streamingText: props.streamingText,
      streamingModel: props.streamingModel,
      streamingTokenCount: props.streamingTokenCount,
      onHitlApprove: props.onHitlApprove,
      onHitlReject: props.onHitlReject,
    }),
    [
      props.totalMs,
      props.sources,
      props.streamingText,
      props.streamingModel,
      props.streamingTokenCount,
      props.onHitlApprove,
      props.onHitlReject,
    ],
  );

  return (
    <section className="output-v2" aria-label="Output">
      <OutputTabs
        hasSources={HAS_SOURCES_TAB[props.kind] || false}
        hasCompare={HAS_COMPARE_TAB[props.kind] || false}
        active={props.activeTab}
        onChange={props.setActiveTab}
        sourceCount={props.sources.length}
      />
      <div className="output-body">
        {props.activeTab === 'result' && (
          <div className="v2-output-body prose">
            <RenderResult {...props} />
          </div>
        )}
        {props.activeTab === 'sources' && (
          <div className="v2-output-body prose">
            <SourcesList sources={props.sources} />
          </div>
        )}
        {props.activeTab === 'json' && (
          <div className="v2-output-body prose">
            <RenderJSON output={props.output} />
          </div>
        )}
        {props.activeTab === 'compare' && (
          <div className="v2-output-body prose">
            <RenderCompare kind={props.kind} cur={props.output} prior={props.priorOutput} />
          </div>
        )}
      </div>
    </section>
  );
}

// Keep formatSec referenced (used in renderers indirectly via the
// `output` prop). This is a no-op re-export for type-only consumers.
export { formatSec };
