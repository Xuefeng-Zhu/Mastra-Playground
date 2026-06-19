# Mastra Playground

A small, isolated TypeScript repo to learn [Mastra](https://mastra.ai) by example. Not for production. Not part of InboxPilot.

## What this is

Four small examples exercising Agent, Workflow, Tool, parallel execution, structured output, live tracing, persistent history, and per-example settings.

| # | Example | What it teaches |
|---|---|---|
| 01 | [Support Triage](examples/01-support-triage/) | Agent + Workflow with `.branch` + Zod structured output. Direct A/B against InboxPilot's `AiAgentService`. |
| 02 | [Research Agent](examples/02-research-agent/) | Agent with tools + Workflow orchestration. Mocked web/arxiv tools. |
| 03 | [Code Review Agent](examples/03-code-review-agent/) | Workflow with `.branch` based on tool output, deterministic pipeline with one embedded LLM call. |
| 04 | [Parallel Research](examples/04-parallel-research/) | `Promise.all` inside a step's `execute` to fan out work in parallel. The pattern InboxPilot §8 ("tool use") would use. |

## Features

- **Live trace visualization** — every step, LLM call, tool call, and branch evaluation is streamed from the server via Server-Sent Events. The browser shows the workflow DAG lighting up as each step fires, with a scrolling event log.
- **Persistent history** — the last 10 runs per example are saved in `localStorage`. Click any recent-run chip above the form to re-run with the same input. "View all" opens a slide-over panel with timestamps, durations, and a "Replay" button.
- **Markdown export** — "Copy as Markdown" button on every result. Produces a Slack/PR-friendly summary with input, structured output, steps taken, and the human-readable response block.
- **Per-example settings** — model dropdown (gpt-4o-mini / claude-3-5-haiku / llama-3.1-8b / gemini-flash) on every example, confidence threshold slider on Ex 01. Persisted to `localStorage`. The server actually swaps the model per request, so the LLM behavior changes visibly in the trace timing.

## Setup

```bash
cd mastra-playground
npm install
cp .env.example .env
# Add your OPENAI_API_KEY (or OpenRouter key) to .env
```

For OpenRouter (recommended — one key for many models):
```
OPENAI_API_KEY=sk-or-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=openai/gpt-4o-mini
```

## Run the examples

### Option A — CLI (one-shot)

```bash
npm run example:01   # support triage
npm run example:02   # research agent
npm run example:03   # code review
npm run example:04   # parallel research
```

Each example prints to the console and exits. No persistence, no server, no side effects.

### Option B — Web UI (interactive)

```bash
npm run serve        # starts http://localhost:8917 (override with PORT=...)
```

Open `http://localhost:8917` in a browser. Four tabs, one per example. Each has:

```
┌─────────────┬─────────────────────────┬─────────────────────────┐
│  Form       │  Workflow graph (SVG)   │  Structured output       │
│  ⚙ Settings │                         │  [Copy as Markdown]      │
│  [Run]      │  [animated DAG]          │  [color cards]           │
│             │                         │  [raw JSON]              │
│  Recent:    │  [event log]             │                         │
│  [chip][chip]│                         │                         │
└─────────────┴─────────────────────────┴─────────────────────────┘
```

The dev server uses port 8917 by default to avoid collisions with common dev ports. Set `PORT=...` in `.env` to override.

## Verify TypeScript

```bash
npm run typecheck    # tsc --noEmit
```

## How the trace works

1. Each example's `runOne(input, tracer)` is called with a `Tracer` that emits structured events.
2. Steps emit `step:start` / `step:end`. LLMs emit `llm:structured` with the schema + data. Tools emit `tool:call` with input + output. Branches emit `branch:evaluate` with matched/no-match.
3. The server's `GET /api/stream/:example?input=...` endpoint subscribes to the tracer and forwards events as Server-Sent Events.
4. The browser's `EventSource` consumes the stream and animates the SVG graph + appends to the event log.

## Repo layout

```
mastra-playground/
  package.json
  tsconfig.json
  .env.example
  README.md
  shared/
    llm.ts                  # getModel(id) factory for per-request model swap
    observability.ts        # shared logger
    tracer.ts               # Tracer class + TraceEvent types
    traced-step.ts          # stepStart/stepEnd/llmStructured/toolCall/branchEvaluate helpers
    workflow-helpers.ts     # unwrapWorkflowOutput (strips the branch wrapper from results)
  examples/
    01-support-triage/      # ~180 lines (incl. runOne + per-request model)
    02-research-agent/
    03-code-review-agent/
    04-parallel-research/   # NEW: Promise.all fan-out + synthesize
  server/
    server.ts               # static + JSON + SSE endpoints, example registry
  public/
    index.html              # 4-tab UI with settings + history
    style.css               # dark theme + recent-runs chips + history slide-over
    app.js                  # tabs, SSE consumer, graph animation, history, settings, copy-as-MD
  notes/
    learning-log.md
    comparison-to-inboxpilot.md
```

## Versions installed

- `mastra@1.14.0` (CLI)
- `@mastra/core@1.43.0` (Agent, Workflow, Tool, Mastra, logger, tracer)
- `@ai-sdk/openai@3.x` (model adapter — works with OpenRouter via `OPENAI_BASE_URL`)
- `zod@4.4.3`
- `typescript`, `tsx`, `@types/node` (dev)

## Caveats

- **Mocked tools, not real APIs.** The web/arxiv/wiki "tools" return canned data. To use real APIs, replace the `*Direct` functions in each tool file.
- **`trycloudflare.com` tunnel URLs rotate** on cloudflared restarts. The dev server works fine locally without a tunnel.
- **Model picker is real but model-specific prompt quality varies.** gpt-4o-mini works well with the current prompts; claude-3-5-haiku returns non-conforming structured output (the framework catches it cleanly). Lesson: structured outputs need prompt engineering per model family.
- **The playground is per-session.** To make it survive reboots, pin the server + cloudflared as systemd services (see `~/.hermes/skills/devops/local-tunnel`).
