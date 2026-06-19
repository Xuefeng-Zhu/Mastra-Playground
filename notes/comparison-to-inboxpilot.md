# Should InboxPilot use Mastra? — Comparison

_Fill this in after running all three examples. Be specific. Cite line numbers._

## Setup

- Compared: `InboxPilot/packages/support-core/src/services/ai-agent-service.ts` (622 lines, the current AI pipeline) vs `mastra-playground/examples/01-support-triage/index.ts` (~120 lines, the Mastra-shaped equivalent).
- Date: YYYY-MM-DD
- Mastra version tested: 1.43.0

## 3 things Mastra did better

1. ...
2. ...
3. ...

## 3 things the explicit code does better

1. ...
2. ...
3. ...

## The single InboxPilot shape that doesn't fit Mastra cleanly

_(Pick the one feature of `AiAgentService` that is hardest to express in Mastra. e.g. "the pre-LLM escalation chain" or "the per-org confidence threshold from `ai_settings`" or "the durable `record_chunk_refs` job".)_

## Verdict

One sentence. Example: _"Don't adopt. Revisit if/when InboxPilot ships tool use (§8 of the research brief) and the workflow becomes genuinely multi-step."_

## What would change my mind

_(The 1–2 things that, if added to Mastra or removed from InboxPilot's current design, would flip the verdict.)_
