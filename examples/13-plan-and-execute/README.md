# Example 13 — Plan-and-Execute Agent

This example shows the planner/executor pattern:

1. A planner agent turns a user task into a short structured plan.
2. An executor agent completes each step sequentially, seeing prior results.
3. A summarizer agent turns the execution log into a final answer.

The workflow is intentionally sequential. It is not a replan/retry loop; the
goal is to make decomposition and step-by-step execution easy to inspect in the
trace.

## Run

```bash
npm run example:13
```

## What to look for

- `plan` emits a structured plan with up to 3 visible steps (schema hard max: 5).
- `execute` calls the executor agent once per plan step and preserves order.
- `summarize` produces the final user-facing answer and caveats.
