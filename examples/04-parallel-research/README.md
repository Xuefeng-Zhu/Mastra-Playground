# Example 04 — Parallel Research

**Mastra primitives exercised:** Workflow with sequential steps, **`Promise.all` inside a step's `execute`** to fan out work in parallel.

**What it teaches:** how a single workflow step can hide parallel sub-tasks. The workflow sees one step with one `step:start` / `step:end` event, but the trace UI shows the 3 internal `tool:call` events firing in quick succession.

**Why it matters for InboxPilot:** InboxPilot's research brief §8 ("Tool use — the missing superpower") is the exact pattern. When the AI needs to look up an order AND a customer's plan AND the KB entry before answering, the right code is `Promise.all([lookupOrder(...), lookupPlan(...), lookupKB(...)])` inside a single step. This example shows the trace of what that looks like.

## Run

```bash
npm run example:04
```

## Shape

```
input: topic
  ↓
plan         (LLM: decompose topic into 3 sub-questions)
  ↓
fanout       (3 parallel: web + arxiv + wiki)
  ↓
synthesize   (LLM: combine the 3 sources into one summary)
  ↓
output: { topic, synthesis }
```

## What you'll see in the trace

```
step:start  plan           ← LLM call: 1.2s
  llm:structured  PlanSchema {questions: [web-q, arxiv-q, wiki-q]}
step:end    plan

step:start  fanout         ← parallel work begins
  tool:call  web-search     ← 240ms
  tool:call  arxiv-search   ← 280ms
  tool:call  wiki           ← 180ms
step:end    fanout         ← total: 290ms (parallel)

step:start  synthesize     ← LLM call: 1.4s
  llm:structured  SynthesisResult {synthesis: "..."}
step:end    synthesize

done                          total: ~3.0s
```

Notice that the 3 tool calls fire *concurrently* — the trace shows them in arrival order (whichever finishes first), not in source order. The total wall time for the `fanout` step is roughly the slowest single call, not the sum.

## Compare to Example 02

| | Example 02 (Research) | Example 04 (Parallel Research) |
|---|---|---|
| Parallelism | None (sequential) | Fan-out via `Promise.all` |
| Workflow shape | 2 steps: `run-agent` → `format` | 3 steps: `plan` → `fanout` → `synthesize` |
| LLM drives tool calls? | Yes (agent picks tools) | No (step does) |
| When to use | When the LLM needs to decide which tool is right | When you know exactly which tools to call and the calls are independent |

Both patterns are valid. Example 02 is the "let the LLM figure it out" pattern; Example 04 is the "I know the steps, just execute them in parallel" pattern. InboxPilot's §8 would use both — agent-driven for ambiguous lookups, parallel step for known data assembly.

## What to look for

1. The `fanout` step's wall time is **< the sum of the 3 tool latencies**. With 100-300ms mock latencies per tool, you'd expect the sum to be ~600ms but the step completes in ~300ms.
2. The `synthesize` step is the longest LLM call (it has the most input) — typically 1-2s.
3. If you swap the mock tools for real ones (Tavily, Arxiv API, internal wiki), the *shape* of the trace doesn't change — only the latencies.
