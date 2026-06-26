import { useCallback, useEffect, useRef, useState } from 'react';
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

type SourceResponse = { source?: string; filename?: string; error?: string };

function isSourceResponse(value: unknown): value is SourceResponse {
  return value !== null && typeof value === 'object';
}

export function SourceViewer({ exampleNum, exampleName, onClose }: SourceViewerProps) {
  const [source, setSource] = useState<string | null>(null);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slug = exampleNameToId(exampleNum, exampleName);

  useEffect(() => {
    const request = new AbortController();

    void (async () => {
      try {
        const resp = await fetch(`/api/source/${encodeURIComponent(slug)}`, { signal: request.signal });
        const json = (await resp.json().catch(() => null)) as unknown;
        if (request.signal.aborted) return;
        if (!isSourceResponse(json)) {
          setError(`Failed to load source (${resp.status})`);
        } else if (!resp.ok || json.error) {
          setError(json.error ?? `Failed to load source (${resp.status})`);
        } else {
          setSource(json.source ?? '');
          setFilename(json.filename ?? '');
        }
      } catch (err) {
        if (request.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      request.abort();
    };
  }, [slug]);

  const copySource = useCallback(async () => {
    if (!source) return;
    try {
      await navigator.clipboard.writeText(source);
      setCopyError(null);
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : 'Unable to copy source.');
    }
  }, [source]);

  useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    [],
  );

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
          <span className="source-viewer-meta">{source !== null && `${lineCount} lines`}</span>
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
          {copyError && <p className="muted output-error">⚠ {copyError}</p>}
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
