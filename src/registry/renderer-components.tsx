import { formatSec, escapeText } from './utils';

export interface CapturedSource {
  tool: string;
  input: unknown;
  output: unknown;
}

export interface ChatMsg {
  role: string;
  content: string;
  ts: number;
}

export function SummaryGrid({ items }: { items: { label: string; value: string; className?: string }[] }) {
  return (
    <div className="summary-grid">
      {items.map((item) => (
        <div key={item.label} className={`summary-item ${item.className ?? ''}`}>
          <div className="label">{item.label}</div>
          <div className="value">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export function SourcesList({ sources }: { sources: CapturedSource[] }) {
  if (sources.length === 0) return <p className="muted">No sources captured. Run the workflow first.</p>;
  return (
    <div className="src-list">
      {sources.map((source, index) => (
        <details key={`${source.tool}-${index}`} className="src-block" open>
          <summary>
            <span className="src-num">{index + 1}</span> <strong>{escapeText(source.tool)}</strong>{' '}
            <span className="muted">— {escapeText(JSON.stringify(source.input))}</span>
          </summary>
          <pre className="src-output">{escapeText(JSON.stringify(source.output, null, 2))}</pre>
        </details>
      ))}
    </div>
  );
}

export function ChatThread({
  messages,
  escalated,
  escalationReason,
}: {
  messages: ChatMsg[];
  escalated: boolean;
  escalationReason: string | null;
}) {
  if (messages.length === 0) return <p className="muted">Send a message to start the conversation.</p>;
  return (
    <div className="chat-thread">
      {messages.map((message, index) => (
        <div key={`${message.ts}-${index}`} className={`chat-msg ${message.role}`}>
          <div className="chat-msg-body">{message.content}</div>
          <div className="chat-msg-meta">
            {new Date(message.ts).toLocaleTimeString('en-US', { hour12: false })}
          </div>
        </div>
      ))}
      {escalated ? (
        <div className="escalation-badge">⚠ ESCALATED{escalationReason ? `: ${escalationReason}` : ''}</div>
      ) : null}
    </div>
  );
}

export function StreamingView({
  text,
  tokens,
  durationMs,
  model,
}: {
  text: string;
  tokens: number;
  durationMs: number;
  model: string;
}) {
  const tokensPerSecond = durationMs > 0 ? (tokens / (durationMs / 1000)).toFixed(1) : '0.0';
  return (
    <div className="streaming-view">
      <div className="streaming-header">Streaming response</div>
      <div className="streaming-text">{text}</div>
      <div className="streaming-meta">
        <span className="streaming-tokens">{tokens} tokens</span> ·{' '}
        <span className="streaming-rate">{tokensPerSecond} tok/s</span> ·{' '}
        <span className="streaming-time">{formatSec(durationMs)}</span>
        {model ? (
          <>
            {' '}
            · <span className="streaming-model">{model}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

type Classification = { amount?: number; urgency?: string; reasoning?: string };

export function HitlPending({
  token,
  classified,
  onApprove,
  onReject,
}: {
  token: string;
  classified: Classification;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="pending-approval" data-token={token}>
      <div className="pending-approval-header">⏸ Pending approval</div>
      <div className="pending-approval-detail">
        <span className="pad-label">Amount</span>
        <span className="pad-value">${classified.amount ?? '?'}</span>
        <span className="pad-label">Urgency</span>
        <span className="pad-value">{classified.urgency ?? '?'}</span>
        <span className="pad-label">Reasoning</span>
        <span className="pad-value">{classified.reasoning ?? ''}</span>
      </div>
      <div className="pending-approval-actions">
        <button type="button" className="btn-approve" onClick={onApprove}>
          ✅ Approve
        </button>
        <button type="button" className="btn-reject" onClick={onReject}>
          ❌ Reject
        </button>
      </div>
      <div className="pending-approval-token muted">Token: {token}</div>
    </div>
  );
}

export function HitlFinal({
  classified,
  decision,
  executed,
  message,
}: {
  classified: Classification;
  decision: string;
  executed: boolean;
  message: string;
}) {
  const statusLabel = executed ? 'Action executed' : 'Action blocked';
  return (
    <>
      <div className={`hitl-final-banner ${executed ? 'executed' : 'blocked'}`}>
        <span className="icon">{executed ? '✅' : '🛑'}</span>
        <span>{message || statusLabel}</span>
      </div>
      <div className="output-section">
        <h3>Classification</h3>
        <div className="pending-approval-detail">
          <span className="pad-label">Amount</span>
          <span className="pad-value">${classified.amount ?? 0}</span>
          <span className="pad-label">Urgency</span>
          <span className="pad-value">{classified.urgency ?? '?'}</span>
          <span className="pad-label">Reasoning</span>
          <span className="pad-value">{classified.reasoning ?? ''}</span>
          <span className="pad-label">Decision</span>
          <span className="pad-value">{decision}</span>
        </div>
      </div>
    </>
  );
}
