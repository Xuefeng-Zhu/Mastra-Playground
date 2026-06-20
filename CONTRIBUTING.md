# Contributing

This is a small, focused learning project. Contributions should keep it that
way. If you're adding a new example, prefer **less than 200 lines per
example** and reuse the shared helpers in `shared/`.

## Running the playground

```bash
nvm use                        # use Node 22
npm install
cp .env.example .env
# edit .env — add OPENAI_API_KEY (or OpenRouter key)
npm run build                  # Vite build → dist/ (the server reads from here)
npm run serve                  # starts the server on :8917
```

Open <http://localhost:8917> in a browser.

For development with HMR on the React UI, run `npm run dev` (Vite at :5173)
in addition to `npm run serve`.

## Useful scripts

| Command                   | What it does                                  |
| ------------------------- | --------------------------------------------- |
| `npm run typecheck`       | TypeScript type-check (no emit)               |
| `npm run format`          | Format all files with Prettier                |
| `npm run format:check`    | Check formatting without writing              |
| `npm run serve`           | Start the dev server (port 8917)              |
| `npm run health`          | Curl `/api/health`                            |
| `npm run build`           | Vite build → `dist/` (server reads from here) |
| `npm run dev`             | Vite dev server (HMR, port 5173)              |
| `npm run preview`         | Vite preview of the production build          |
| `npm run example:01`–`11` | Run a single example as a CLI demo            |
| `npm run smoke`           | End-to-end smoke against running server       |
| `npm test`                | Vitest run (shared/ + scripts/)               |

## Adding a new example

1. Create `examples/0N-short-name/` with `index.ts` + `README.md`
2. The example must export `async function runOne(input, tracer)` and return
   `{ status, input, output, error, totalMs }`
3. Use `shared/traced-step.ts`'s `stepStart`, `stepEnd`, `llmStructured`,
   `toolCall`, `branchEvaluate`, `timed` to emit trace events the React UI can
   render. **Do not bypass these with raw `tracer.emit` calls** — they exist
   for grep-ability.
4. At the bottom of `runOne()`, call `finalizeRunResult(result, tracer, t0, input)`
   from `shared/run-result.ts` to emit the terminal `done` event and shape
   the return value. (Ex 06's suspend path is bespoke — keep its custom tail.)
5. Use `resolveModel(input.model)` from `shared/llm.ts` to pick the LLM.
6. Use `runCliExample(name, demo)` + `isMain(import.meta.url, process.argv[1])`
   from `shared/cli-bootstrap.ts` for the CLI demo block.
7. Register the example in `server/server.ts` `EXAMPLES` map AND add a
   `case` to `validateExampleInput()` — falling through `default: return body`
   means accepting any garbage.
8. Add the example to `src/registry/examples.ts` (`V2_EXAMPLES`) with form
   fields, graph, output kind, run label. If the new output kind is novel,
   add a renderer branch in `src/registry/renderers.tsx` and update the
   `OutputKind` union.
9. Add an `example:0N` script in `package.json`.

## Code style

- Prettier is the source of truth. Run `npm run format` before committing.
- TypeScript strict mode. Avoid `as any`. When you have to cast, document why.
- Keep files small. Split a 500-line file before adding more.
- The shared modules in `shared/` are the only files the examples should
  depend on besides `@mastra/core`.
- Each example should be under 200 lines if possible, never above 350.

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/).

- `feat: add example 07 — streaming chat`
- `fix: hitl gate selector matches data-node not data-node-id`
- `chore: add .editorconfig and prettier`
- `docs: add troubleshooting section to README`
- `refactor(shared): extract finalizeRunResult from example tail blocks`

## Pull requests

- One example per PR
- PR description should link the corresponding `notes/learning-log.md` entry
- All CI checks must pass (format:check, typecheck, build, static-asset smoke)
