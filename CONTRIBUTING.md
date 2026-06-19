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
npm run serve                  # starts the server on :8917
```

Open <http://localhost:8917> in a browser.

## Useful scripts

| Command                   | What it does                       |
| ------------------------- | ---------------------------------- |
| `npm run typecheck`       | TypeScript type-check (no emit)    |
| `npm run format`          | Format all files with Prettier     |
| `npm run format:check`    | Check formatting without writing   |
| `npm run serve`           | Start the dev server               |
| `npm run health`          | Curl `/api/health`                 |
| `npm run example:01`–`06` | Run a single example as a CLI demo |

## Adding a new example

1. Create `examples/0N-short-name/` with `index.ts` + `README.md`
2. The example must export `async function runOne(input, tracer)` and return
   `{ status, input, output, error, totalMs }`
3. Use `shared/traced-step.ts`'s `stepStart`, `stepEnd`, `llmStructured`,
   `toolCall` to emit trace events the UI can render
4. Register the example in `server/server.ts` `EXAMPLES` map and add a tab in
   `public/index.html` with a `GRAPHS` entry in `public/app.js`
5. Add an `example:0N` script in `package.json`

## Code style

- Prettier is the source of truth. Run `npm run format` before committing.
- TypeScript strict mode. Avoid `as any`. When you have to cast, document why.
- Keep files small. Split a 500-line file before adding more.
- The shared modules in `shared/` are the only files the examples should
  depend on besides `@mastra/core`.

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/).

- `feat: add example 07 — streaming chat`
- `fix: hitl gate selector matches data-node not data-node-id`
- `chore: add .editorconfig and prettier`
- `docs: add troubleshooting section to README`

## Pull requests

- One example per PR
- PR description should link the corresponding `notes/learning-log.md` entry
- All CI checks must pass
