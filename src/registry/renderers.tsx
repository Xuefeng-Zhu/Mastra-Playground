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

import { formatSec } from './utils.js';
import { COMPARE_RENDERERS } from './compare-renderers.js';
import {
  ChatThread,
  HitlFinal,
  HitlPending,
  SourcesList,
  StreamingView,
  SummaryGrid,
  type CapturedSource,
  type ChatMsg,
} from './renderer-components.js';

export interface RenderContext {
  totalMs: number;
  sources: CapturedSource[];
  streamingText: string;
  streamingModel: string;
  streamingTokenCount: number;
  onHitlApprove: (token: string) => void;
  onHitlReject: (token: string) => void;
}

type TriageOutput = {
  action?: string;
  triage?: {
    intent: string;
    urgency: string;
    confidence: number;
    requires_human: boolean;
    summary: string;
    response_text?: string;
  };
};
type ResearchOutput = { formatted?: string };
type CodeReviewOutput = { action?: string; issueCount?: number; review?: string };
type ParallelOutput = { synthesis?: string };
type ChatOutput = { allMessages?: ChatMsg[]; escalated?: boolean; escalationReason?: string | null };
type StreamingOutput = { finalText?: string; model?: string; durationMs?: number; deltas?: unknown[] };
type HitlOutput = {
  token?: string;
  classified?: { amount?: number; urgency?: string; reasoning?: string };
  decision?: string;
  executed?: boolean;
  message?: string;
};
type CriticLoopOutput = {
  draft?: string;
  score?: number;
  iterations?: number;
  threshold?: number;
  history?: { index: number; score: number; draft: string; feedback: string }[];
};
type ContentPipelineOutput = { research?: string; draft?: string; score?: number; edited?: string };
type MemoryOutput = {
  recalled?: boolean;
  historyLength?: number;
  turn1?: { output?: string };
  turn2?: { output?: string };
};

// ── the per-kind renderers ─────────────────────────────────────────────

function renderTriage(value: unknown, ctx: RenderContext) {
  const out = value as TriageOutput | null;
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

function renderResearch(value: unknown, ctx: RenderContext) {
  const out = value as ResearchOutput | null;
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

function renderCodeReview(value: unknown, ctx: RenderContext) {
  const out = value as CodeReviewOutput | null;
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

function renderParallel(value: unknown, ctx: RenderContext) {
  const out = value as ParallelOutput | null;
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

function renderChat(value: unknown) {
  const out = value as ChatOutput | null;
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

function renderStreaming(value: unknown, ctx: RenderContext) {
  const out = value as StreamingOutput | null;
  const text = ctx.streamingText || out?.finalText || '';
  const model = out?.model || ctx.streamingModel || '';
  const durationMs = out?.durationMs || ctx.totalMs;
  const tokens = out?.deltas?.length || ctx.streamingTokenCount || 0;
  return <StreamingView text={text} tokens={tokens} durationMs={durationMs} model={model} />;
}

function renderHitl(value: unknown, ctx: RenderContext) {
  const out = value as HitlOutput | null;
  if (out?.token && out?.classified && out?.decision === undefined) {
    const token = out.token;
    return (
      <HitlPending
        token={token}
        classified={out.classified}
        onApprove={() => ctx.onHitlApprove(token)}
        onReject={() => ctx.onHitlReject(token)}
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

function renderCriticLoop(value: unknown, ctx: RenderContext) {
  const out = value as CriticLoopOutput | null;
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
            {history.map((it, i) => (
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

function renderContentPipeline(value: unknown, ctx: RenderContext) {
  const out = value as ContentPipelineOutput | null;
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

function renderMastraMemory(value: unknown, ctx: RenderContext) {
  const out = value as MemoryOutput | null;
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

// ── the public dispatcher ──────────────────────────────────────────────

export const RESULT_RENDERERS: Record<string, (out: unknown, ctx: RenderContext) => React.ReactNode> = {
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
export type { CapturedSource, ChatMsg };
export { COMPARE_RENDERERS };
