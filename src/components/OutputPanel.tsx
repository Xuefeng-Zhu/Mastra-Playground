import type { CapturedSource } from '../registry/renderers.js';
import {
  RESULT_RENDERERS,
  COMPARE_RENDERERS,
  HAS_SOURCES_TAB,
  HAS_COMPARE_TAB,
  SourcesList,
} from '../registry/renderers.js';
import { escapeText } from '../registry/utils.js';
import type { OutputTab } from '../hooks/useWorkspace.js';

interface OutputPanelProps {
  kind: string;
  output: unknown;
  priorOutput: unknown;
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

function buildMarkdown(props: OutputPanelProps): string {
  const lines: string[] = [];
  lines.push(`# ${props.kind} result`);
  lines.push('');
  lines.push(`- **Total**: ${props.totalMs}ms`);
  if (props.streamingModel) lines.push(`- **Model**: ${props.streamingModel}`);
  if (props.streamingTokenCount) lines.push(`- **Tokens**: ${props.streamingTokenCount}`);
  if (props.error) lines.push(`- **Error**: ${props.error}`);
  lines.push('');
  lines.push('## Output');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(props.output, null, 2));
  lines.push('```');
  if (props.sources.length > 0) {
    lines.push('');
    lines.push(`## Sources (${props.sources.length})`);
    for (const [i, s] of props.sources.entries()) {
      lines.push(`### ${i + 1}. ${s.tool}`);
      lines.push('```json');
      lines.push(JSON.stringify({ input: s.input, output: s.output }, null, 2));
      lines.push('```');
    }
  }
  return lines.join('\n');
}

async function copyAsMarkdown(props: OutputPanelProps): Promise<void> {
  const md = buildMarkdown(props);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(md);
    } else {
      // Fallback for non-secure-context browsers.
      const ta = document.createElement('textarea');
      ta.value = md;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Copy as Markdown failed', err);
  }
}

function OutputTabs({
  hasSources,
  hasCompare,
  active,
  onChange,
  sourceCount,
  onCopy,
}: {
  hasSources: boolean;
  hasCompare: boolean;
  active: OutputTab;
  onChange: (tab: OutputTab) => void;
  sourceCount: number;
  onCopy: () => void;
}) {
  return (
    <div className="output-tabs">
      <button
        type="button"
        className={`output-tab ${active === 'result' ? 'output-tab-active' : ''}`}
        data-output-tab="result"
        onClick={() => onChange('result')}
      >
        Result
      </button>
      {hasSources && (
        <button
          type="button"
          className={`output-tab ${active === 'sources' ? 'output-tab-active' : ''}`}
          data-output-tab="sources"
          onClick={() => onChange('sources')}
        >
          Sources (<span className="source-count">{sourceCount}</span>)
        </button>
      )}
      <button
        type="button"
        className={`output-tab ${active === 'json' ? 'output-tab-active' : ''}`}
        data-output-tab="json"
        onClick={() => onChange('json')}
      >
        Raw JSON
      </button>
      {hasCompare && (
        <button
          type="button"
          className={`output-tab ${active === 'compare' ? 'output-tab-active' : ''}`}
          data-output-tab="compare"
          onClick={() => onChange('compare')}
        >
          Compare with prior
        </button>
      )}
      <div className="output-tabs-right">
        <button
          className="icon-btn"
          title="Copy as Markdown"
          aria-label="Copy as Markdown"
          onClick={onCopy}
        >
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
  return renderer(output, {
    totalMs,
    sources,
    streamingText,
    streamingModel,
    streamingTokenCount,
    onHitlApprove,
    onHitlReject,
  });
}

function RenderJSON({ output }: { output: unknown }) {
  if (!output) return <p className="muted">No output yet.</p>;
  return <pre className="json-pre" dangerouslySetInnerHTML={{ __html: highlightJSON(output) }} />;
}

function RenderCompare({ kind, cur, prior }: { kind: string; cur: unknown; prior: unknown }) {
  const renderer = COMPARE_RENDERERS[kind];
  if (!renderer) return <p className="muted">No compare renderer.</p>;
  return renderer(cur, prior);
}

export function OutputPanel(props: OutputPanelProps) {
  return (
    <section className="output-panel" aria-label="Output">
      <OutputTabs
        hasSources={HAS_SOURCES_TAB[props.kind] || false}
        hasCompare={HAS_COMPARE_TAB[props.kind] || false}
        active={props.activeTab}
        onChange={props.setActiveTab}
        sourceCount={props.sources.length}
        onCopy={() => void copyAsMarkdown(props)}
      />
      <div className="output-body">
        {props.activeTab === 'result' && (
          <div className="output-content prose">
            <RenderResult {...props} />
          </div>
        )}
        {props.activeTab === 'sources' && (
          <div className="output-content prose">
            <SourcesList sources={props.sources} />
          </div>
        )}
        {props.activeTab === 'json' && (
          <div className="output-content prose">
            <RenderJSON output={props.output} />
          </div>
        )}
        {props.activeTab === 'compare' && (
          <div className="output-content prose">
            <RenderCompare kind={props.kind} cur={props.output} prior={props.priorOutput} />
          </div>
        )}
      </div>
    </section>
  );
}
