# server/ — the only entry point

A single ~640-line file: `server.ts`. Bare Node `http` server (no Express/Fastify). Serves static UI from `dist/` (Vite build output), JSON API, and SSE traces. Also enforces the project's "best-effort hardening" (rate limit, validation, secrets check, graceful shutdown).

## WHERE TO LOOK

| Task | Where in `server.ts` | Notes |
|------|----------------------|-------|
| Add a new endpoint | Section 5 (`createServer` callback) | Match the pattern: parse → checkRateLimit → readJsonBody/validateExampleInput → loadRunFn → respond |
| Add a new example to the registry | Section 2 (`EXAMPLES` map) | `{ file, exportName, description }`; `file` is `examples/0N-name/index.ts` |
| Change per-example input shape | Section 3 (`validateExampleInput()`) | Switch case per `name`; `sanitizeText()` every user string |
| Tweak the rate limit | `shared/validation.ts` `checkRateLimit` | 30 req/min/IP, 5 burst, token bucket; the server calls it per-IP per-route |
| Change the boot-time secrets check | Section 1 (top of file, after imports) | Refuses to start if `OPENAI_API_KEY` is missing or matches the placeholder set |
| Modify SSE streaming behavior | Section 6 (`startSseStream`) | Disables Nagle (`setNoDelay(true)`) so token-by-token arrives in real time; supports `?trace=true` for stderr JSON log |
| Change the resume handshake (ex 06) | Section 7 (`resumeSuspended`) | Calls `takeSuspendedRun(token)` from `shared/suspended-store.ts`, then `run.resume({step, resumeData})`. The decision vocabulary is `HITL_DECISIONS` from the same module. |
| Tune graceful shutdown | Section 8 (`shutdown`) | 30s drain timeout; `SIGTERM`/`SIGINT` handlers |
| Change the static file map | Section 1 (`STATIC_FILES`) | Add routes here; `serveStatic()` handles `/`, `/index.html`, `/style.css`. Anything under `/assets/` maps to `dist/assets/…` (Vite-hashed). |

## CONVENTIONS

- **One file.** The server is intentionally a single file. If it crosses 800 lines, extract helpers but keep the file structure (`createServer` callback) intact for grep-ability.
- **Section headers as banner comments.** The file is split into 9 numbered sections (1=static, 2=examples registry, 3=validation, 4=response helpers, 5=createServer, 6=SSE, 7=resume, 8=shutdown, 9=start). Follow this when adding code.
- **`as` casts for the `response` overload.** `Response` types are inferred from `http.ServerResponse`. Don't refactor to a framework — the bare `http` choice is intentional.
- **`sendJson(res, status, body)`** for JSON; `sendError(res, err, req)` for thrown errors. These are the only response-shaping helpers; don't add per-endpoint writeHead/res.end chains.
- **All error responses** carry `{ error, field?, detail? }` with status codes from the error class (`shared/validation.ts`).
- **Rate limit keys** are `clientIp(req) + ':run'` / `':stream'` / `':resume'`. Don't combine into one key — the spec is per-route.
- **Route prefixes** are constants: `RUN_PREFIX`, `STREAM_PREFIX`, `RESUME_PREFIX`. Don't inline the string literal — use the constant.

## ANTI-PATTERNS

- **Do not** add Express/Fastify/Koa. The bare `http` module is a learning choice; `server.ts` is meant to be readable end-to-end.
- **Do not** skip `checkRateLimit` on a new API route. Health (`/api/health`) and `/api/examples` are exempt (cheap, static). Everything else under `/api/run/*`, `/api/stream/*`, `/api/resume/*` is rate-limited.
- **Do not** skip `validateExampleInput`. Even for read-only endpoints, the input shape must be validated against the per-example contract. When you add a new example, ADD a switch case here too — falling through to `default: return body` means accepting any garbage.
- **Do not** add new response shapes. Stick to `{ ok: true, result }` for success, `{ error, field?, detail? }` for errors. The browser switches on `ok`.
- **Do not** edit `examples/0N-*/index.ts` from this file. The server dynamically imports examples via `loadRunFn(name)` which adds a cache-busting `?t=${Date.now()}` — examples are hot-swappable per request.
- **Do not** add an auth middleware without checking with the user first. `SECURITY.md` explicitly says "No authentication" — adding it changes the threat model.
- **Do not** call `process.exit()` from inside a request handler. The graceful shutdown handler manages lifecycle.
- **Do not** write to `res` after the request handler returns. The `try/catch` at the bottom of `createServer` checks `!res.headersSent` before `sendError`.
- **Do not** move the example registry out of this file. `EXAMPLES` is grep-able from `src/registry/examples.ts` and the package.json scripts — keeping it in one place is intentional.
- **Do not** reintroduce `public/app.js` or `public/index.html`. The UI is now React+Vite in `src/`, built to `dist/`.

## UNIQUE STYLES

- **Boot-time secrets check** (Section 1): refuses to start if `OPENAI_API_KEY` is unset, empty, or matches `PLACEHOLDER_KEYS` (`''`, `'your-key-here'`, `'changeme'`, `'[redacted]'`). The check runs at module load, before `server.listen()`. CI's smoke job boots the server without a key to exercise this failure path.
- **Per-IP token-bucket rate limit** (delegated to `shared/validation.ts`): 30 req/min, 5-request burst. 429 responses include `Retry-After`. Stale buckets (>1h) are GC'd every 10 min via `setInterval().unref()`.
- **SSE "no-delay" hack.** `res.socket.setNoDelay(true)` disables Nagle's algorithm so each `res.write(sseLine(...))` becomes its own TCP segment. Without this, the OS can coalesce the entire workflow's events into one packet and the browser's "token-by-token" UX breaks.
- **`?trace=true` server-side trace logging.** When the URL has `?trace=true`, every emitted `TraceEvent` is also written to stderr as structured JSON. Pipe `npm run serve | jq` to filter. `?events=start,step:start,done` filters to a subset.
- **Dynamic example import with cache-buster:** `loadRunFn(name)` does `import('../${file}?t=${Date.now()}')` so editing an example on disk is picked up on the next request without restarting the server. Don't remove the `?t=...` — it's the dev-mode hot-swap.
- **Suspended-run round-trip (Section 7):** `POST /api/resume/:token` → `takeSuspendedRun(token)` → `run.resume({step: 'gate', resumeData: {decision}})`. The decision vocabulary is the `HITL_DECISIONS` const exported from `shared/suspended-store.ts` (`'approved' | 'rejected'`). The token is the `runId` (Mastra doesn't expose a `getRun(id)` API, so the example's `gate` step stashes the run via `registerSuspendedRun` at suspend time).
- **`JSON.stringify(result) ?? String(result)` in the failed-run error field.** The previous bug was `result.error` rendering as `[object Object]` because `result` is a complex object. The fix is in the examples (fixed in 0.3.0).
- **Graceful shutdown with hard timeout.** `server.close()` + `setTimeout(process.exit, 30_000).unref()`. In-flight LLM calls have 30s to drain; after that the process exits. `cleanupInterval` is `clearInterval`'d at shutdown start.
- **Static-file route map.** `STATIC_FILES` is intentionally tiny (`/`, `/index.html`, `/style.css`). Anything under `/assets/` maps to `dist/assets/…` with a path-traversal guard. Don't enumerate Vite-hashed asset names — they change every build.

## COMMANDS

```bash
npm run serve              # tsx server/server.ts (port 8917)
npm run start:prod         # NODE_ENV=production tsx server/server.ts (no behavioral change yet)
npm run health             # curl /api/health | head -c 500
npm run smoke              # tsx scripts/smoke.ts (E2E: health, examples, run, errors)
docker compose up          # service "playground" on :8917
docker run --rm -p 8917:8917 --env-file .env mastra-playground
```

## NOTES

- **Default port is `8917`.** `.env.example` says `PORT=8787` — that's wrong, ignore it. The README env table is canonical. Dockerfile hardcodes `8917`.
- **The server refuses to start without `OPENAI_API_KEY`** unless the value matches a known placeholder. This is intentional; see `SECURITY.md` "Best-effort hardening".
- **429s include `Retry-After`** in seconds. The browser's SSE reconnect logic honors it.
- **Static files are served from `dist/`** (Vite build output). Run `npm run build` first; the CI workflow does this. The stylesheet lives at `src/styles.css` and is bundled into `dist/assets/index-*.css` — there is no `public/style.css`.
- **`server.ts` is included in `tsc --noEmit`** but never compiled. `outDir: "dist"` is set in tsconfig but unused; `tsx` runs the source directly. The Vite build for `dist/` is separate (config in `vite.config.ts`).
- **CI does NOT boot a real server end-to-end.** It verifies (1) format, (2) typecheck, (3) `npm run build` succeeds (4) `dist/index.html` + `dist/assets/index-*.{js,css}` exist and are non-empty, (5) server fails gracefully without a key. The full smoke test (`npm run smoke`) needs a real key and is run locally.
- **The `/assets/` handler** (`serveStatic`, lines 136–149) maps any `/assets/...` request to `dist/assets/...`. Path traversal is blocked by `path.join` normalization + a `startsWith(distRoot + sep)` prefix check; symlink escape is blocked by `realpathSync` re-checking the prefix. Both layers are required — a `realpathSync` race / oddity would otherwise allow symlinks to leak.
- **Cloudflared quick-tunnels hit a 100s HTTP/2 timeout** on long-running SSE streams. Re-launch the tunnel or run locally. See `notes/learning-log.md`.
- **The "allKeys leak in resume response" was removed** in the 0.3.0 audit fix. `resumeSuspended` only returns `{ ok: true, result: { status, output, error } }`.
