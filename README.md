# Mastra Playground

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node 22](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)](.nvmrc)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![Mastra 1.43](https://img.shields.io/badge/Mastra-1.43-FF6B6B)](https://mastra.ai)

A small, isolated TypeScript repo for learning [Mastra](https://mastra.ai) by
example. Eleven real workflows exercising the framework's primitives, with a
React + Vite browser UI that visualizes the execution trace in real time.

**Not for production. Not part of InboxPilot.**

## Table of contents

- [Quick start](#quick-start)
- [Why this exists](#why-this-exists)
- [Examples](#examples)
- [Web UI features](#web-ui-features)
- [Architecture](#architecture)
- [Environment variables](#environment-variables)
- [Project layout](#project-layout)
- [Adding a new example](#adding-a-new-example)
- [Troubleshooting](#troubleshooting)
- [Caveats](#caveats)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [License](LICENSE)

## Quick start

```bash
git clone <this-repo> mastra-playground && cd mastra-playground
nvm use                  # Node 22
npm install
cp .env.example .env
# Edit .env — set OPENAI_API_KEY (or OpenRouter key)
npm run build            # builds the React UI to dist/
npm run serve            # http://localhost:8917 (serves dist/)
```

Open <http://localhost:8917> in a browser. The UI shows 11 examples in a
left rail (grouped by Mastra primitive — agent / workflow / tool / memory /
HITL / stream), with the active example's workspace (form, trace, output)
in the main pane. `npm run build` is required before `npm run serve` —
the server reads from `dist/`, not from source.

> **Local-only dev loop:** `npm run dev` starts the Vite dev server on
> `:5173` with HMR if you'd rather not rebuild between edits. Note that
> the Node server (`npm run serve` on `:8917`) reads `dist/`, not the
> Vite dev server, so use one or the other.

## Why this exists

A learning playground for the user to evaluate whether to adopt Mastra into
their real product (InboxPilot). Each example is small enough to read in
under 5 minutes, exercises a specific Mastra primitive, and contrasts
explicitly with the InboxPilot equivalent. See
[`notes/comparison-to-inboxpilot.md`](notes/comparison-to-inboxpilot.md) for
the full writeup.

## Examples

| #   | Example                                                  | Mastra primitives                                    | What it teaches                                                           |
| --- | -------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| 01  | [Support Triage](examples/01-support-triage/)            | Agent, Workflow, structured output, `.branch()`      | The shape of an InboxPilot `AiAgentService` call.                         |
| 02  | [Research Agent](examples/02-research-agent/)            | Agent with tools, sequential workflow                | Tool-using agents with mocked APIs.                                       |
| 03  | [Code Review Agent](examples/03-code-review-agent/)      | Workflow with deterministic gate, conditional LLM    | When to call the LLM based on tool output, not the other way around.      |
| 04  | [Parallel Research](examples/04-parallel-research/)      | `Promise.all` fan-out inside a step                  | The pattern InboxPilot §8 ("tool use") would use.                         |
| 05  | [Multi-turn Chat](examples/05-multi-turn-chat/)          | Explicit conversation history in the prompt          | The pattern Mastra's `Memory` class abstracts over.                       |
| 06  | [Human-in-the-Loop Approval](examples/06-hitl-approval/) | `suspend()` / `run.resume()`                         | The exact mechanism for InboxPilot §13's "named human-in-the-loop owner". |
| 07  | [Streaming Chat](examples/07-streaming-chat/)            | `Agent.stream()` token-by-token                      | How to consume streaming responses in a Mastra agent.                     |
| 08  | [Critic Loop](examples/08-critic-loop/)                  | Evaluator-optimizer loop with score threshold        | Iterative self-critique until quality bar is met or budget runs out.      |
| 09  | [Multi-Agent Handoff](examples/09-multi-agent-handoff/)  | Primary agent + specialist agent delegation          | Multi-agent systems where narrow specialists own part of the surface.     |
| 10  | [Mastra Memory](examples/10-mastra-memory/)              | `@mastra/memory` `Memory` class, threadId+resourceId | The real abstraction that Example 05 hand-rolls with a Map.               |
| 11  | [Content Pipeline](examples/11-content-pipeline/)        | 3-agent pipeline (research → write → edit + score)   | Composing narrow role prompts beats one generalist.                       |

Each example is <350 lines including the CLI demo. The shared modules in
`shared/` are <300 lines total.

## Endpoints

| Method | Path                           | Purpose                                                      | Rate limit    |
| ------ | ------------------------------ | ------------------------------------------------------------ | ------------- |
| GET    | `/`                            | UI shell (served from `dist/index.html`)                     | none          |
| GET    | `/style.css`, `/assets/*`      | Static assets (Vite emits `dist/style.css` + bundled JS/CSS) | none          |
| GET    | `/api/health`                  | Liveness probe (`{ ok, uptimeSec, exampleCount }`)           | none          |
| GET    | `/api/examples`                | List available examples                                      | none          |
| POST   | `/api/run/:example`            | One-shot JSON result                                         | 30 req/min/IP |
| GET    | `/api/stream/:example?input=…` | SSE trace stream                                             | 30 req/min/IP |
| POST   | `/api/resume/:token`           | Resume a suspended workflow                                  | 30 req/min/IP |

All API requests return JSON. Errors carry `{ error, field?, detail? }` with
appropriate 4xx/5xx status codes. 429 responses include a `Retry-After`
header.

### Health check

```bash
curl -s http://localhost:8917/api/health
# {"ok":true,"uptimeSec":12,"nodeEnv":"development","exampleCount":11,"ts":"2026-06-19T..."}
```

### Smoke test

The `npm run smoke` script runs an end-to-end check (health, examples, run,
unknown example, bad JSON) against a running server. CI runs it as part of
every commit.

## Web UI features

- **Live trace visualization** — every step, LLM call, tool call, and branch
  evaluation is streamed from the server via Server-Sent Events. The browser
  shows the workflow DAG lighting up as each step fires, with a scrolling
  event log.
- **Persistent history** — the last 10 runs per example are saved in
  `localStorage`. Click any recent-run chip above the form to re-run with the
  same input. "View all" opens a slide-over panel with timestamps, durations,
  and a "Replay" button.
- **Markdown export** — "Copy as Markdown" button on every result. Produces
  a Slack/PR-friendly summary with input, structured output, steps taken, and
  the human-readable response block.
- **Per-example settings** — model dropdown (gpt-4o-mini / claude-3-5-haiku /
  llama-3.1-8b / gemini-flash) on every example, confidence threshold slider
  on Ex 01. Persisted to `localStorage`. The server actually swaps the model
  per request, so the LLM behavior changes visibly in the trace timing.
- **Multi-turn chat UI** — Ex 05 renders the conversation as chat bubbles with
  the agent's tool calls visible inline.
- **HITL approval panel** — Ex 06 shows an orange pulsing "PENDING APPROVAL"
  card with the action + LLM reasoning + Approve/Reject buttons when the
  workflow suspends.

## Architecture

```
┌─────────────────┐    SSE /api/stream/:example    ┌─────────────────┐
│   Browser       │ ◄──────────────────────────── │  Node http srv  │
│  (React + Vite  │                                │  (server/)      │
│   UI from dist/)│    POST /api/run/:example     │                 │
│  11 tabs        │ ────────────────────────────► │  loads example  │
│  1 graph each   │                                │  via dynamic    │
│  trace events   │    POST /api/resume/:token    │  import()       │
│  recent runs    │ ◄──────────────────────────── │                 │
└────────┬────────┘                                └────────┬────────┘
         │                                                 │
         │ localStorage                                    │ Mastra
         │ (history, settings, threads)                    │ runtime
         │                                                 ▼
         │                                       ┌─────────────────┐
         │                                       │  examples/*/    │
         │                                       │  index.ts       │
         │                                       │                 │
         │                                       │  Agent +        │
         │                                       │  Workflow +     │
         │                                       │  Tools (mocked) │
         │                                       │                 │
         │                                       │  runOne(input,  │
         │                                       │    tracer)       │
         │                                       └────────┬────────┘
         │                                                │
         │                                                ▼
         │                                       ┌─────────────────┐
         │                                       │  shared/         │
         │                                       │  tracer,         │
         │                                       │  llm factory,    │
         │                                       │  memory store,   │
         │                                       │  suspended runs  │
         │                                       └─────────────────┘
         │                                                │
         ▼                                                ▼
┌─────────────────┐                              ┌─────────────────┐
│  user clicks    │                              │  OpenRouter /    │
│  Approve        │                              │  OpenAI API      │
│  (HITL)         │                              │  (your key)     │
└─────────────────┘                              └─────────────────┘
```

The React UI lives in `src/` and is built by Vite into `dist/` (gitignored).
The Node server reads `dist/index.html`, `dist/style.css`, and `dist/assets/*`
directly — there is no separate hand-written JS bundle to ship.

## Environment variables

All variables are read at server startup. None are required for `npm run
typecheck` or `npm run format:check` (CI runs those without secrets).

| Variable          | Default       | Required? | Purpose                                                                                                               |
| ----------------- | ------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`  | _(none)_      | Yes       | API key for the LLM. The server refuses to start without it.                                                          |
| `OPENAI_BASE_URL` | _(OpenAI)_    | No        | Override for any OpenAI-compatible endpoint. Set to `https://openrouter.ai/api/v1` for OpenRouter.                    |
| `OPENAI_MODEL`    | `gpt-4o-mini` | No        | Default model. Can be overridden per-request via the UI's model picker.                                               |
| `PORT`            | `8917`        | No        | Server port.                                                                                                          |
| `NODE_ENV`        | _(unset)_     | No        | Set to `production` for `start:prod` script (no behavioral change today, but reserved for future prod-mode behavior). |

For OpenRouter (recommended — one key for many models):

```bash
OPENAI_API_KEY=sk-or-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=openai/gpt-4o-mini
```

## Project layout

```
mastra-playground/
  package.json, tsconfig.json, vite.config.ts, .env.example
  index.html                        # Vite entry (<script src="/src/main.tsx">)
  README.md, CHANGELOG.md, CONTRIBUTING.md, SECURITY.md, LICENSE
  .editorconfig, .nvmrc, .prettierrc
  .github/workflows/ci.yml           # typecheck + format check + smoke
  shared/                           # cross-example helpers (<135 lines each)
    llm.ts                          # getModel(id) factory
    observability.ts                # shared Mastra logger (ConsoleLogger)
    tracer.ts                       # Tracer class + TraceEvent types
    traced-step.ts                  # stepStart/stepEnd/llmStructured/toolCall helpers
    workflow-helpers.ts             # unwrapWorkflowOutput
    memory-store.ts                 # (ex 05) in-memory conversation store
    suspended-store.ts              # (ex 06) suspended-run registry
    validation.ts                   # body parsing + rate limit + sanitization
    logger.ts                       # structured stdout/stderr logger
  examples/                         # 11 numbered workflows
    01-support-triage/              # + README.md
    02-research-agent/
    03-code-review-agent/
    04-parallel-research/
    05-multi-turn-chat/
    06-hitl-approval/
    07-streaming-chat/
    08-critic-loop/
    09-multi-agent-handoff/
    10-mastra-memory/
    11-content-pipeline/
  server/
    server.ts                       # static + JSON + SSE endpoints (~670 lines)
  src/                              # React 18 + Vite UI
    main.tsx                        # ReactDOM.createRoot entry
    App.tsx                         # top-level shell
    components/                     # FormField, Graph, OutputPanel, Rail, Topbar,
                                    # TracePane, Workspace
    hooks/useWorkspace.ts           # SSE EventSource consumer
    registry/                       # examples.ts, renderers.tsx, graphs.ts, utils.ts
    styles.css                      # bundled into dist/assets/index-*.css by Vite
  scripts/                          # smoke, eval, ui-smoke, diagnostics
  notes/
    learning-log.md                 # user fills this in
    comparison-to-inboxpilot.md     # the verdict writeup
  docs/audit/                       # code review artifacts (opencode)
  dist/                             # gitignored — Vite build output, served by Node
```

## Adding a new example

The 7 touchpoints (one entry in the React registry drives the new tab):

1. Create `examples/0N-short-name/` with `index.ts` + `README.md`. The example
   must export `async function runOne(input, tracer)` returning
   `{ status, input, output, error, totalMs }`.
2. Use `stepStart` / `stepEnd` / `llmStructured` / `toolCall` from
   `shared/traced-step.ts` to emit trace events. Do NOT call raw
   `tracer.emit` — the helpers exist for grep-ability.
3. Register the example in `server/server.ts` `EXAMPLES` map (the file path
   is what `dynamic import()` reads at request time) and add a case to
   `validateExampleInput()` if its input shape is new.
4. Add an entry in `src/registry/examples.ts` — title, form fields, defaults,
   and the `output.kind` that picks a renderer.
5. If the new example uses an `output.kind` that no existing renderer in
   `src/registry/renderers.tsx` handles, add a renderer branch there.
6. Add an `example:0N` script in `package.json` so the CLI demo (`npm run
example:0N`) and CI work.
7. Keep each example's `index.ts` under 350 lines (CONTRIBUTING) — split
   before growing.

After all seven: `npm run build` regenerates `dist/` and the new tab appears
in the served UI without any manual HTML edit.

See [CONTRIBUTING.md](CONTRIBUTING.md) for code style and commit conventions.

## Troubleshooting

### "OPENAI_API_KEY is not set"

You need to copy `.env.example` to `.env` and fill in your key:

```bash
cp .env.example .env
# Edit .env, set OPENAI_API_KEY=sk-or-... (or sk-...)
```

### "Configuration is not valid JSON" when starting

The `.env` file has a syntax error. Common causes: missing value, unquoted
spaces, comments mid-line. The `.env.example` is the canonical reference.

### SSE stream keeps showing "Reconnecting to workflow stream..."

The Cloudflared quick-tunnel has a default 100s connection timeout for
long-lived HTTP/2 streams. If your workflow takes longer than that, the
client sees a transient disconnect. The fix: re-launch cloudflared, or
don't use a tunnel and run the server on `localhost` directly.

### The HITL gate node doesn't show the orange "suspended" glow

Hard-refresh the page (`Ctrl+Shift+R` / `Cmd+Shift+R`) to pick up the latest
`dist/assets/*` bundle. There was a known bug where the wrong DOM attribute
selector was used; it's been fixed but your browser may have cached the
old version. If you changed React code, re-run `npm run build` first.

### TypeScript errors after `npm install`

Make sure you're on Node 22 (`nvm use`). The project uses TypeScript 6+
features that older Node versions can't transpile.

### Stale UI after editing React code

The Node server serves files from `dist/`, which is only regenerated by
`npm run build`. After editing anything in `src/`, run `npm run build` and
hard-refresh the browser. For live HMR during development, use `npm run dev`
in a separate terminal — Vite serves `src/` directly on :5173 with HMR, but
the Node server (port 8917) still reads from `dist/`.

## Caveats

- **Mocked tools, not real APIs.** The web/arxiv/wiki "tools" return canned
  data. To use real APIs, replace the `*Direct` functions in each tool
  file.
- **trycloudflare.com tunnel URLs rotate** on cloudflared restarts. The
  server works fine locally without a tunnel.
- **Model picker is real but model-specific prompt quality varies.**
  gpt-4o-mini works well with the current prompts; claude-3-5-haiku returns
  non-conforming structured output (the framework catches it cleanly).
  Lesson: structured outputs need prompt engineering per model family.
- **The playground is per-session.** To make it survive reboots, pin the
  server + cloudflared as systemd services.
- **This is a learning project, not a product.** No authentication, no
  persistent storage, no multi-tenant isolation. See [SECURITY.md](SECURITY.md).

## Running in production-ish mode

The server has light production hardening that's worth knowing about if you
plan to point a real tunnel at it:

**What the server enforces automatically:**

- **Refuses to start** if `OPENAI_API_KEY` is missing or is the `.env.example`
  placeholder. The error message guides you to the fix.
- **Structured JSON logging** to stdout (errors/warnings go to stderr). Set
  `LOG_LEVEL=debug` for verbose output. Pipe through `jq` for inspection:
  `npm run serve | jq 'select(.level == "error")'`.
- **Request validation** on all body-bearing endpoints: 64KB body cap, type
  checks per example, length caps on user-facing strings, control-character
  stripping. 400 errors include the field name.
- **Rate limiting**: 30 requests/minute per IP across `/api/run/*`, `/api/stream/*`,
  and `/api/resume/*`. 429 responses include `Retry-After`. Health and static
  endpoints are not rate-limited.
- **Graceful shutdown** on `SIGTERM`/`SIGINT`: stops accepting new connections,
  waits up to 30s for in-flight LLM calls to drain, then exits.

**What you still need to add for "real" production:**

- **HTTPS** — use a reverse proxy (Caddy, nginx) in front of the server, or
  a tunnel that does TLS (Cloudflare Access, ngrok with TLS).
- **Authentication** — there is none. Anyone who can reach the server can run
  workflows and consume your LLM credits. The rate limit helps, not solves.
- **Persistent storage** — suspended runs and conversation history are in-memory
  and lost on restart. Use a real database if you need to survive crashes.
- **Distributed rate limiting** — the current limiter is per-process. Behind
  a load balancer, each replica enforces its own limit. Use Redis or a
  proper API gateway for shared limits.

**To run in production-ish mode:**

```bash
NODE_ENV=production npm run start:prod   # alias for the same serve command
```

`NODE_ENV=production` is reserved for future behavioral changes (e.g.
disabling dev-only console output). Today it has no effect.

## See also

- [CHANGELOG.md](CHANGELOG.md) — what changed in each version
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to add examples
- [SECURITY.md](SECURITY.md) — what this project does and doesn't protect against
- [notes/learning-log.md](notes/learning-log.md) — user-filled observations
- [notes/comparison-to-inboxpilot.md](notes/comparison-to-inboxpilot.md) — the verdict writeup
- [docs/audit/SUMMARY.md](docs/audit/SUMMARY.md) — 1-page code review summary (16 findings, 9 fixed)
- [docs/audit/2026-06-18-code-review.md](docs/audit/2026-06-18-code-review.md) — full 313-line audit report
