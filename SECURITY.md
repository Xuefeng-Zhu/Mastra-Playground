# Security

This is a **learning playground**, not a production service. It runs locally
and is not hardened against adversarial use.

## What the project does

- Accepts HTTP requests on `localhost:8917` (or via a Cloudflared quick-tunnel)
- Runs Mastra workflows that call LLM APIs using your `OPENAI_API_KEY`
- Stores model-picker preference in `localStorage` (browser side)
- Stores in-memory conversation history and suspended runs (server side, lost on restart)

## What the project does NOT do

- No authentication or authorization
- No rate limiting (yet — see [unreleased CHANGELOG entry](CHANGELOG.md))
- No input validation beyond what the framework enforces
- No audit log
- No persistent storage
- No multi-tenant isolation

## Reporting a vulnerability

**Do not open a public GitHub issue for security problems.** Email
`security@example.com` with a description and steps to reproduce. Allow
up to 7 days for an initial response.

## Best-effort hardening

- All tool calls are mocked (no real APIs are called)
- The `.env` file (containing your API key) is gitignored
- The server refuses to start if `OPENAI_API_KEY` is missing or is the
  `.env.example` placeholder
- User input is sanitized (control characters stripped, length capped at 4KB)
- 30 req/min/IP rate limit across `/api/run/*`, `/api/stream/*`,
  `/api/resume/*` (429 includes `Retry-After`)
- 64KB body cap on all body-bearing endpoints
- The `/assets/` static handler validates path traversal via `path.join`
  prefix check AND `realpathSync` symlink resolution
- Vite `sourcemap: false` — no `.map` files ship to the public (would
  disclose the full React source)

## When you should NOT use this

- For any production workload
- With real user data
- On a public network without additional hardening
- As a reference for security best practices — it isn't one
