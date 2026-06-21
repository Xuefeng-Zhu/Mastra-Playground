# shared/ — public contract for every example

**The contract.** Every `examples/0N-*/index.ts` imports from here. If you change a signature or a trace-event shape, you touch every example.

## WHERE TO LOOK

| Task | Module | Notes |
|------|--------|-------|
| Emit a trace event to the UI | `tracer.ts` + `traced-step.ts` | `Tracer` is a pub-sub bus; `stepStart`/`stepEnd`/`llmStructured`/`toolCall`/`branchEvaluate`/`timed` are the example-author API |
| LLM model selection (env-driven) | `llm.ts` | `getModel(id)` returns a model; `resolveModel(inputModel?)` returns either the per-request id or the env default; `model` is the default instance |
| Body cap / rate limit / sanitize | `validation.ts` | Used by `server/server.ts`; not by examples directly |
| Final `done` event + RunResult shaping | `run-result.ts` | `finalizeRunResult(result, tracer, t0, echoInput)` replaces the 9-line tail block at the bottom of every `runOne()` |
| CLI bootstrap (entrypoint guard + demo runner) | `cli-bootstrap.ts` | `isMain(metaUrl, argv1)` + `runCliExample(name, demo)` replace the `main()/isMain/process.exit` block at the bottom of every example |
| In-memory chat thread (ex 05) | `memory-store.ts` | `globalThis` Map, **not** Mastra's Memory class |
| Suspended workflow registry (ex 06) | `suspended-store.ts` | `globalThis` Map keyed by `runId`; server's `POST /api/resume/:token` looks it up. Also exports `HITL_DECISIONS = ['approved', 'rejected'] as const` |
| Unwrap a `.branch()` workflow output | `workflow-helpers.ts` | `unwrapWorkflowOutput(result)` flattens the single-key wrapper |
| Structured JSON logging | `logger.ts` | stdout/stderr split, `LOG_LEVEL` env |
| Mastra framework logger | `mastra-logger.ts` | Re-exports `ConsoleLogger` from `@mastra/core/logger`. Renamed from `observability.ts` so the @mastra runtime dep is in the filename. |

## WHERE TO LOOK (tests)

`*.test.ts` lives next to source. `vitest.config.ts` `include` glob is `shared/**/*.test.ts` + `scripts/**/*.test.ts`. Examples and server are **not** unit-tested. Coverage excludes `mastra-logger.ts`, `llm.ts`, `memory-store.ts`, `suspended-store.ts` — these are integration-tested via examples or smoke (see `vitest.config.ts` comments).

Current test files:
- `shared/tracer.test.ts` — pub-sub, error resilience
- `shared/traced-step.test.ts` — every helper's emitted event shape
- `shared/validation.test.ts` — sanitizeText, isPlainObject, ValidationError, RateLimitError
- `shared/workflow-helpers.test.ts` — unwrapWorkflowOutput edge cases
- `shared/run-result.test.ts` — finalizeRunResult status narrowing + done event
- `shared/cli-bootstrap.test.ts` — isMain + runCliExample
- `scripts/ui-smoke.test.ts` — Vite build artifacts

## CONVENTIONS

- **All modules ESM.** Imports use `.js` suffix even for `.ts` source (NodeNext).
- **One-purpose per file.** Each module is <135 lines. Don't grow past 200 — split first.
- **No example-specific logic.** If only one example uses it, it lives in that example. Shared is for cross-cutting helpers only (enforced rule from `AGENTS.md`).
- **Tests co-located.** `tracer.test.ts` next to `tracer.ts`, etc.

## ANTI-PATTERNS

- **Do not** add example-specific code here. If a helper is used by 1 example, it belongs in that example.
- **Do not** import `@mastra/*` here for runtime values. `shared/` is framework-agnostic glue (logger, validation, types). Mastra types can be re-exported via `import type` only. Exception: `shared/mastra-logger.ts` re-exports `ConsoleLogger` from `@mastra/core/logger` — the file name makes the dep explicit.
- **Do not** make `Tracer` stateful across calls. It's a per-run bus; one Tracer per `runOne()` invocation.
- **Do not** store anything in the imported module top-level scope that needs to be shared with the server. Use `globalThis.__mastraPlayground…` like `memory-store.ts` and `suspended-store.ts` already do.
- **Do not** rename the `TraceEvent` union members. The browser (`src/components/TracePane.tsx` in the React UI) and the SSE handler (`server/server.ts`) switch on these strings.

## UNIQUE STYLES

- **The trace-event union** (`shared/tracer.ts`): `start | step:start | step:end | branch:evaluate | llm:structured | llm:delta | llm:start | llm:end | tool:call | suspend | resume | done`. New event types must be added to the union AND consumed in the React UI's `TracePane`.
- **The helper ergonomics:** `traced-step.ts` exports thin wrappers around `tracer.emit(...)` so examples read like `stepStart(tracer, 'classify', input)`. Don't bypass these with raw `tracer.emit` calls — they exist for grep-ability.
- **`timed(tracer, stepId, input, fn)`** wraps a step's `execute` and emits `step:start` + `step:end` with `durationMs`. Use this when you don't need a custom trace payload. Adds `durationMs` as a top-level field in the step: end event payload.
- **`getModel(id)` and `resolveModel(inputModel?)`** (in `llm.ts`) are the per-request model swap entry points. The server passes the UI's model picker as `input.model`; the example calls `resolveModel(input.model)` inside `runOne()` and constructs a fresh `Agent`. Never cache an `Agent` at module level — the model can differ per request.
- **`finalizeRunResult(result, tracer, t0, echoInput)`** (in `run-result.ts`) emits the terminal `done` event AND returns a shaped `RunResult`. Replaces the 9-line `output/errMsg/doneStatus/emit done/return` tail block. Ex 06 (hitl-approval) is exempt — its suspend path is bespoke.
- **`runCliExample(name, demo)`** (in `cli-bootstrap.ts`) is the standard entrypoint guard. Replaces the `await import('../../shared/tracer.js')` + `main()/isMain/process.exit` boilerplate at the bottom of every example.
- **GlobalThis Maps.** `memory-store.ts` and `suspended-store.ts` declare `var __mastraPlaygroundFoo: Map<…> | undefined` and assign with `??=`. This is intentional: the server and the example both import the store, but they need to share state across the module-load boundary (the server's import is the one the resume handler sees).
- **Error types carry HTTP status.** `ValidationError.status = 400`, `NotFoundError.status = 404`, `RateLimitError.status = 429` (plus `retryAfter`). The server's `sendError()` matches on `instanceof`, not status string.
- **`HITL_DECISIONS`** (in `suspended-store.ts`) is the vocabulary for `POST /api/resume/:token`. Server validates `body.decision ∈ HITL_DECISIONS` before calling `run.resume({step, resumeData: {decision}})`.
- **`unwrapWorkflowOutput` is a single-key flattener.** When a workflow ends in `.branch([[pred, step], …])`, the result wraps under the chosen step's id: `{ "step-id": output }`. This helper returns the inner output, or the value as-is if not a single-key wrapper.

## COMMANDS

```bash
npm test                       # vitest run (this dir + scripts/)
npm run test:coverage          # v8 coverage, html report at coverage/
npm run test:watch             # vitest watch mode
npm run typecheck              # tsc --noEmit (covers shared/)
npm run format                 # prettier --write
```

## NOTES

- **No build step.** The server and examples import these `.ts` files directly via `tsx` (Node ESM + `--experimental-strip-types` is *not* what this project uses). Imports use `.js` extension even for `.ts` source — that's how NodeNext resolves them.
- **Trace events are the UI's source of truth.** The React UI renders the DAG in real time by listening to the SSE stream of `TraceEvent`s via `useWorkspace.ts`. If you add a new event type, update both `shared/tracer.ts`'s union AND the React component that renders it.
- **The `suspend` / `resume` events are emitted manually by the example, not by the framework.** `suspended-store.ts` is the side door that lets the server call `run.resume()` later — Mastra's workflow result type doesn't include the run id in a recoverable way.
- **Coverage exclusions are deliberate.** The excluded files (`mastra-logger.ts`, `llm.ts`, `memory-store.ts`, `suspended-store.ts`) are either pure infra (logger, env-driven factory) or integration-tested via examples 05/06/smoke. Don't add unit tests for them — write a smoke check.
- **Adding a new shared module:** place it here, co-locate the test as `<name>.test.ts`. Update this AGENTS.md's WHERE TO LOOK table.
