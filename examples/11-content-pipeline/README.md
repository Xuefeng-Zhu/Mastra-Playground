# Example 11 - Content Pipeline

This example shows a sequential multi-agent pipeline:

1. A researcher produces structured facts, sources, and an angle.
2. A writer turns the brief into a short article for the target audience.
3. An editor polishes the draft, scores it, and returns suggestions if needed.

Unlike the handoff example, every agent runs in order. The tradeoff is clearer
role separation at roughly three LLM calls of latency.

## Run

```bash
npm run example:11
```

## Inputs

- `topic` - required article topic.
- `audience` - optional target audience, default `technical readers`.

## What to look for

- `research` emits structured `facts`, `sources`, and `angle`.
- `write` receives the research output and returns a prose draft.
- `edit` returns `edited`, `score`, `suggestions`, and `approved`.
