# Example 07 - Streaming Chat

This example shows how to consume `Agent.stream()` token-by-token and forward
chunks through the playground trace stream.

The workflow has one LLM step. It emits `llm:start`, one `llm:delta` event per
text chunk, and `llm:end` before returning the final text and captured deltas.

## Run

```bash
npm run example:07
```

## What to look for

- The browser output fills in as chunks arrive instead of waiting for the full
  response.
- The raw output includes `deltas`, `finalText`, and `durationMs`.
- Localhost streams incrementally; quick tunnels or proxies may still buffer
  long responses.
