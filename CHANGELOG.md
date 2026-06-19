# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

## [0.1.0] — 2026-06-19

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

[Unreleased]: https://github.com/your-org/mastra-playground/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/your-org/mastra-playground/releases/tag/v0.1.0
