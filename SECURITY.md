# Security

This is a **learning playground**, not a production service. It runs locally
and is not hardened against adversarial use.

## What the project does

- Accepts HTTP requests on `localhost:8917` (or via a Cloudflared quick-tunnel)
- Runs Mastra workflows that call Gemini or OpenRouter using either the selected provider's
  server-side API key or an optional browser-supplied per-request key
- Supports a **Custom provider** where the browser supplies its own base URL, model ID, and API key per request
- Stores model-picker preference (including optional provider credentials) in `localStorage` (browser side)
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
- LLM-backed Gemini/OpenRouter runs fall back to server-side env keys when the
  browser key is blank, and fail if neither key is available
- User input is sanitized (control characters stripped, length capped at 4KB)
- 30 req/min/IP rate limit across `/api/run/*`, `/api/stream/*`,
  `/api/resume/*`, and `/api/custom-workflow/stream` (429 includes
  `Retry-After`)
- 64KB body cap on all body-bearing endpoints
- Streamed prompts are sent in POST bodies, not query strings
- Client disconnects propagate cancellation to workflows and model calls
- Next.js production output does not publish browser source maps by default
- Browser-supplied provider credentials are sent in POST bodies only, never included in
  URLs, trace events, returned results, or server logs
- Custom base URLs are validated as absolute http/https with no embedded
  credentials (userinfo in the URL)

## Browser-supplied credential risks

Gemini, OpenRouter, and Custom provider settings can include API keys typed
into the browser:

- **Credential storage** — API keys and custom model IDs are persisted in
  `localStorage`. Any script running in the same origin can read them. Use the
  "Clear provider" button when you no longer need them.
- **Server fallback** — Gemini and OpenRouter use the server `.env` key when
  the browser key field is blank. The Custom provider has no fallback; it must
  include its own key.

## Custom provider risks

The Custom provider lets users configure any OpenAI-compatible endpoint from
the browser. Be aware of the following:

- **Cleartext transport** — if the base URL uses `http:` (not `https:`), the
  API key and all prompts travel in the clear. The UI warns about this.
- **Credential storage** — the API key, base URL, and model ID use the same
  browser-side `localStorage` persistence described above.
- **SSRF exposure** — the server makes outbound HTTP requests to whatever URL
  the user supplies (including `localhost` or private-network addresses). This
  is acceptable for a local learning playground; it would NOT be acceptable
  in production without an allowlist or proxy.
- **No server-side fallback** — if the custom provider is selected but the API
  key is missing or empty, the request fails immediately. The server never
  silently substitutes its own credentials.

## When you should NOT use this

- For any production workload
- With real user data
- On a public network without additional hardening
- As a reference for security best practices — it isn't one
