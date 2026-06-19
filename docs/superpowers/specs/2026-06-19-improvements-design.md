# Improvements Brainstorm — 2026-06-19

## Summary

Follow-up to the production-readiness pass (commits 0eb715d + cc09dd3).
The repo is now in good shape but has gaps a senior engineer would notice.
This spec covers 8 ideas across 3 waves.

## Scope

**In scope (8 ideas):**

| ID | Idea | Wave | Effort | Files |
|---|---|---|---|---|
| A1 | Unit tests for shared modules | A | M | shared/*.test.ts (new), package.json |
| C1 | Dockerfile | A | M | Dockerfile (new), package.json |
| C2 | .dockerignore | A | S | .dockerignore (new) |
| C4 | Docker healthcheck | A | S | Dockerfile |
| D1 | Server-side trace logging (?trace=true) | B | S | server/server.ts |
| E1 | Example 07: Streaming tokens | B | M | examples/07-streaming-chat/, shared/tracer.ts, public/, server/ |
| B1 | Redundant `newAgent` fix | B | S | examples/01-support-triage/index.ts |
| G1 | A11y on tabs + HITL + forms | C | M | public/index.html, public/app.js, public/style.css |
| B5 | Audit summary doc | C | S | docs/audit/SUMMARY.md (new), docs/audit/2026-06-18-code-review.md (moved from .audit-findings.md) |

**Out of scope (deferred):**

- The other 30 ideas from the brainstorm (new examples 08/09/10, deployment docs, observability extensions, more a11y items, etc.)
- README polish (already comprehensive)
- Anything that turns this into a real product (auth, persistent storage, distributed rate limiting)

## Architecture

### A1: Unit tests with vitest

**Stack choice:** vitest. Rationale:
- Fast (parallel test runner, watch mode)
- TS-native (no babel/jest config)
- Jest-compatible API (anyone who's used Jest can write vitest)
- Smaller footprint than Jest

**Coverage target:** ~80% line coverage of `tracer.ts`, `traced-step.ts`, `validation.ts`, `workflow-helpers.ts`. The other shared modules (`memory-store.ts`, `suspended-store.ts`) are skipped because they use `globalThis`-scoped Maps that need careful mock management.

**File layout:** colocated tests, e.g. `shared/tracer.test.ts` next to `shared/tracer.ts`. Each test file has 1-3 describe blocks focused on one module's API surface.

**Test command:** `npm test` runs vitest in run mode. `npm run test:watch` for development. `npm run test:coverage` for the coverage report (HTML + text).

### C1 + C2 + C4: Docker

**Dockerfile structure** (multi-stage):
```dockerfile
# Stage 1: deps — install only what we need
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Stage 2: build — compile TS (if needed) and gather sources
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY shared/ examples/ server/ public/ scripts/ ./
RUN npm ci

# Stage 3: runtime — slim image with just prod deps
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared/ ./shared/
COPY --from=build /app/examples/ ./examples/
COPY --from=build /app/server/ ./server/
COPY --from=build /app/public/ ./public/
COPY --from=build /app/scripts/ ./scripts/
COPY --from=build /app/package.json ./
EXPOSE 8917
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:8917/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"
CMD ["npx", "tsx", "server/server.ts"]
```

**.dockerignore** excludes: `node_modules`, `.git`, `.env`, `.audit-findings.md`, `.review-brief.md`, `*.log`, `dist/`, `coverage/`, `docs/`, `.vscode/`, `.idea/`.

**docker-compose.yml** (new file): single service with env-file, port mapping, restart policy.

### D1: Server-side trace logging

**API:** `GET /api/stream/:example?input=...&trace=true&logEvents=all`

- `trace=true` (default `false`): subscribe a second logger to the tracer's events
- `logEvents=all` (default): every event
- `logEvents=lifecycle` (optional): only `start`, `step:start`, `step:end`, `done`

**Output:** stderr (so it doesn't conflict with stdout SSE). One JSON line per event with `{ ts, level: 'info', msg: 'trace_event', runId, type, ...payload }`.

**Implementation:** inside `startSseStream`, if `trace=true`, create a second subscriber to the tracer that writes to stderr via the existing `logger` module.

### E1: Example 07 — Streaming tokens

**What it teaches:** `Agent.stream()` for token-by-token generation, the `llm:delta` event type, the streaming UI pattern (typing indicator → final answer).

**Shape:**
- Input: `{ prompt: string, model?: string }`
- Workflow: one step that calls `agent.stream({ prompt })` and yields each text delta
- Trace events: `llm:start` → `llm:delta` × N → `llm:end` (with final text and token count)
- Output: `{ prompt, deltas: string[], finalText: string, model }`

**New TraceEvent type:** `{ type: 'llm:delta', stepId, text: string, index: number }`. Adds to the existing `TraceEvent` union in `shared/tracer.ts`.

**UI:** new "Streaming" tab. Result panel shows a typing cursor that fills in as deltas arrive, then settles into a "Done" state with the full text. The trace event log shows the deltas live.

### B1: Redundant `newAgent` fix

In `examples/01-support-triage/index.ts:130`, the `Mastra` constructor receives an agent that no step uses. Remove the `agents: { ... }` field from the constructor. The classify step builds its own agent via the closure. Reduces confusion, removes 1 dead line.

### G1: A11y pass

**Tabs (`<button class="tab">`):**
- Add `role="tab"`, `aria-selected`, `aria-controls` linking to panel IDs
- Add `role="tablist"` to the parent `<nav>`
- Add `role="tabpanel"` to each section
- Keyboard: Arrow Left/Right moves between tabs, Home/End to first/last
- Only the active tab is in the tab order (others have `tabindex="-1"`)

**History panel (`<div class="history-panel">`):**
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby="history-title"`
- Focus trap: Tab cycles within the panel
- Escape closes the panel
- Focus returns to the trigger button on close

**HITL approval panel:**
- Add `aria-label` to the Approve and Reject buttons
- Add `role="alert"` to the panel itself (it's announcing a pending decision)
- Add `aria-live="polite"` so screen readers announce the new pending state

**Forms:**
- Verify every `<label for="...">` matches the input's `id` (some are already correct, some need adding)
- Add `aria-describedby` linking to help text where it exists

### B5: Audit summary

**Move:** `.audit-findings.md` → `docs/audit/2026-06-18-code-review.md`

**Add:** `docs/audit/SUMMARY.md` (1 page) listing:
- 16 findings total
- 9 applied as code fixes (with one-line descriptions + commit references)
- 4 INFO items deferred (with rationale)
- 3 not addressed (would change the design or were too speculative)
- How to re-run the audit (`oc run -m minimax/MiniMax-M2.7 -f <brief>`)

**Update README** to link to `docs/audit/SUMMARY.md` (not the 233-line file).

## Data flow

No changes to the data flow. Everything is additive.

## Error handling

No changes. Existing error handling is already sound after Wave 2.

## Testing

| What | How | Where |
|---|---|---|
| Shared modules | vitest, unit tests | shared/*.test.ts |
| Smoke test | existing | scripts/smoke.ts |
| Docker | manual: `docker build && docker compose up && curl /api/health` | host |
| UI changes | manual: open browser, tab through | host |

CI updates: add `npm test` job to the quality workflow in addition to typecheck + format check.

## Rollout

3 commits, one per wave. Each wave:
1. Build
2. Verify (typecheck + smoke test + manual check of changed surface)
3. Commit with conventional-commit prefix

## Risk register

- **vitest setup could conflict with the existing tsconfig** — vitest has its own TS handling. Mitigation: use vitest's built-in TS support, no need for the existing tsconfig to know about it.
- **Docker image size** — using `node:22-bookworm-slim` is ~200MB. Could go to alpine (~100MB) but musl-libc risk. Sticking with slim.
- **Streaming example token counting** — `Agent.stream()` doesn't give token counts natively. We'd estimate via `result.text.length / 4` (rough but acceptable). Real production would need to parse the `usage` field from the LLM response.
- **A11y keyboard handler bug surface** — adding keyboard nav to the tabs is a few dozen lines. If a user reports a focus trap bug after the change, it's easy to revert. Mitigation: keep the change small and well-tested manually.

## Trigger to execute

Approved per the brainstorming flow. Implementation in 3 waves, 3 commits.
