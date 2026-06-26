# Example 08 - Critic Loop

This example demonstrates the evaluator-optimizer pattern:

1. A generator writes a draft for the requested topic.
2. A critic scores the draft from 0-10 and returns short feedback.
3. If the score is below the threshold, the generator rewrites using that
   feedback.
4. The loop stops when the score clears the threshold or `maxIterations` is
   exhausted.

## Run

```bash
npm run example:08
```

## Inputs

- `topic` - required prompt topic.
- `threshold` - optional quality target, default `7`, allowed range `0`-`10`.
- `maxIterations` - optional budget cap, default `3`, allowed range `1`-`5`.

## What to look for

- The trace shows one `iterate` step with structured entries for each
  generation/critique pass.
- Higher thresholds can cost more without guaranteeing better output.
- The output includes `draft`, `score`, `iterations`, and full `history`.
