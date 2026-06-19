# Example 02 — Research Agent

**Mastra primitives exercised:** Agent with tools, Workflow (sequential `.then`), mocked `createTool` with Zod input/output.

**What it teaches:** how the LLM picks which tools to call (agent-driven) vs how you pick (workflow-driven), and how to mix them.

**Why it matters for InboxPilot:** InboxPilot's research brief §8 ("Tool use — the missing superpower") is exactly this pattern. Looking up an order or a customer's plan before answering is a tool call. This example shows what the LLM side of that pattern would look like.

## Run

```bash
npm run example:02
```

## What you'll see

Two research topics are processed:

1. `"Contextual Retrieval for RAG"` — the agent uses both `webSearch` and `arxivSearch` tools, then synthesizes.
2. `"hybrid search with BM25 and vector reranking"` — same pattern.

The console shows the agent's text output, including the tool calls it made.

## Key Mastra patterns

- **`tools: { webSearch, arxivSearch }` on `new Agent({...})`** — register tools by key. The LLM sees the tool names + descriptions and decides when to call them.
- **`createTool({ id, description, inputSchema, outputSchema, execute })`** — every tool is just a Zod-validated async function. No special framework.
- **Sequential `.then(stepA).then(stepB)`** — deterministic order; data flows from one step's output to the next's input. The LLM is invoked *inside* a step (as `agent.generate(...)`), not as a graph node.
- **Workflow as a "durable wrapper"** — `createRunAsync().start({ inputData })` returns a typed `Run` object you can `await`, query, and inspect. The `status` field tells you whether the run succeeded, failed, or is suspended.

## Agent vs Workflow: when to use which

- **Agent** when the *order* of operations depends on what the LLM discovers. (e.g. "research this topic however you want, using whatever tools help".)
- **Workflow** when you know the order. (e.g. "always: read file → lint → if issues, write review".)
- **Mix** when one part is fixed and another is dynamic. (e.g. "always run the lint, then let the agent decide how to format the review".)

This example uses both: a workflow that always runs `agent.generate` (deterministic sequence) inside an agent that dynamically picks tools (flexible execution).

## What to look for

After running:
1. The `webSearch` and `arxivSearch` mock tools return canned data. Replace them with real API calls and see what changes.
2. The agent's output is `String(result.text).slice(0, 500)` — we strip it because the agent's text is unstructured. To force a structured response, use the `output: SomeSchema` pattern from example 01.
3. No memory — every run starts fresh. To add memory, pass `memory: new Memory({...})` to the agent and a `threadId`/`resourceId` to the call. (Skipped here to keep the example focused.)
