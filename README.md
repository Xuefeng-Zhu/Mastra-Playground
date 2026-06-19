# Mastra Playground

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node 22](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)](.nvmrc)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![Mastra 1.43](https://img.shields.io/badge/Mastra-1.43-FF6B6B)](https://mastra.ai)

A small, isolated TypeScript repo for learning [Mastra](https://mastra.ai) by
example. Six real workflows exercising the framework's primitives, with a
browser UI that visualizes the execution trace in real time.

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
npm run serve            # http://localhost:8917
```

Open <http://localhost:8917> in a browser. Six tabs, one per example.

## Why this exists

A learning playground for the user to evaluate whether to adopt Mastra into
their real product (InboxPilot). Each example is small enough to read in
under 5 minutes, exercises a specific Mastra primitive, and contrasts
explicitly with the InboxPilot equivalent. See
[`notes/comparison-to-inboxpilot.md`](notes/comparison-to-inboxpilot.md) for
the full writeup.

## Examples

| #   | Example                                                  | Mastra primitives                                 | What it teaches                                                           |
| --- | -------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| 01  | [Support Triage](examples/01-support-triage/)            | Agent, Workflow, structured output, `.branch()`   | The shape of an InboxPilot `AiAgentService` call.                         |
| 02  | [Research Agent](examples/02-research-agent/)            | Agent with tools, sequential workflow             | Tool-using agents with mocked APIs.                                       |
| 03  | [Code Review Agent](examples/03-code-review-agent/)      | Workflow with deterministic gate, conditional LLM | When to call the LLM based on tool output, not the other way around.      |
| 04  | [Parallel Research](examples/04-parallel-research/)      | `Promise.all` fan-out inside a step               | The pattern InboxPilot §8 ("tool use") would use.                         |
| 05  | [Multi-turn Chat](examples/05-multi-turn-chat/)          | Explicit conversation history in the prompt       | The pattern Mastra's `Memory` class abstracts over.                       |
| 06  | [Human-in-the-Loop Approval](examples/06-hitl-approval/) | `suspend()` / `run.resume()`                      | The exact mechanism for InboxPilot §13's "named human-in-the-loop owner". |

Each example is <350 lines including the CLI demo. The shared modules in
`shared/` are <300 lines total.

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
│   (public/)     │                                │  (server/)      │
│                 │    POST /api/run/:example     │                 │
│  6 tabs         │ ────────────────────────────► │  loads example  │
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
  package.json, tsconfig.json, .env.example
  README.md, CHANGELOG.md, CONTRIBUTING.md, SECURITY.md, LICENSE
  .editorconfig, .nvmrc, .prettierrc
  .github/workflows/ci.yml           # typecheck + format check + smoke
  shared/
    llm.ts                          # getModel(id) factory
    observability.ts                # shared logger
    tracer.ts                       # Tracer class + TraceEvent types
    traced-step.ts                  # stepStart/stepEnd/llmStructured/toolCall helpers
    workflow-helpers.ts             # unwrapWorkflowOutput
    memory-store.ts                 # (ex 05) in-memory conversation store
    suspended-store.ts              # (ex 06) suspended-run registry
  examples/
    01-support-triage/              # + README.md
    02-research-agent/
    03-code-review-agent/
    04-parallel-research/
    05-multi-turn-chat/
    06-hitl-approval/
  server/
    server.ts                       # static + JSON + SSE endpoints
  public/
    index.html, style.css, app.js   # the web UI
  scripts/
    smoke.ts                        # end-to-end smoke test
  notes/
    learning-log.md                 # user fills this in
    comparison-to-inboxpilot.md     # the verdict writeup
  .audit-findings.md                # opencode code review
```

## Adding a new example

1. Create `examples/0N-short-name/` with `index.ts` + `README.md`
2. The example must export `async function runOne(input, tracer)` returning
   `{ status, input, output, error, totalMs }`
3. Use `stepStart` / `stepEnd` / `llmStructured` / `toolCall` from
   `shared/traced-step.ts` to emit trace events
4. Register the example in `server/server.ts` `EXAMPLES` map
5. Add a tab in `public/index.html` and a `GRAPHS` entry in `public/app.js`
6. Add an `example:0N` script in `package.json`
7. Add a `node_modules` of `<300` lines per example (or split)

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
`public/app.js`. There was a known bug where the wrong DOM attribute
selector was used; it's been fixed but your browser may have cached the
old version.

### TypeScript errors after `npm install`

Make sure you're on Node 22 (`nvm use`). The project uses TypeScript 6+
features that older Node versions can't transpile.

### Pre-existing dirty files in `public/app.js` from a previous session

A common gotcha when iterating: `write_file` and `patch` can leave stale
content if the file was modified by both the user and a previous turn. A
hard refresh in the browser picks up the new version from disk.

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
  rate limiting (rate limits are in the unreleased CHANGELOG), no audit
  log. See [SECURITY.md](SECURITY.md).

## See also

- [CHANGELOG.md](CHANGELOG.md) — what changed in each version
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to add examples
- [SECURITY.md](SECURITY.md) — what this project does and doesn't protect against
- [notes/learning-log.md](notes/learning-log.md) — user-filled observations
- [notes/comparison-to-inboxpilot.md](notes/comparison-to-inboxpilot.md) — the verdict writeup
- [.audit-findings.md](.audit-findings.md) — opencode code review (16 findings, 9 fixed)
