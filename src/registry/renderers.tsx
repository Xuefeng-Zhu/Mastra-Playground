/**
 * <OutputBody> and the per-kind renderers.
 *
 * The renderers are the React equivalent of the v2.js V2_RENDERERS table.
 * Each renderer is a small component that takes the workflow's output
 * (and the surrounding context: totalMs, sources, streamingText) and
 * returns the JSX for the active output tab.
 *
 * The "shape" of a renderer's output is what shows up under the "Result"
 * tab. Sources/Raw-JSON/Compare have their own (mostly shared) renderers
 * in <OutputPanel>.
 */

import { formatSec, escapeText } from './utils.js';
import type { FormSample } from './examples.js';
import type { V2Example } from './examples.js';

// ── shared bits ─────────────────────────────────────────────────────────

function SummaryGrid({ items }: { items: { label: string; value: string; className?: string }[] }) {
  return (
    <div className="summary-grid">
      {items.map((it, i) => (
        <div key={i} className={`summary-item ${it.className ?? ''}`}>
          <div className="label">{it.label}</div>
          <div className="value">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

function CompareGrid({
  currentLabel,
  priorLabel,
  currentText,
  priorText,
}: {
  currentLabel: string;
  priorLabel: string;
  currentText: string;
  priorText: string;
}) {
  return (
    <div className="compare-grid">
      <section className="compare-col">
        <header>{currentLabel}</header>
        <div className="compare-body">{currentText}</div>
      </section>
      <section className="compare-col">
        <header>{priorLabel}</header>
        <div className="compare-body">{priorText}</div>
      </section>
    </div>
  );
}

function SourcesList({ sources }: { sources: CapturedSource[] }) {
  if (sources.length === 0) {
    return <p className="muted">No sources captured. Run the workflow first.</p>;
  }
  return (
    <div className="src-list">
      {sources.map((s, i) => (
        <details key={i} className="src-block" open>
          <summary>
            <span className="src-num">{i + 1}</span> <strong>{escapeText(s.tool)}</strong>{' '}
            <span className="muted">— {escapeText(JSON.stringify(s.input))}</span>
          </summary>
          <pre className="src-output">{escapeText(JSON.stringify(s.output, null, 2))}</pre>
        </details>
      ))}
    </div>
  );
}

function ChatThread({
  messages,
  escalated,
  escalationReason,
}: {
  messages: ChatMsg[];
  escalated: boolean;
  escalationReason: string | null;
}) {
  if (messages.length === 0) {
    return <p className="muted">Send a message to start the conversation.</p>;
  }
  return (
    <div className="chat-thread">
      {messages.map((m, i) => (
        <div key={i} className={`chat-msg ${m.role}`}>
          <div className="chat-msg-body">{m.content}</div>
          <div className="chat-msg-meta">{new Date(m.ts).toLocaleTimeString('en-US', { hour12: false })}</div>
        </div>
      ))}
      {escalated && (
        <div className="escalation-badge">⚠ ESCALATED{escalationReason ? `: ${escalationReason}` : ''}</div>
      )}
    </div>
  );
}

function StreamingView({
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
  const tps = durationMs > 0 ? (tokens / (durationMs / 1000)).toFixed(1) : '0.0';
  return (
    <div className="streaming-view">
      <div className="streaming-header">Streaming response</div>
      <div className="streaming-text">{text}</div>
      <div className="streaming-meta">
        <span className="streaming-tokens">{tokens} tokens</span> ·{' '}
        <span className="streaming-rate">{tps} tok/s</span> ·{' '}
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

function HitlPending({
  token,
  classified,
  onApprove,
  onReject,
}: {
  token: string;
  classified: { amount?: number; urgency?: string; reasoning?: string };
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
        <button
          type="button"
          className="btn-approve v2-btn-approve"
          onClick={onApprove}
          aria-label="Approve the proposed action"
        >
          ✅ Approve
        </button>
        <button
          type="button"
          className="btn-reject v2-btn-reject"
          onClick={onReject}
          aria-label="Reject the proposed action"
        >
          ❌ Reject
        </button>
      </div>
      <div className="pending-approval-token muted">Token: {token}</div>
    </div>
  );
}

function HitlFinal({
  classified,
  decision,
  executed,
  message,
}: {
  classified: { amount?: number; urgency?: string; reasoning?: string };
  decision: string;
  executed: boolean;
  message: string;
}) {
  return (
    <>
      <div className={`hitl-final-banner ${executed ? 'executed' : 'blocked'}`}>
        <span className="icon">{executed ? '✅' : '🛑'}</span>
        <span>
          {executed ? 'Action executed' : 'Action blocked'}: {message}
        </span>
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

// ── types shared with the workspace hook ──────────────────────────────

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

export interface RenderContext {
  totalMs: number;
  sources: CapturedSource[];
  streamingText: string;
  streamingModel: string;
  streamingTokenCount: number;
  onHitlApprove: (token: string) => void;
  onHitlReject: (token: string) => void;
}

// ── the per-kind renderers ─────────────────────────────────────────────

function renderTriage(out: any, ctx: RenderContext) {
  const t = out?.triage;
  const action = out?.action;
  if (!t || !action) return <p className="muted">(no output)</p>;
  return (
    <>
      <SummaryGrid
        items={[
          { label: 'Intent', value: t.intent, className: `intent-${t.intent}` },
          { label: 'Urgency', value: t.urgency },
          { label: 'Confidence', value: Number(t.confidence).toFixed(2) },
          { label: 'Human', value: t.requires_human ? 'yes' : 'no' },
        ]}
      />
      <p className="summary-text">{t.summary}</p>
      <p className={`action-text action-${action}`}>
        <strong>{action}</strong>
      </p>
      <p className={`response-text ${action === 'escalated' ? 'escalated' : ''}`}>
        {t.response_text || '(no response — escalated to human)'}
      </p>
      <p className="muted">{formatSec(ctx.totalMs)}</p>
    </>
  );
}

function renderResearch(out: any, ctx: RenderContext) {
  const formatted = out?.formatted;
  if (!formatted) return <p className="muted">(no output)</p>;
  const paragraphs = String(formatted)
    .split(/\n\n+/)
    .map((p, i) => <p key={i}>{p}</p>);
  return (
    <>
      {paragraphs}
      <p className="muted">{formatSec(ctx.totalMs)}</p>
    </>
  );
}

function renderCodeReview(out: any, ctx: RenderContext) {
  if (!out || !out.action) return <p className="muted">(no output)</p>;
  const lgtm = out.action === 'approved';
  return (
    <>
      <SummaryGrid
        items={[
          { label: 'Action', value: out.action, className: `action-${out.action}` },
          { label: 'Issues', value: String(out.issueCount || 0) },
        ]}
      />
      <p className="muted">{lgtm ? 'Auto-approved (no LLM call)' : 'LLM-generated review'}</p>
      <p className={`response-text ${lgtm ? 'lgtm' : ''}`}>{out.review || '(empty)'}</p>
      <p className="muted">{formatSec(ctx.totalMs)}</p>
    </>
  );
}

function renderParallel(out: any, ctx: RenderContext) {
  const synth = out?.synthesis;
  if (!synth) return <p className="muted">Run the workflow to see the synthesized answer.</p>;
  const paragraphs = synth.split(/\n\n+/).map((p: string, i: number) => <p key={i}>{p}</p>);
  return (
    <>
      {paragraphs}
      <p className="muted">
        Synthesized in {formatSec(ctx.totalMs)} · {ctx.sources.length} source
        {ctx.sources.length === 1 ? '' : 's'}.
      </p>
    </>
  );
}

function renderChat(out: any, ctx: RenderContext) {
  // The expression must prefer `out.allMessages` when present (post-run
  // state). The previous code was `out?.allMessages || ctx.streamingText
  // ? [] : []` which JS parsed as `((out?.allMessages) ||
  // (ctx.streamingText)) ? [] : []` — empty array is truthy in JS, so the
  // ternary ALWAYS returned `[]` and chat examples never rendered
  // messages. Use `??` so empty arrays pass through unchanged.
  const messages: ChatMsg[] = (out?.allMessages as ChatMsg[] | undefined) ?? [];
  // For chat, the SSE handler updates the local messages state via a
  // callback; the output's allMessages is the source of truth.
  const escalated = !!out?.escalated;
  const escalationReason = out?.escalationReason ?? null;
  return <ChatThread messages={messages} escalated={escalated} escalationReason={escalationReason} />;
}

function renderStreaming(out: any, ctx: RenderContext) {
  const text = ctx.streamingText || out?.finalText || '';
  const model = out?.model || ctx.streamingModel || '';
  const durationMs = out?.durationMs || ctx.totalMs;
  const tokens = out?.deltas?.length || ctx.streamingTokenCount || 0;
  return <StreamingView text={text} tokens={tokens} durationMs={durationMs} model={model} />;
}

function renderHitl(out: any, ctx: RenderContext) {
  if (out?.token && out?.classified && out?.decision === undefined) {
    return (
      <HitlPending
        token={out.token}
        classified={out.classified}
        onApprove={() => ctx.onHitlApprove(out.token)}
        onReject={() => ctx.onHitlReject(out.token)}
      />
    );
  }
  return (
    <HitlFinal
      classified={out?.classified || {}}
      decision={out?.decision || '?'}
      executed={!!out?.executed}
      message={out?.message || ''}
    />
  );
}

function renderCriticLoop(out: any, ctx: RenderContext) {
  if (!out || !out.draft) return <p className="muted">(no output)</p>;
  const history = out.history || [];
  return (
    <>
      <SummaryGrid
        items={[
          { label: 'Final score', value: `${out.score || 0}/10` },
          { label: 'Iterations', value: String(out.iterations || 0) },
          { label: 'Threshold', value: `${out.threshold || 0}/10` },
        ]}
      />
      <h3>Final draft</h3>
      <p className="response-text">{out.draft}</p>
      {history.length > 0 && (
        <details className="src-block" open>
          <summary>Iteration history ({history.length})</summary>
          <ol className="iter-list">
            {history.map((it: any, i: number) => (
              <li key={i}>
                <strong>Draft {it.index + 1}</strong> · score <strong>{it.score}/10</strong>
                <p className="iter-draft">{it.draft}</p>
                <p className="iter-feedback muted">
                  <em>{it.feedback}</em>
                </p>
              </li>
            ))}
          </ol>
        </details>
      )}
      <p className="muted">{formatSec(ctx.totalMs)}</p>
    </>
  );
}

function renderContentPipeline(out: any, ctx: RenderContext) {
  if (!out) return <p className="muted">(no output)</p>;
  return (
    <>
      <h3>Research</h3>
      <p className="response-text">{out.research || ''}</p>
      <h3>Draft</h3>
      <p className="response-text">{out.draft || ''}</p>
      <h3>Edit (score {out.score || 0}/10)</h3>
      <p className="response-text">{out.edited || out.draft || ''}</p>
      <p className="muted">{formatSec(ctx.totalMs)}</p>
    </>
  );
}

function renderMastraMemory(out: any, ctx: RenderContext) {
  if (!out) return <p className="muted">(no output)</p>;
  const t1 = out.turn1;
  const t2 = out.turn2;
  return (
    <>
      <SummaryGrid
        items={[
          { label: 'Recalled?', value: out.recalled ? '✓ yes' : '✗ no' },
          { label: 'History length', value: String(out.historyLength || 0) },
        ]}
      />
      <h3>Turn 1 response</h3>
      <p className="response-text">{t1?.output || ''}</p>
      <h3>Turn 2 response (after memory)</h3>
      <p className="response-text">{t2?.output || ''}</p>
      <p className="muted">{formatSec(ctx.totalMs)}</p>
    </>
  );
}

// ── the per-kind compare renderers ─────────────────────────────────────

function compareTriage(cur: any, prior: any) {
  const curR = cur?.triage?.response_text;
  const priorR = prior?.triage?.response_text;
  if (!curR && !priorR) return <p className="muted">Run the workflow twice to compare.</p>;
  if (!priorR) return <p className="muted">No prior run yet.</p>;
  return (
    <CompareGrid
      currentLabel="Current"
      priorLabel="Prior"
      currentText={curR || '(empty)'}
      priorText={priorR}
    />
  );
}

function compareResearch(cur: any, prior: any) {
  const curF = cur?.formatted;
  const priorF = prior?.formatted;
  if (!curF && !priorF) return <p className="muted">Run the workflow twice to compare.</p>;
  if (!priorF) return <p className="muted">No prior run yet.</p>;
  return (
    <CompareGrid
      currentLabel="Current"
      priorLabel="Prior"
      currentText={curF || '(empty)'}
      priorText={priorF}
    />
  );
}

function compareCodeReview(cur: any, prior: any) {
  const curR = cur?.review;
  const priorR = prior?.review;
  if (!curR && !priorR) return <p className="muted">Run the workflow twice to compare.</p>;
  if (!priorR) return <p className="muted">No prior run yet.</p>;
  return (
    <CompareGrid
      currentLabel="Current"
      priorLabel="Prior"
      currentText={curR || '(empty)'}
      priorText={priorR}
    />
  );
}

function compareParallel(cur: any, prior: any) {
  const curS = cur?.synthesis;
  const priorS = prior?.synthesis;
  if (!curS && !priorS) return <p className="muted">Run the workflow twice to compare.</p>;
  if (!priorS) return <p className="muted">No prior run yet.</p>;
  return (
    <CompareGrid
      currentLabel="Current"
      priorLabel="Prior"
      currentText={curS || '(empty)'}
      priorText={priorS}
    />
  );
}

function compareChat() {
  return (
    <p className="muted">Chat threads aren't compared. Use the Raw JSON tab to inspect prior outputs.</p>
  );
}

function compareStreaming(cur: any, prior: any) {
  const curT = cur?.finalText;
  const priorT = prior?.finalText;
  if (!curT && !priorT) return <p className="muted">Run the workflow twice to compare.</p>;
  if (!priorT) return <p className="muted">No prior run yet.</p>;
  return (
    <CompareGrid
      currentLabel="Current"
      priorLabel="Prior"
      currentText={curT || '(empty)'}
      priorText={priorT}
    />
  );
}

function compareHitl() {
  return <p className="muted">HITL runs are stateful. Use the Raw JSON tab to inspect prior outputs.</p>;
}

function compareCriticLoop(cur: any, prior: any) {
  const curD = cur?.draft;
  const priorD = prior?.draft;
  if (!curD && !priorD) return <p className="muted">Run the workflow twice to compare.</p>;
  if (!priorD) return <p className="muted">No prior run yet.</p>;
  return (
    <CompareGrid
      currentLabel={`Current (${cur?.score || 0}/10)`}
      priorLabel={`Prior (${prior?.score || 0}/10)`}
      currentText={curD || '(empty)'}
      priorText={priorD}
    />
  );
}

function compareContentPipeline(cur: any, prior: any) {
  const curD = cur?.draft;
  const priorD = prior?.draft;
  if (!curD && !priorD) return <p className="muted">Run the workflow twice to compare.</p>;
  if (!priorD) return <p className="muted">No prior run yet.</p>;
  return (
    <CompareGrid
      currentLabel="Current draft"
      priorLabel="Prior draft"
      currentText={curD || '(empty)'}
      priorText={priorD}
    />
  );
}

function compareMastraMemory(cur: any, prior: any) {
  const curR = cur?.turn2?.output;
  const priorR = prior?.turn2?.output;
  if (!curR && !priorR) return <p className="muted">Run the workflow twice to compare.</p>;
  if (!priorR) return <p className="muted">No prior run yet.</p>;
  return (
    <CompareGrid
      currentLabel="Current"
      priorLabel="Prior"
      currentText={curR || '(empty)'}
      priorText={priorR}
    />
  );
}

// ── the public dispatcher ──────────────────────────────────────────────

export const RESULT_RENDERERS: Record<string, (out: any, ctx: RenderContext) => React.ReactNode> = {
  parallel: renderParallel,
  triage: renderTriage,
  research: renderResearch,
  codeReview: renderCodeReview,
  chat: renderChat,
  streaming: renderStreaming,
  hitl: renderHitl,
  criticLoop: renderCriticLoop,
  contentPipeline: renderContentPipeline,
  mastraMemory: renderMastraMemory,
};

export const COMPARE_RENDERERS: Record<string, (cur: any, prior: any) => React.ReactNode> = {
  parallel: compareParallel,
  triage: compareTriage,
  research: compareResearch,
  codeReview: compareCodeReview,
  chat: compareChat,
  streaming: compareStreaming,
  hitl: compareHitl,
  criticLoop: compareCriticLoop,
  contentPipeline: compareContentPipeline,
  mastraMemory: compareMastraMemory,
};

// The "parallel" kind has a Sources tab. Others don't.
export const HAS_SOURCES_TAB: Record<string, boolean> = {
  parallel: true,
  triage: false,
  research: false,
  codeReview: false,
  chat: false,
  streaming: false,
  hitl: false,
  criticLoop: false,
  contentPipeline: false,
  mastraMemory: false,
};

// HITL has its own tab set (no Compare — stateful).
export const HAS_COMPARE_TAB: Record<string, boolean> = {
  parallel: true,
  triage: true,
  research: true,
  codeReview: true,
  chat: true,
  streaming: true,
  hitl: false,
  criticLoop: true,
  contentPipeline: true,
  mastraMemory: true,
};

export { SourcesList, ChatThread, StreamingView, HitlPending, HitlFinal };
