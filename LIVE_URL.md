# Mastra Playground — Live Public URL

**Cloudflare Tunnel:** https://today-mining-hardware-calls.trycloudflare.com
**Started:** 2026-06-18 19:04 UTC (URL still working as of last edit)
**Local server:** http://localhost:8917
**Last updated:** 2026-06-19 07:08 UTC (audit LOW fixes landed; ex-07 work still in progress)

## What's new since last edit

- **Audit LOW fixes landed (`fix/audit-low-findings` branch, commit 904b369)** — three small but real items closed, no behavior change for users:
  - Stored cleanup `setInterval` handle and clear it in the existing `shutdown()` so the server can exit cleanly on SIGTERM/SIGINT (server.ts).
  - Deleted the orphan `.pending-approval` CSS block (stale class names that no HTML used). Live block was already in the second location. 129 lines removed.
  - Corrected a misleading comment on the new-conversation button (no server call exists; threads are localStorage-only).
  - Bonus: smoke test no longer asserts a hard-coded example count, which had broken when example 07 was added.
- **Example 04: Parallel Research** — plan sub-questions → fan out to 3 sources in parallel via `Promise.all` → synthesize. The pattern that maps directly to InboxPilot §8 (tool use).
- **Persistent history** — last 10 runs per example saved in `localStorage`. Recent-runs chips appear above each form. "View all (N)" opens a slide-over panel with timestamps, durations, and a Replay button.
- **Markdown export** — "Copy as Markdown" button on every result. Produces a Slack/PR-friendly summary with input, structured output, steps taken, and the response.
- **Per-example settings** — model dropdown (gpt-4o-mini / claude-3-5-haiku / llama-3.1-8b / gemini-flash) on every example, confidence threshold slider on Ex 01. Persisted to `localStorage`. The server actually swaps the model per request, so the LLM behavior changes visibly in the trace timing.

## What you can do at the URL

| Tab                    | What it does                                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 · Support Triage    | Classify → branch → respond or escalate. Try the model dropdown to see different LLMs in action. The threshold slider adds a `confidence < threshold` branch predicate. |
| 02 · Research Agent    | Agent with 2 tools decides what to call, then formats output.                                                                                                           |
| 03 · Code Review       | Read file → run lint → if issues, LLM writes review; else auto-approve (no LLM).                                                                                        |
| 04 · Parallel Research | Decompose → fan out to web + arxiv + wiki in parallel → synthesize. The trace shows 3 tool calls firing concurrently.                                                   |

All calls go through the OpenRouter key stored in `/home/azureuser/.hermes/.env`.

## Recent runs + Replay

Run any example → a chip appears above the form with the input + result summary. Click it to replay (re-runs with the same input). The "View all (N)" button opens a slide-over with timestamps, durations, and individual Replay/Delete buttons. Cap: 10 entries per example.

## Settings (⚙ per example)

- **Model**: Dropdown of 4 common OpenRouter models. Server actually swaps the model — visible in trace timing and output quality.
- **Confidence threshold** (Ex 01 only): Slider 0.0–1.0. When set, a `confidence < threshold` branch predicate forces escalation. Useful for testing the auto-escalation behavior.

Settings persist across page reloads (`localStorage`).

## Endpoints verified

| Endpoint                             | Status | Notes                            |
| ------------------------------------ | ------ | -------------------------------- |
| `GET /`                              | 200    | 4-tab UI with settings + history |
| `GET /api/examples`                  | 200    | 4 examples listed                |
| `POST /api/run/:example`             | 200    | One-shot JSON result             |
| `GET /api/stream/:example?input=...` | 200    | SSE trace stream                 |

## Background processes

| PID     | Process                                                 | Session             |
| ------- | ------------------------------------------------------- | ------------------- |
| 4124467 | `tsx server/server.ts` (the playground server on :8917) | `proc_2c60e345c2af` |
| 4055591 | `cloudflared tunnel --url http://localhost:8917`        | original from 19:04 |

The tunnel from the original start (19:04) survived the server restart — when I killed the old server and started a new one on the same port, the existing cloudflared picked up the new server and the URL stayed the same. **This won't always happen** — a cloudflared process restart WILL rotate the URL. Treat the URL as best-effort.

## Caveats

- **`trycloudflare.com` URLs rotate on every cloudflared restart.** The current URL is the one that happened to survive.
- **Account-less quick tunnel has no uptime guarantee.** Fine for dev/preview, not for production.
- **If you restart cloudflared (or the VM), the URL changes.** A new file is needed.
- **Model picker is real but model-specific prompt quality varies.** gpt-4o-mini works with the current prompts. claude-3-5-haiku returns non-conforming structured output (the framework catches it cleanly and surfaces the error). Lesson: structured outputs need prompt engineering per model family.
- **The auto-approval path on Ex 03 `clean.ts` is genuinely ~10ms** — no LLM call, just the mock tool chain. Demonstrates the cost-saving claim.
- **Ex 04's `fanout` step is genuinely parallel** — the trace shows 3 tool calls firing in quick succession, and the step's wall time is < the sum of the 3 latencies.

## Wave 2 (2026-06-19): Production-readiness pass

The server now has light production hardening (Wave 2 of the plan in
`.hermes/plans/2026-06-19_053800-production-readiness.md`):

- `GET /api/health` endpoint (liveness probe)
- Structured JSON logging (errors to stderr, rest to stdout)
- Request validation per example (400s include the field name)
- Per-IP rate limiting (30 req/min, 429 with Retry-After)
- Graceful shutdown on SIGTERM/SIGINT (30s drain timeout)
- Boot check refuses to start without a real OPENAI_API_KEY
