# PROJECT KNOWLEDGE BASE

**Generated:** 2026-06-20T07:29:20Z
**Commit:** a38b52a
**Branch:** main

## OVERVIEW

A small, isolated TypeScript Node 22+ learning playground for the [Mastra](https://mastra.ai) AI agent/workflow framework. **Not for production. Not part of InboxPilot.** Single package, flat root layout. The example code runs via `tsx` (no TS build step); the React UI is built by Vite into `dist/`, which the Node `http` server serves. 11 numbered examples each exercise a distinct Mastra primitive.

## STRUCTURE

```
mastra-playground/
├── index.html                # Vite entry; <script src="/src/main.tsx">
├── vite.config.ts            # Vite build config (outDir: dist/)
├── shared/                   # library used by every example (see shared/AGENTS.md)
├── examples/                 # 11 numbered examples (01- through 11-)
├── server/server.ts          # Node http server on :8917 (sole entry; see server/AGENTS.md)
├── src/                      # React 18 + Vite UI (App.tsx, main.tsx, components/, hooks/, registry/, styles.css)
├── scripts/                  # mixed-lang tooling (.ts/.py/.sh/.mjs; see scripts/AGENTS.md)
├── evals/                    # eval harness results (timestamped JSONs)
├── docs/{audit,design,superpowers}/   # code review + UI redesign + spec
├── notes/                    # user-filled learning notebook
└── v2-*.png ×10              # committed redesign screenshots (gitignored as `v2-*.png`)
```

Top-level configs: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.nvmrc` (Node 22), `.env.example`, `.editorconfig`, `.prettierrc`, `.gitignore`, `.dockerignore`, `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`. Docs at root: `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`, `LIVE_URL.md` (Cloudflare URL + release notes).

Generated state (should be gitignored): `dist/` (Vite build output), `.omo/` (opencode session state), `.playwright-mcp/` (browser snapshots). `AGENTS.md` itself is also gitignored (auto-regenerated knowledge base).

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Run the server (serves `dist/`) | `npm run serve` → `server/server.ts` | Port 8917 (NOT 8787 from `.env.example`) |
| Run the React dev server (HMR) | `npm run dev` → `vite` | Vite default :5173; not used by `npm run serve` |
| Build the React UI | `npm run build` → `dist/` | Vite output; the Node server reads from here |
| Preview the production build | `npm run preview` → `vite preview` | Local sanity check of `dist/` |
| Run a single example as CLI | `npm run example:0N` → `examples/0N-*/index.ts` | Each is self-contained |
| Add a new example | `examples/0N-short-name/` + 5 touchpoints | See "Adding an example" below |
| Trace events / SSE | `shared/tracer.ts` + `shared/traced-step.ts` | API surface for all examples |
| Server validation / rate limit | `shared/validation.ts` | 30 req/min/IP, 64KB body cap |
| In-memory state (chat, suspend) | `shared/memory-store.ts`, `shared/suspended-store.ts` | globalThis-scoped Maps |
| LLM model selection | `shared/llm.ts` | `getModel(id)` factory, env-driven |
| Structured logging | `shared/logger.ts` | stdout/stderr split, env `LOG_LEVEL` |
| Mastra runtime logger | `shared/observability.ts` (rename to `mastra-logger.ts` pending) | wraps `@mastra/core/logger` |
| React UI shell | `src/App.tsx`, `src/main.tsx` | React 18 + Vite |
| UI tabs / DAG graphs | `src/components/`, `src/registry/`, `src/hooks/` | per-example React views; CSS in `src/styles.css` (bundled) |
| End-to-end test | `npm run smoke` → `scripts/smoke.ts` | Hits running server |
| Unit tests | `npm test` → only `shared/` + `scripts/*.test.ts` | 5 files (4 in `shared/`, 1 in `scripts/`); examples/server NOT unit-tested |
| Eval harness | `scripts/run_evals.py` (Python) + `scripts/run-evals.sh` | 11 examples × N topics |
| Code review history | `docs/audit/SUMMARY.md` + `docs/audit/2026-06-18-code-review.md` | 16 findings, 9 fixed |
| CI | `.github/workflows/ci.yml` | format + typecheck (PR 6 adds Vite build static-asset check) |

## CODE MAP

Single high-traffic files (project has <13k LOC excluding `dist/`):

| File | Lines | Role |
|------|-------|------|
| `server/server.ts` | 671 | HTTP server: static (`dist/`) + JSON + SSE + validation + rate limit + graceful shutdown |
| `src/registry/renderers.tsx` | 612 | Per-example React renderers (forms, output panels) |
| `src/styles.css` | 4496 | Single bundled stylesheet (Vite emits as `dist/assets/index-*.css`) |
| `src/registry/examples.ts` | 457 | Example metadata registry (titles, inputs, defaults) |
| `examples/06-hitl-approval/index.ts` | 375 | Largest example; demonstrates `suspend()` / `run.resume()` |
| `examples/09-multi-agent-handoff/index.ts` | 325 | Multi-agent delegation pattern |
| `scripts/ui-smoke.test.ts` | 122 | UI build-artifact smoke test (the only test outside `shared/`) |

`shared/` modules (9 modules, all <135 lines):

| Module | Exports | Used by |
|--------|---------|---------|
| `tracer.ts` | `Tracer` class, `TraceEvent` union, `sseLine()` | server, every example |
| `traced-step.ts` | `stepStart`, `stepEnd`, `llmStructured`, `toolCall`, `branchEvaluate`, `timed` | every example |
| `llm.ts` | `model`, `modelId`, `getModel(id)` | every example |
| `validation.ts` | `ValidationError`, `NotFoundError`, `RateLimitError`, `readJsonBody`, `checkRateLimit`, `clientIp`, `sanitizeText` | server |
| `memory-store.ts` | `memoryStore`, `Message`, `ThreadState` | ex 05 only (others use @mastra/memory or in-step state) |
| `suspended-store.ts` | `registerSuspendedRun`, `takeSuspendedRun`, `peekSuspendedRun` | ex 06 + server |
| `logger.ts` | `logger.{debug,info,warn,error}` | server, examples |
| `observability.ts` | `logger` (Mastra `ConsoleLogger`) | every example (rename to `mastra-logger.ts` pending) |
| `workflow-helpers.ts` | `unwrapWorkflowOutput` | examples with `.branch()` |
| Tests co-located | `*.test.ts` next to source | vitest (4 files in `shared/`) |

## CONVENTIONS

- **No build step for examples.** `tsx` runs `.ts` directly. `outDir` in `tsconfig.json` is unused. The React UI is the only thing Vite builds.
- **Vite builds the UI into `dist/`.** `index.html` at the project root is the Vite entry. The Node server (`server/server.ts`) serves files from `dist/`, not `public/`.
- **ESM only.** `"type": "module"` in package.json; imports use `.js` suffix even for `.ts` source.
- **Node 22+ required.** TypeScript 6 features need it; `.nvmrc` pins 22.
- **No `tests/` directory** — tests co-located as `*.test.ts` next to source.
- **Tests only in `shared/` and `scripts/`.** `vitest.config.ts` `include` glob restricts it. The React UI is exercised by `scripts/ui-smoke.test.ts` (JSDOM-driven smoke test of the bundle shape, not a component test).
- **No ESLint.** Code quality = `tsc --noEmit` + `prettier --check` only.
- **Prettier:** `printWidth: 110`, single quotes, trailing commas `all`, 2-space, LF.
- **Conventional Commits** enforced (CONTRIBUTING.md).
- **One example per PR** (CONTRIBUTING.md).
- **No `as any`.** Document any cast you must make (CONTRIBUTING.md).

## ANTI-PATTERNS (THIS PROJECT)

- **Do not** add ESLint or `as any`. CI gate is `tsc --noEmit` + `prettier --check` only. If you must cast, write a comment.
- **Do not** reintroduce a duplicate stylesheet. The single source of truth for styles is `src/styles.css`; Vite bundles it into `dist/assets/index-*.css`. Do not create `public/style.css` (it was deleted in the v2 migration).
- **Do not** bypass Vite for the React UI. New UI code goes in `src/`, runs through `vite build`, and lands in `dist/`. Do not hand-write files into `dist/`.
- **Do not** put example-specific code in `shared/`. Shared is for cross-example helpers only.
- **Do not** use `process.exit()` from inside an example — server uses graceful shutdown.
- **Do not** trust `.env.example` blindly. `PORT=8787` there is wrong; actual default is `8917`. `OPENAI_API_KEY=*** server config` is a placeholder, not a real default. README env table is canonical.
- **Do not** assume README "6 examples" is current. There are 11 (01-11); README is stale.
- **Do not** commit to `examples/0N-*/index.ts` > 350 lines (README) / 200 lines (CONTRIBUTING). Split before growing.
- **Do not** skip `examples:0N` in `package.json` when adding an example — the server loads by path, but CLI demos and CI rely on the script.
- **Do not** modify `shared/` API surface without updating `server/server.ts` `validateExampleInput()` for affected examples.

## UNIQUE STYLES

- **The example contract.** Every `examples/0N-*/index.ts` exports:
  ```ts
  export async function runOne(input: RunOptions, tracer: Tracer): Promise<RunResult>
  ```
  where `RunOptions` is per-example and `RunResult = { status, input, output, error, totalMs }`.
- **Trace events as the UI protocol.** Examples emit `TraceEvent`s via `stepStart`/`stepEnd`/`llmStructured`/`toolCall`/`branchEvaluate`; the server serializes them to SSE; the browser renders the DAG in real time. See `shared/tracer.ts` for the union. Do NOT bypass these helpers with raw `tracer.emit` — they exist for grep-ability.
- **The "7-touchpoint" add-an-example pattern** (README §"Adding a new example"):
  1. `examples/0N-short-name/` with `index.ts` + `README.md`
  2. `server/server.ts` `EXAMPLES` map entry
  3. `src/registry/examples.ts` entry (title, inputs, defaults)
  4. `src/registry/renderers.tsx` entry (React form + output)
  5. `package.json` `example:0N` script
  6. `server/server.ts` `validateExampleInput()` case
  7. `shared/` (only if a cross-example helper is genuinely shared)
- **Per-request model swap.** `shared/llm.ts` exposes `getModel(id)`; the server passes the UI's model picker choice as `input.model`; each example builds its `Agent` inside `runOne()` with that model.
- **GlobalThis-scoped stores.** `memory-store.ts` and `suspended-store.ts` use `globalThis.__mastraPlayground…` Maps so the server's `import` of the example and the example's `import` of the store see the same data across module-load boundaries.
- **`suspend()` + `registerSuspendedRun()` pattern (ex 06).** The workflow step calls `suspend({...})`, registers itself with the suspended-store keyed by `runId`, and the server's `POST /api/resume/:token` looks it up and calls `run.resume({step, resumeData})`.
- **React UI consumes SSE.** `src/hooks/useWorkspace.ts` and `src/components/TracePane.tsx` open an `EventSource` to `/api/stream/:example` and replay the `TraceEvent` stream into a DAG view.

## COMMANDS

```bash
nvm use && npm install && cp .env.example .env  # Node 22, set OPENAI_API_KEY

# UI / build
npm run dev                  # Vite dev server (HMR) on :5173
npm run build                # Vite build → dist/ (server reads from here)
npm run preview              # Vite preview of the production build

# Server + examples
npm run serve                # http://localhost:8917 — serves dist/ + API
npm run example:0N           # CLI demo of example N (no server)
npm run typecheck && npm run format:check   # CI gate
npm test                     # vitest run (5 files: 4 in shared/ + scripts/ui-smoke.test.ts)
npm run smoke                # E2E against running server (see scripts/AGENTS.md)
./scripts/run-evals.sh       # Python eval harness over 11 examples
docker compose up            # service "playground" on :8917
```

Full per-subdir command reference: `shared/AGENTS.md`, `server/AGENTS.md`, `scripts/AGENTS.md`.

## NOTES

- **`OPENAI_API_KEY` is mandatory.** Server refuses to start without it (also rejects the `.env.example` placeholder string). OpenRouter works via `OPENAI_BASE_URL=https://openrouter.ai/api/v1` + `OPENAI_API_KEY=sk-or-…`.
- **Default port is `8917`.** `.env.example` says `8787` — wrong. Dockerfile hardcodes `8917`. README env table is canonical.
- **Vite build populates `dist/`** which is what the Node server serves. `npm run build` is required before `npm run serve` (the server returns 404 on `/` without it).
- **Rate limit: 30 req/min/IP** across `/api/run/*`, `/api/stream/*`, `/api/resume/*`. Health/static exempt. 429 includes `Retry-After`. Body cap: 64KB.
- **No auth, no persistent storage.** Anyone who can reach the server can run workflows. Suspended runs and chat threads are lost on restart. See `SECURITY.md`.
- **Stack trace gotcha.** Failed `runOne()` results must `JSON.stringify(result) ?? String(result)` — raw `result.error` renders as `[object Object]` (fixed in 0.3.0).
- **Sibling-subagent gotcha.** When multiple agents write to `examples/` in parallel, always `ls examples/` before assuming a directory still exists (see `notes/learning-log.md` 2026-06-20 entry).
- **Cloudflared tunnel tip.** `trycloudflare.com` URLs rotate on restart; `npm run launch:hermes` wraps key bootstrap. Long SSE streams may hit cloudflared's 100s HTTP/2 timeout — re-launch or run locally.
- **`notes/` is the user's space;** do not edit unless asked. `docs/audit/` and `docs/design/` are point-in-time artifacts.
- **The `AGENTS.md` files are auto-generated knowledge bases** (gitignored). They get regenerated on demand; do not commit them.

## SEE ALSO

- `shared/AGENTS.md` — the public contract every example depends on
- `server/AGENTS.md` — endpoint map, validation pipeline, SSE handler, secrets check
- `scripts/AGENTS.md` — toolchain (smoke, eval, UI test, diag, launch)
- `README.md` — full user-facing docs (some sections stale vs. 11-example reality)
- `CONTRIBUTING.md` — code style + commit conventions + PR rules
- `CHANGELOG.md` — what changed in each version
- `SECURITY.md` — what the project does and does NOT protect against
- `docs/audit/SUMMARY.md` — 16-finding code review summary
