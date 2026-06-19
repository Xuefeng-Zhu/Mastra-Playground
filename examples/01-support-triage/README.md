# Example 01 — Support Triage

**Mastra primitives exercised:** Agent, Workflow (with `.branch`), Zod-validated structured output, `Mastra` instance.

**What it teaches:** how an InboxPilot-shaped decision pipeline maps to Mastra's primitives — and where the mapping is _awkward_.

**Why it matters for InboxPilot:** This is the direct A/B test. Compare `examples/01-support-triage/index.ts` (this file) to `InboxPilot/packages/support-core/src/services/ai-agent-service.ts` (622 lines) and decide whether Mastra is a better abstraction for that specific problem.

## Run

```bash
npm run example:01
```

## What you'll see

Five customer messages are processed:

1. `"How do I reset my password?"` → classified as `how_to` → bot replies.
2. `"I was charged twice this month, please refund me."` → `billing` → bot replies.
3. `"Your product is broken and I want a manager to call me."` → `complaint` → `requires_human: true` → escalated.
4. `"My account is locked and I cannot log in for my work meeting in 30 minutes."` → `account` + high urgency → escalated.
5. `"Do you have a product that does X?"` → `other` → escalated with clarifying question.

Each line shows: the LLM's structured output, which branch the workflow took, and what action was emitted.

## Key Mastra patterns

- **`output: TriageSchema`** on `agent.generate()` — replaces InboxPilot's `parseAiDecision` Zod-validator step. The framework enforces structured output via tool-calling, not post-hoc parsing.
- **`createWorkflow().then(step).branch([[predicate, step], ...])`** — replaces InboxPilot's `if/else` chain after mode-gating. The predicates are async functions; the framework runs them in order.
- **`mastra.getWorkflow('id').createRunAsync()`** — every workflow run is an explicit, awaitable object. Good for streaming, bad for "fire and forget" patterns.
- **`new Mastra({ agents, workflows, logger })`** — agents/workflows must be registered to be invocable. There's no implicit discovery.

## What this example does NOT show

- Pre-LLM escalation rules (InboxPilot's hard guard). Mastra's `branch` runs _after_ the LLM; InboxPilot's escalation runs _before_. If you need hard pre-LLM guards, you have to put them in a step that _precedes_ the LLM call. (The v2 escalation spec is exactly that pattern.)
- Conversation history. Mastra Agent supports memory; this example omits it.
- Streaming. `agent.generate` returns a full result; use `agent.stream` for tokens-as-they-arrive.

## What to look for

After running, ask yourself:

1. Would the explicit code in `AiAgentService` be more or less clear than this 120-line version?
2. Could the pre-LLM escalation chain be expressed as cleanly as the post-LLM `branch`?
3. Is the JSON output (`TriageSchema`) more or less type-safe than InboxPilot's `AI_Decision` Zod schema?
