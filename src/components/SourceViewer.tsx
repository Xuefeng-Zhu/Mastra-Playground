import { useCallback, useEffect, useState } from 'react';
import { exampleNameToId } from '../registry/utils';

interface SourceViewerProps {
  exampleNum: number;
  exampleName: string;
  onClose: () => void;
}

function highlightTs(code: string): string {
  // Escape HTML first
  let html = code
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  // Comments (single-line and block)
  html = html.replaceAll(/(\/\/[^\n]*)/g, '<span class="src-comment">$1</span>');
  html = html.replaceAll(/(\/\*[\s\S]*?\*\/)/g, '<span class="src-comment">$1</span>');

  // Strings (single and double quotes, template literals)
  html = html.replaceAll(/(&quot;[^&]*?&quot;)/g, '<span class="src-string">$1</span>');
  html = html.replaceAll(/(&#x27;[^&#]*?&#x27;|'[^']*?')/g, '<span class="src-string">$1</span>');

  // Keywords
  const keywords =
    '\\b(import|export|from|const|let|var|function|async|await|return|if|else|for|while|switch|case|break|default|new|throw|try|catch|finally|typeof|type|interface|class|extends|implements|as|readonly|enum|null|undefined|true|false|void|this)\\b';
  html = html.replaceAll(new RegExp(keywords, 'g'), '<span class="src-keyword">$1</span>');

  return html;
}

export function SourceViewer({ exampleNum, exampleName, onClose }: SourceViewerProps) {
  const [source, setSource] = useState<string | null>(null);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const slug = exampleNameToId(exampleNum, exampleName);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const resp = await fetch(`/api/source/${encodeURIComponent(slug)}`);
        const json = (await resp.json()) as { source?: string; filename?: string; error?: string };
        if (cancelled) return;
        if (!resp.ok || json.error) {
          setError(json.error ?? `Failed to load source (${resp.status})`);
        } else {
          setSource(json.source ?? '');
          setFilename(json.filename ?? '');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const copySource = useCallback(async () => {
    if (!source) return;
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore copy failures
    }
  }, [source]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const lineCount = source?.split('\n').length ?? 0;

  return (
    <div className="source-viewer-overlay" onClick={onClose} role="dialog" aria-label="Example source code">
      <div className="source-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="source-viewer-header">
          <span className="source-viewer-filename">{filename || 'Loading…'}</span>
          <span className="source-viewer-meta">
            {source !== null && `${lineCount} lines`}
          </span>
          <div className="source-viewer-actions">
            <button
              type="button"
              className="icon-btn"
              title={copied ? 'Copied!' : 'Copy source'}
              aria-label="Copy source code"
              onClick={copySource}
              disabled={!source}
            >
              {copied ? '✓' : '⧉'}
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Close (Esc)"
              aria-label="Close source viewer"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>
        <div className="source-viewer-body">
          {error && <p className="muted output-error">⚠ {error}</p>}
          {source === null && !error && <p className="muted">Loading source…</p>}
          {source !== null && (
            <div className="source-viewer-code-wrapper">
              <div className="source-viewer-gutter" aria-hidden="true">
                {source.split('\n').map((_, i) => (
                  <span key={i}>{i + 1}</span>
                ))}
              </div>
              <pre className="source-viewer-pre">
                <code dangerouslySetInnerHTML={{ __html: highlightTs(source) }} />
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
