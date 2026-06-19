# Mastra Playground — Live Public URL

**Cloudflare Tunnel:** https://today-mining-hardware-calls.trycloudflare.com
**Started:** 2026-06-18 19:04 UTC
**Local server:** http://localhost:8917
**Last updated:** 2026-06-19 23:21 UTC (0.4.0 release: a11y + UI smoke test + audit relocation)

## ⚠️ Cloudflared quick-tunnel note (important)

The quick-tunnel **buffers the entire SSE response** before forwarding it. This means
the streaming-chat example (07) will appear to "snap" to the final answer when
accessed via the public URL, even though the local server streams correctly. For
the full streaming UX, run the server locally:

```bash
cd /home/azureuser/workspace/mastra-playground
./scripts/launch-with-hermes-key.sh    # auto-sources the OpenRouter key
# then open http://localhost:8917 in a browser
```

For SSE through the public URL, set up a **named cloudflared tunnel** (config-file
based) or use ngrok. The quick-tunnel cannot be configured to forward SSE
progressively.

## What's new in 0.4.0

- **JSDOM-based UI smoke test** (`scripts/ui-smoke.test.ts`) — 7 new tests that
  run the actual `public/app.js` in a JSDOM environment with a stub EventSource.
  Catches DOM/event-handler bugs the API smoke test can't. This is the
  highest-leverage follow-up from the previous session.
- **A11y pass (G1 from brainstorm)**:
  - Tab keyboard navigation per WAI-ARIA tabs pattern (ArrowLeft/Right,
    Home/End, Enter/Space). Roving tabindex.
  - `aria-controls` on every tab linking to its panel.
  - History panel: `role="dialog"`, `aria-modal="true"`, focus trap, Escape
    closes, focus restored on close.
  - Streaming meta: `aria-live="polite"`.
  - HITL Approve/Reject: explicit `aria-label`s.
- **Audit relocation (B5)**: `.audit-findings.md` moved to
  `docs/audit/2026-06-18-code-review.md`. Added `docs/audit/SUMMARY.md` (1-page
  summary of the 16 findings, what was fixed, what was deferred).

## What's new in 0.3.0

- **Example 07 — Streaming Chat** — `Agent.stream()` with token-by-token events.
  New `llm:start` / `llm:delta` / `llm:end` event types in `shared/tracer.ts`.
  Streams correctly when the server is reached directly (the cloudflared
  quick-tunnel buffers; see note above).
- **Server-side trace logging** via `?trace=true` query param. Writes structured
  JSON to stderr for `npm run serve | jq` workflows.
- **vitest unit tests** for shared modules (30 tests).
- **Multi-stage Dockerfile** + `.dockerignore` + `docker-compose.yml`.
- **B1 fix**: removed redundant `newAgent` from ex 01's `Mastra` constructor.
- **Render\* defensive guards**: `renderTriage`, `renderResearch`, `renderCodeReview`,
  `renderParallel`, `renderChat` now handle unexpected output shapes gracefully
  (no more TypeError when the workflow returns an error object).

## What's new in 0.2.0

- `GET /api/health` endpoint
- Graceful shutdown handler (SIGTERM/SIGINT, 30s timeout, drain in-flight SSE)
- Per-IP rate limiting (30 req/min) on `/api/run/*` and `/api/resume/*`
- Request validation + input sanitization
- Structured JSON logger (`shared/logger.ts`)
- Secrets hardening (refuses to start without a real `OPENAI_API_KEY`)
- `.editorconfig`, `.nvmrc`, `.prettierrc`
- `LICENSE` (MIT), `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`
- GitHub Actions CI (typecheck + format check + smoke test)

## What's in 0.1.0

- Six examples (support-triage, research, code-review, parallel-research,
  multi-turn-chat, hitl-approval)
- Vanilla HTML/CSS/JS UI with SSE trace streaming
- Animated SVG workflow graphs
- Local server on :8917
- `notes/learning-log.md` and `notes/comparison-to-inboxpilot.md` (user deliverable)

## PIDs and processes

- **Cloudflared tunnel:** PID 4055591 (started 2026-06-18 19:04 UTC, still running
  after multiple server restarts — picks up new servers automatically)
- **Local server:** `npx tsx server/server.ts` (PID varies per restart)

## Caveats

- **Streaming via the public URL** is buffered by the cloudflared quick-tunnel
  (see ⚠️ note above). Run locally for the real streaming UX.
- **trycloudflare.com URL rotates on reconnect** — if the cloudflared process
  restarts, the URL changes. The current URL has been stable since 2026-06-18.
- **Mocked tools, not real APIs** — see `examples/*/tools/*` for the canned data.
  Replace the `*Direct` functions to wire in real APIs.
- **Not for production** — this is a learning playground. No real auth, no
  rate-limit bypass, no production hardening beyond the Wave 2 work.

## See also

- [`README.md`](README.md) — project overview
- [`docs/audit/SUMMARY.md`](docs/audit/SUMMARY.md) — code review summary
- [`docs/audit/2026-06-18-code-review.md`](docs/audit/2026-06-18-code-review.md) — full audit
- [`CHANGELOG.md`](CHANGELOG.md) — what changed in each version
- [`SECURITY.md`](SECURITY.md) — what this project does and doesn't protect against
