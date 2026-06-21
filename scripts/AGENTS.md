# scripts/ — mixed-language toolchain

This dir holds the operator scripts: smoke tests, eval harness, UI test, key bootstrap, diagnostics. **Mixed languages** on purpose — `.ts` for things that touch the server, `.py` for the eval (CSV/JSON analysis), `.sh` for shell-only utilities.

## WHERE TO LOOK

| Task | File | Run |
|------|------|-----|
| End-to-end smoke against running server | `smoke.ts` | `npm run smoke` |
| UI build-artifact smoke (node env, no JSDOM) | `ui-smoke.test.ts` | `npm run test:ui` |
| Eval harness (Python) | `run_evals.py` + `run-evals.sh` | `./scripts/run-evals.sh` |
| Bootstrap key + launch tunnel | `launch-with-hermes-key.sh` | `npm run launch:hermes` |
| Diagnostics | `_diag.mjs` | direct invocation, no npm script |

## WHERE TO LOOK (tests)

`vitest.config.ts` `include` glob picks up `scripts/*.test.ts`. The only test file in this dir is `ui-smoke.test.ts`.

## CONVENTIONS

- **Mixed languages are fine.** Don't try to port everything to TypeScript. The eval harness is Python because it's data analysis; `launch-with-hermes-key.sh` is shell because it shells out to `cloudflared`.
- **Idempotent scripts.** Each script should be safe to re-run. `smoke.ts` exits non-zero on failure; `run_evals.py` appends timestamped JSON to `evals/`.
- **`*.test.ts` co-located** when there is one. `ui-smoke.test.ts` uses `// @vitest-environment node` (declared in-file).
- **No build step for scripts.** All scripts run via `tsx` (TS) or direct interpreter (Python/sh/Node ESM).

## ANTI-PATTERNS

- **Do not** add a `.test.ts` for `smoke.ts` or `run_evals.py`. These are operator scripts — they're tested by running them against a live server.
- **Do not** move the Python eval to TypeScript. The eval output is JSON; Python + `jq`-equivalent is faster for tabular analysis than Node would be.
- **Do not** add dependencies to scripts/ without checking with the user. The toolchain stays small.
- **Do not** add CI steps that call `npm run smoke` or `./scripts/run-evals.sh`. Both need a real `OPENAI_API_KEY`; CI's job is format + typecheck + `npm run build` + boot-without-key + static-assets only.

## UNIQUE STYLES

- **`smoke.ts`** hits a running server on `localhost:8917`. Asserts: (1) `/api/health` returns `{ ok: true }`, (2) `/api/examples` lists at least one example, (3) `POST /api/run/support-triage` returns a structured result, (4) unknown example returns 404, (5) bad JSON returns 400. Designed to fail fast on regressions in the request pipeline.
- **`ui-smoke.test.ts`** is a `// @vitest-environment node` test that loads the Vite build artifacts from `dist/` (not JSDOM — that approach was abandoned when the React migration made the static-asset shape too dynamic to mount in JSDOM). It checks: `dist/index.html` exists, `dist/assets/` contains a `.js` + `.css` + `.js.map`, the JS bundle contains `createElement` + a React hook + all 11 V2_EXAMPLE id strings + all 10 renderer-kind strings + 4 graph labels. The test silently throws "No JS bundle found in dist/assets" if you forget to `npm run build` first. Catches: missing example in registry, renderer kind drift, build failure. Misses: runtime crashes, hook bugs, layout regressions, SSE wiring — those need a real browser.
- **`run_evals.py`** is a 3-phase eval: build per-example payloads, hit `POST /api/run/:example`, extract primary text + signal fields (intent / escalated / score / streaming chunk count), write a timestamped JSON to `evals/results-<ts>.json`. The eval is intentionally separate from CI — it's slow (multiple LLM calls per example) and expensive (real key). See `evals/README.md` for the methodology.
- **`launch-with-hermes-key.sh`** is a shell wrapper for setting up `OPENAI_API_KEY` via `cloudflared` and the Hermes API. Referenced by `npm run launch:hermes`. The `trycloudflare.com` URL rotates on every launch; check `LIVE_URL.md` for the current one.
- **`_diag.mjs`** is an ad-hoc diagnostic script (Node ESM). Underscore prefix indicates "tooling, not product". No npm script.

## COMMANDS

```bash
npm run smoke                 # tsx scripts/smoke.ts (server must be running)
npm run test:ui               # vitest run scripts/ui-smoke.test.ts
npm run test:coverage         # vitest with v8 coverage
./scripts/run-evals.sh        # wraps run_evals.py; writes evals/results-<ts>.json
npm run launch:hermes         # ./scripts/launch-with-hermes-key.sh
```

## NOTES

- **Smoke test assumes server is on `:8917`.** Override via `PORT=8917 npm run smoke` if the server is elsewhere. The script does NOT start the server — you must `npm run serve` (or `npm run build && npm run serve`) in another shell first.
- **UI smoke needs `npm run build` first.** It reads from `dist/`, not from source. Forgetting this is the #1 cause of "test failed: No JS bundle found in dist/assets".
- **Eval harness writes timestamped files** to `evals/`. These are committed to the repo as historical artifacts (per `AGENTS.md` "STRUCTURE"). Don't `git rm` them; rename / archive instead if they get noisy.
- **`run_evals.py` is the canonical eval tool.** The `run-evals.sh` wrapper just invokes it with the right env. Edit `run_evals.py` if the eval methodology changes; `run-evals.sh` rarely needs touching.
- **`launch-with-hermes-key.sh` requires `cloudflared`** on PATH. Install via `brew install cloudflared` (macOS) or see Cloudflare's docs. The script assumes `OPENAI_API_KEY` is the Hermes-formatted key (`sk-or-…` for OpenRouter).
- **No scripts are unit-tested.** The intent is that they're small enough to read end-to-end and you run them against a live server when you change them.
