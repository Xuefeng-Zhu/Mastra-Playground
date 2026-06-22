# Security

This is a **learning playground**, not a production service. It runs locally
and is not hardened against adversarial use.

## What the project does

- Accepts HTTP requests on `localhost:8917` (or via a Cloudflared quick-tunnel)
- Runs Mastra workflows that call Gemini or OpenRouter using the selected provider's server-side API key
- Stores model-picker preference in `localStorage` (browser side)
- Stores in-memory conversation history and suspended runs (server side, lost on restart)

## What the project does NOT do

- No authentication or authorization
- No audit log
- No persistent storage
- No multi-tenant isolation

## Reporting a vulnerability

**Do not open a public GitHub issue for security problems.** Use the
repository's private GitHub vulnerability-reporting flow with a description
and reproduction steps.

## Best-effort hardening

- All tool calls are mocked (no real APIs are called)
- The `.env` file (containing your API key) is gitignored
- LLM-backed runs fail when the selected provider's API key is missing
- User input is sanitized (control characters stripped, length capped at 4KB)
- 30 req/min/IP rate limit across `/api/run/*`, `/api/stream/*`,
  `/api/resume/*` (429 includes `Retry-After`)
- 64KB body cap on all body-bearing endpoints
- Streamed prompts are sent in POST bodies, not query strings
- Client disconnects propagate cancellation to workflows and model calls
- Next.js production output does not publish browser source maps by default

## When you should NOT use this

- For any production workload
- With real user data
- On a public network without additional hardening
- As a reference for security best practices — it isn't one
