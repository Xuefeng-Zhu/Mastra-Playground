# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **UI migrated from vanilla HTML/CSS/JS to React 18 + Vite.** The browser
  app is now `src/` (TypeScript + JSX) built by Vite into `dist/`, which
  the Node server serves. The new shell is a left-rail grouped by
  Mastra primitive (Agent / Workflow / Tool / Memory / HITL / Stream) +
  per-example workspace (form rail, fused graph + timeline trace,
  Result / Sources / Raw JSON / Compare output panel).
- **The `/assets/` static handler in `server/server.ts` was rewritten.**
  The previous implementation constructed paths that never contained
  `dist/` and the prefix guard accidentally blocked every request. The
  new handler joins `ROOT/dist` with the URL path, then re-validates
  via `realpathSync` to also block symlink escape.
- **`src/styles.css` is the only stylesheet.** `public/style.css` was
  removed; the Vite build emits `dist/assets/index-*.css` from the
  React entry.

### Added

- `npm run build` + `npm run dev` + `npm run preview` scripts (Vite)
- `npm run build` is required before `npm run serve` (server reads `dist/`)
- `src/registry/renderers.tsx` per-kind renderers (parallel / triage /
  research / codeReview / chat / streaming / hitl / criticLoop /
  contentPipeline / mastraMemory)
- `src/registry/examples.ts` declarative per-example config (form fields,
  samples, graph, output kind)
- `src/hooks/useWorkspace.ts` central state hook (SSE consumption,
  per-run output, prior-run snapshot for Compare, HITL resume)
- Model-picker preference persisted to `localStorage` (per example)
- "Copy as Markdown" output action (clipboard with non-secure-context
  fallback)
- `npm run ci` meta-script combining format:check + typecheck + test + build

### Fixed

- `renderChat` operator-precedence bug — the previous expression
  `out?.allMessages || ctx.streamingText ? [] : []` always returned
  `[]` (empty array is truthy in JS), so chat examples 05 and 09 never
  showed messages. Now uses `??` so `allMessages` passes through.
- `renderTriage` template-literal bug — `className="action-${action}"`
  was a literal JSX string, not a template. Now uses backticks.
- `Workspace.tsx` timeline `kind` ternary always returned `'step'`,
  ignoring the per-node kind from the example's graph def.
- `activeWs` state in `App.tsx` was never updated, so Cmd/Ctrl+Enter
  and `window.__mpg.run` were dead. The Workspace now registers its
  `run` via `useEffect` against the typed `window.__mpg` global.
- `vite.config.ts` `sourcemap: true` would have exposed the full React
  source to anyone fetching the public assets. Set to `false`.
- `public/style.css` was reintroduced as dead code; removed.
- Dockerfile now builds the React UI (`npm run build`) during the Docker
  build so `dist/` exists in the container image.
- Dockerfile runtime stage uses prod-only `node_modules` (smaller image).
- SECURITY.md no longer claims "no rate limiting" (rate limiting was added
  in 0.4.0).
- CI now runs unit tests (`npm test`) alongside format and typecheck.
- CI build-artifact assertions moved into the same job that runs the build
  (previously relied on cross-job filesystem which doesn't work).

## [0.4.0] - 2026-06-19

### Added

- `GET /api/health` endpoint returning server liveness, uptime, and available models
- Graceful shutdown handler for SIGTERM/SIGINT (drains SSE streams, 30s timeout)
- Per-IP rate limiting (30 req/min) on `/api/run/*` and `/api/resume/*`
- Request validation for `/api/run/:example` and `/api/resume/:token` (length caps, type checks)
- Input sanitization for `action`/`message` fields (control chars stripped, 4KB cap)
- Structured JSON logger in `shared/logger.ts`
- Secrets hardening: server refuses to start if `OPENAI_API_KEY` is missing or is the placeholder
- `.editorconfig`, `.nvmrc`, `.prettierrc`
- `LICENSE` (MIT)
- `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`
- GitHub Actions CI (typecheck, format check, smoke test)

### Changed

- README rewritten with badges, table of contents, architecture diagram, troubleshooting, environment variables table
- `package.json` scripts: added `format`, `format:check`, `health`, `start:prod`
- Graceful shutdown now also clears the periodic suspended-runs cleanup interval

### Fixed

- `.audit-findings.md` re-baselined: 9 of the 12 originally open items were already resolved by `cc09dd3` / `4038dcb`. The 3 remaining real items are fixed in this branch (`fix/audit-low-findings`):
  - Stored cleanup `setInterval` handle and clear it in `shutdown()` so the process can exit cleanly (`server/server.ts`)
  - Removed the orphan `.pending-approval` CSS block (used stale `.label`/`.value`/`pulse` class names); the live block (`pad-label`/`pad-value`/`hitl-pulse`) was already in the second location. 129 lines deleted (`public/style.css`)
  - Corrected the misleading "Call the server" comment on the new-conversation button — threads are localStorage-only, there is no server call to wait for (`public/app.js`)
  - Smoke test no longer asserts a hard-coded example count (it broke when example 07 was added) — now `>= 1` (`scripts/smoke.ts`)

## [0.3.0] - 2026-06-19

### Added

- `examples/07-streaming-chat/` — Agent.stream() with token-by-token events
- New `llm:start` / `llm:delta` / `llm:end` event types in `shared/tracer.ts`
- 7th UI tab + GRAPHS entry + `appendStreamingText` / `finalizeStreamingText` helpers
- Server-side trace logging via `?trace=true` (writes structured JSON to stderr)
- `vitest` unit tests for shared modules (30 tests)
- Multi-stage `Dockerfile` + `.dockerignore` + `docker-compose.yml`
- `vitest.config.ts` with coverage config

### Changed

- Removed redundant `newAgent` from ex 01's `Mastra` constructor
- Render functions (`renderTriage`, `renderResearch`, `renderCodeReview`, `renderParallel`, `renderChat`) now handle unexpected output shapes gracefully

### Fixed

- `Tracer.emit` was not catching subscriber errors (crashed production SSE handlers)

## [0.1.0] - 2026-06-19

### Added

- 6 example workflows exercising Mastra primitives:
  - `01-support-triage`: customer-message triage with structured LLM output + `.branch()`
  - `02-research-agent`: tool-using agent with web-search + arxiv mocks
  - `03-code-review-agent`: deterministic gate + LLM review conditional on lint issues
  - `04-parallel-research`: `Promise.all` fan-out + LLM synthesis
  - `05-multi-turn-chat`: explicit conversation history in the prompt
  - `06-hitl-approval`: `suspend()`/`run.resume()` pattern with deterministic gate
- Shared modules: `tracer`, `traced-step`, `llm`, `memory-store`, `suspended-store`, `workflow-helpers`
- Local dev server (`server/server.ts`) with SSE streaming and POST `/api/resume/:token`
- Web UI (`public/`) with 6 tabs, workflow graphs (SVG), trace event log, recent-runs chips, persistent history (localStorage), per-example settings (model picker), markdown export, copy-as-MD button, multi-turn chat UI, HITL pending-approval panel
- Cloudflared quick-tunnel for public URL access
- `.audit-findings.md` — opencode code review (16 findings, 9 actionable fixes applied)

[Unreleased]: https://github.com/your-org/mastra-playground/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/your-org/mastra-playground/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/your-org/mastra-playground/compare/v0.1.0...v0.3.0
[0.1.0]: https://github.com/your-org/mastra-playground/releases/tag/v0.1.0
