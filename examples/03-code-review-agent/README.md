# Example 03 — Code Review Agent

**Mastra primitives exercised:** Workflow with `.branch` based on tool output, deterministic orchestration with an LLM call embedded in one step.

**What it teaches:** the most underrated pattern — _a deterministic pipeline with an LLM embedded in one step_. The agent only writes prose; everything else is code.

**Why it matters for InboxPilot:** This is the pattern that fits InboxPilot's actual shape — a hard sequence of steps (load → retrieve → escalate → LLM → mode-gate) where the LLM is _one_ step, not the whole control flow.

## Run

```bash
npm run example:03
```

## What you'll see

Three files are "reviewed":

1. `auth.ts` — contains a hardcoded secret + jwt calls. Should produce a review comment.
2. `utils.ts` — contains an unwrapped `fetch()` call. Should produce a warning-only review.
3. `clean.ts` — clean. Should be auto-approved without invoking the LLM.

## Key Mastra patterns

- **Deterministic workflow, LLM as a step** — the workflow reads the file, runs the linter, then _branches_:
  - If `issues.length === 0` → `approveStep` (no LLM call)
  - Otherwise → `generateReviewStep` (LLM writes a review comment)
- **The LLM is bounded** — it sees only the issues list + the file content, not "the whole world". This is a tight, auditable pattern: the LLM can't accidentally skip the linter or fabricate issues.
- **Tool invocation from a step** — `readFile.execute!(...)` and `runCheck.execute!(...)` are called directly. The workflow doesn't need an Agent-with-tools to use tools; it can just call them as functions.
- **Same `.branch([...])` pattern as example 01** — predicates are async, framework runs them in order, first match wins.

## What to look for

After running:

1. The `clean.ts` file is approved with `LGTM ✅` — the LLM is _not_ invoked for clean files. This is the cost-saving win: you only pay for LLM tokens on files that actually have issues.
2. The `auth.ts` review should mention the hardcoded secret. If the LLM hallucinates issues that aren't in the list, that's a sign your prompt needs more grounding.
3. The workflow has 4 steps; only 1 of them makes an LLM call. Compare to example 02's workflow which has 2 steps, and example 01's which has 2 steps with 1 LLM call.

## Why this matters for InboxPilot

InboxPilot's `AiAgentService` is _exactly_ this pattern: deterministic steps with one LLM call embedded. The question is whether expressing it as `createWorkflow().then().then().branch([...])` is clearer than the current imperative `if/else` chain. After running this example, look at `InboxPilot/packages/support-core/src/services/ai-agent-service.ts` and form an opinion.
