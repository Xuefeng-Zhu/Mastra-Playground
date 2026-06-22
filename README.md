# Mastra Playground

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node 22](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)](.nvmrc)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![Mastra 1.43](https://img.shields.io/badge/Mastra-1.43-FF6B6B)](https://mastra.ai)

A small, isolated TypeScript repo for learning [Mastra](https://mastra.ai) by
example. Eleven real workflows exercising the framework's primitives, with a
React + Next.js browser UI that visualizes the execution trace in real time.

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
npm run build            # builds the Next.js app
npm run start            # http://localhost:8917
```

Open <http://localhost:8917> in a browser. The UI shows 11 examples in a
left rail (grouped by Mastra primitive — agent / workflow / tool / memory /
HITL / stream), with the active example's workspace (form, trace, output)
in the main pane.

> **Local-only dev loop:** `npm run dev` starts the Next.js dev server on
> `:8917` with fast refresh. Changes to React code in `src/` and API routes
> in `app/api/` are reflected immediately.

## Why this exists

A learning playground for the user to evaluate whether to adopt Mastra into
their real product (InboxPilot). Each example is small enough to read in
under 5 minutes, exercises a specific Mastra primitive, and contrasts
explicitly with the InboxPilot equivalent in each example's README.

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

| Method | Path                   | Purpose                                            | Rate limit    |
| ------ | ---------------------- | -------------------------------------------------- | ------------- |
| GET    | `/`, `/_next/static/*` | UI shell + Next.js bundled JS/CSS                  | none          |
| GET    | `/api/health`          | Liveness probe (`{ ok, uptimeSec, exampleCount }`) | none          |
| GET    | `/api/examples`        | List available examples                            | none          |
| POST   | `/api/run/:example`    | One-shot JSON result                               | 30 req/min/IP |
| POST   | `/api/stream/:example` | SSE trace stream; JSON input stays in request body | 30 req/min/IP |
| POST   | `/api/resume/:token`   | Resume a suspended workflow                        | 30 req/min/IP |

Regular API requests return JSON; successful stream requests return
`text/event-stream`. Errors carry `{ error, field?, detail? }` with appropriate
4xx/5xx status codes. 429 responses include a `Retry-After` header.

### Health check

```bash
curl -s http://localhost:8917/api/health
# {"ok":true,"uptimeSec":12,"nodeEnv":"development","exampleCount":11,"ts":"2026-06-19T..."}
```

### Smoke test

The `npm run smoke` script runs an end-to-end check (health, examples, a
deterministic no-LLM workflow branch, unknown example, bad JSON) against a
running server. CI boots the production build and runs this same suite.

## Web UI features

- **Live trace visualization** — every step, LLM call, tool call, and branch
  evaluation is streamed from the server via Server-Sent Events. The browser
  shows the workflow DAG lighting up as each step fires, with a scrolling
  event log.
- **Markdown export** — "Copy as Markdown" button on every result. Produces
  a Slack/PR-friendly summary with structured output, timing, and captured
  sources.
- **Model preference** — the model dropdown is persisted in `localStorage`.
  The server swaps the model per request, so LLM behavior changes visibly.
- **Multi-turn chat UI** — Ex 05 renders the conversation as chat bubbles with
  the agent's tool calls visible inline.
- **HITL approval panel** — Ex 06 shows an orange pulsing "PENDING APPROVAL"
  card with the action + LLM reasoning + Approve/Reject buttons when the
  workflow suspends.

## Architecture

```
┌─────────────────┐    SSE /api/stream/:example    ┌─────────────────┐
│   Browser       │ ◄──────────────────────────── │  Next.js server │
│  (React client  │                                │  (app/api/)     │
│   components)   │    POST /api/run/:example     │                 │
│  11 tabs        │ ────────────────────────────► │  loads example  │
│  1 graph each   │                                │  via static     │
│  trace events   │    POST /api/resume/:token    │  import map     │
│  result tabs    │ ◄──────────────────────────── │                 │
└────────┬────────┘                                └────────┬────────┘
         │                                                 │
         │ localStorage                                    │ Mastra
         │ (model preference)                              │ runtime
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

The React UI lives in `src/` and is served by Next.js (App Router).
The `app/` directory contains the layout, page, and API route handlers.
There is no separate hand-written JS bundle to ship.

## Environment variables

All variables are read at server startup. None are required for `npm run
typecheck` or `npm run format:check` (CI runs those without secrets).

| Variable          | Default                        | Required? | Purpose                                                                                                             |
| ----------------- | ------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`  | _(none)_                       | For runs  | API key for the LLM. Static UI and health routes load without it; LLM-backed examples reject runs until configured. |
| `OPENAI_BASE_URL` | `https://openrouter.ai/api/v1` | No        | OpenRouter's OpenAI-compatible endpoint.                                                                            |
| `OPENAI_MODEL`    | `openai/gpt-oss-20b:free`      | No        | Default GPT-OSS 20B free model. Can be overridden per request via the UI picker.                                    |
| `PORT`            | `8917`                         | No        | Server port.                                                                                                        |
| `NODE_ENV`        | _(unset)_                      | No        | Set automatically by Next.js for development and production commands.                                               |

For OpenRouter (recommended — one key for many models):

```bash
OPENAI_API_KEY=sk-or-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=openai/gpt-oss-20b:free
```

## Project layout

```
mastra-playground/
  package.json, tsconfig.json, next.config.ts, .env.example
  README.md, CHANGELOG.md, CONTRIBUTING.md, SECURITY.md, LICENSE
  .editorconfig, .nvmrc, .prettierrc
  .github/workflows/ci.yml           # typecheck + format check + test + build
  app/                              # Next.js App Router
    layout.tsx                      # root layout (fonts, metadata, styles)
    page.tsx                        # single-page client shell (loads src/App)
    api/                            # API route handlers
      health/route.ts               # GET /api/health
      examples/route.ts             # GET /api/examples
      run/[example]/route.ts        # POST /api/run/:example
      stream/[example]/route.ts     # POST /api/stream/:example (SSE response)
      resume/[token]/route.ts       # POST /api/resume/:token
  shared/                           # cross-example helpers (<135 lines each)
    examples-registry.ts            # example metadata + static import map
    example-inputs.ts               # Zod schemas + validation per example
    llm.ts                          # getModel(id) factory
    mastra-logger.ts                # shared Mastra logger (ConsoleLogger)
    tracer.ts                       # Tracer class + TraceEvent types
    traced-step.ts                  # stepStart/stepEnd/llmStructured/toolCall helpers
    workflow-helpers.ts             # unwrapWorkflowOutput
    memory-store.ts                 # (ex 05) in-memory conversation store
    suspended-store.ts              # (ex 06) suspended-run registry
    validation.ts                   # rate limit + sanitization + error classes
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
  src/                              # React 18 client components
    App.tsx                         # top-level shell
    global.d.ts                     # ambient type declarations
    styles.css                      # bundled by Next.js
    components/                     # FormField, Graph, OutputPanel, Rail, Topbar,
                                    # TracePane, Workspace, CommandPalette
    hooks/useWorkspace.ts           # SSE EventSource consumer
    registry/                       # examples.ts, renderers.tsx, graphs.ts, utils.ts
  scripts/                          # smoke, eval, ui-smoke, diagnostics
  .next/                            # gitignored — Next.js build output
```

## Adding a new example

The 9 touchpoints (one entry in the React registry drives the new tab):

1. Create `examples/0N-short-name/` with `index.ts` + `README.md`. The example
   must export `async function runOne(input, tracer)` returning
   `{ status, input, output, error, totalMs }`.
2. Use `stepStart` / `stepEnd` / `llmStructured` / `toolCall` from
   `shared/traced-step.ts` to emit trace events, and `startRun` to emit
   the initial `start` event. Do NOT call raw `tracer.emit` — the helpers
   exist for grep-ability.
3. At the bottom of `runOne()`, call `finalizeRunResult(result, tracer, t0, input)`
   from `shared/run-result.ts` to emit the terminal `done` event and shape
   the return value. (Ex 06's suspend path uses the same function with a `runId`.)
4. Use `resolveModel(input.model)` from `shared/llm.ts` to pick the LLM.
5. Use `runCliExample(name, demo)` + `isMain(import.meta.url, process.argv[1])`
   from `shared/cli-bootstrap.ts` for the CLI demo block.
6. Register the example in `shared/examples-registry.ts`: add it to the
   `EXAMPLES` map and to the `EXAMPLE_LOADERS` static import map.
7. Add validation in `shared/example-inputs.ts` (the `EXAMPLE_INPUT_SCHEMAS` map).
8. Add an entry in `src/registry/examples.ts` — title, form fields, defaults,
   and the `output.kind` that picks a renderer. If the new example uses an
   `output.kind` that no existing renderer in `src/registry/renderers.tsx`
   handles, add a renderer branch there.
9. Add an `example:0N` script in `package.json` so the CLI demo (`npm run
example:0N`) works.

After all steps: `npm run build` confirms the app compiles. `npm run dev`
picks up the new example immediately via fast refresh.

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

### The workflow stream disconnects before completion

Long-lived streams can be interrupted by a tunnel or proxy timeout. Retry the
run, re-launch cloudflared, or run the server on `localhost` directly. Starting
a replacement run intentionally aborts the previous workflow.

### The HITL gate node doesn't show the orange "suspended" glow

Hard-refresh the page (`Ctrl+Shift+R` / `Cmd+Shift+R`) to pick up the latest
bundle. There was a known bug where the wrong DOM attribute
selector was used; it's been fixed but your browser may have cached the
old version. If you changed React code and are running `npm run start`,
re-run `npm run build` first.

### TypeScript errors after `npm install`

Make sure you're on Node 22 (`nvm use`). The project uses TypeScript 6+
features that older Node versions can't transpile.

### Stale UI after editing React code

In development, `npm run dev` uses Next.js Fast Refresh — changes to React
components in `src/` are reflected immediately in the browser without a full
page reload. If you're running the production build (`npm run start`), you
need to rebuild first with `npm run build`.

## Caveats

- **Mocked tools, not real APIs.** The web/arxiv/wiki "tools" return canned
  data. To use real APIs, replace the `*Direct` functions in each tool
  file.
- **trycloudflare.com tunnel URLs rotate** on cloudflared restarts. The
  server works fine locally without a tunnel.
- **Model picker is real but free-model availability and prompt quality vary.**
  GPT-OSS 20B Free is the default; `openrouter/free` remains available as a
  router option. Free models may be rate-limited or temporarily unavailable.
- **The playground is per-session.** To make it survive reboots, pin the
  server + cloudflared as systemd services.
- **This is a learning project, not a product.** No authentication, no
  persistent storage, no multi-tenant isolation. See [SECURITY.md](SECURITY.md).

## Running in production-ish mode

The server has light production hardening that's worth knowing about if you
plan to point a real tunnel at it:

**What the server enforces automatically:**

- **Rejects LLM runs** if `OPENAI_API_KEY` is missing. The UI and health route
  can still load so configuration problems remain diagnosable.
- **Structured helper logging** for validation/tracing internals. Next.js also
  writes its normal request log in development.
- **Request validation** on all body-bearing endpoints: 64KB body cap, type
  checks per example, length caps on user-facing strings, control-character
  stripping. 400 errors include the field name.
- **Rate limiting**: 30 requests/minute per IP across `/api/run/*`, `/api/stream/*`,
  and `/api/resume/*`. 429 responses include `Retry-After`. Health and static
  endpoints are not rate-limited.
- **Cancellation propagation**: replacing or leaving a streamed run aborts the
  HTTP request, workflow, and active model call.

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

**To run in production mode:**

```bash
npm run build            # builds the Next.js app
npm run start            # starts the production server on :8917
```

## See also

- [CHANGELOG.md](CHANGELOG.md) — what changed in each version
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to add examples
- [SECURITY.md](SECURITY.md) — what this project does and doesn't protect against
