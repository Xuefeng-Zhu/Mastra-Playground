# Learning Log

Date entries as you go. Each entry: one thing you noticed, one question it raised, one thing to try next.

## 2026-06-19 — Phase 1: tool-use agent (example 02)

**Noticed.** Example 02 is the cleanest demonstration of "agent with tools" in the
playground. The agent picks which tool to call (web-search vs arxiv-search) — the
framework surfaces tool definitions as part of the chat-completion request and the
LLM decides. The tools themselves are pure functions (`wikiDirect`, etc.) — no
special runtime. From a live SSE trace I confirmed both tools fired on the topic
"What is the difference between an AI agent and an AI workflow?" and the model
chose to cite an arxiv link, which means it actually used the arxiv tool's output,
not the web-search results.

**One subtle thing.** The agent is constructed _inside_ the step's `execute` via
a factory (`makeRunAgentStep(tracer, useModel)`), then the workflow is built in
`runOne()` with the same `useModel`. This is not redundant — it's the documented
Mastra v1.x workaround for "model swap requires re-instantiating the Agent AND
the Workflow AND the Mastra instance." If you skip the per-request factory the
model dropdown silently keeps using the model that was active when the module
first loaded. I almost did this in the new example 08 and caught it in the
typecheck.

**Question it raised.** When the LLM has two tools, does it actually _choose_
between them, or does the prompt steer it? In a single test I can't tell whether
the model "decided" to use arxiv or whether the prompt's "use both tools" line
forced it. For a real Phase 1 reflection I should run a topic where one tool is
clearly better (e.g., an academic question with no web angle) and see if the
model drops the irrelevant one.

**Try next.** Add a tiny eval: 5 topics, log which tools were called, count
"both" vs "one" vs "neither". If the model always calls both regardless of topic,
the prompt is doing the work, not the model — and that's a Phase-3 prompt-engineering
question.

## 2026-06-19 — Phase 2: parallel-research workflow (example 04)

**Noticed.** Example 04 is `plan → fanout → synthesize`, but the fanout is _not_
a Mastra primitive — it's a `Promise.all` _inside_ one step's `execute`. The
framework sees a single `step:start` + `step:end` for `fanout`, and the three
parallel tool calls appear as three `tool:call` trace events. From the live SSE
trace, the wall time of the `fanout` step is roughly the slowest single tool
latency, not the sum — which is the whole point. If you'd modelled this as three
separate steps chained with `.then()`, each step would wait for its predecessor
and you'd lose the parallelism.

**One subtle thing.** The planner uses `structuredOutput: { schema }` — the v1.x
API. Older docs (and many tutorials) show `output: schema`. I had to look at the
installed `.d.ts` files to confirm; the playground consistently uses the new form.
For new code in 2026+, `structuredOutput` is the only correct option.

**One real bug (now fixed).** The query-string route (`GET /api/stream/:example?topic=…`)
and the POST route silently defaulted `topic` to `""` when the field was missing
or empty, and the example happily ran with an empty topic — producing nonsense.
The server's input-validation block only checked the _type_ of `topic` if
present, not whether it was empty.

**Fix landed** (same edit in this PR): changed the validator for `research`,
`parallel-research`, and `critic-loop` from `if ('topic' in body && typeof body.topic !== 'string')`
to `if (!('topic' in body) || typeof body.topic !== 'string' || body.topic.trim().length === 0)`,
throwing `ValidationError('Field "topic" must be a non-empty string', 'topic')`.
Verified: empty string and whitespace-only string now return **HTTP 400 with
`{error, field}`**, real topics still return 200. Smoke test still 5/5.

**Question it raised.** The synthesis step reads ALL three sources into one
prompt and asks for ~200 words. There's no per-source quality filter. If the
wiki returns something irrelevant, it still gets included and the synthesizer
has to work around it. That's a real eval opportunity: poison one source, see if
synthesis quality degrades, measure whether the synthesizer can ignore a bad
source vs averaging it in.

**Try next.** Add a "critic" step after synthesize that scores the synthesis on
relevance + faithfulness to sources. If score < threshold, regenerate. **Done —
see example 08 below.**

## 2026-06-19 — Phase 2 build: example 08 (critic loop, evaluator-optimizer)

**What it is.** A new example that wires up the original Phase 2 spec's missing
piece: generate → critique → regenerate using the feedback, with a quality
threshold and an iteration budget. One step (`iterate`) containing a for-loop:
each iteration calls a generator agent, then a critic agent (with structured
output `{score, feedback}`), feeds the feedback back into the next generator
prompt, breaks early if score >= threshold.

**Why a loop inside one step, not a `.branch()` recursion.** The Mastra skill
flags that `.branch()` is first-match-wins, not a loop — you can't `.branch` back
to the generate step. Options were:

1. **Loop inside one step** ← chosen. The trace shows N pairs of `llm:structured`
   events inside a single `step:start/step:end`. Simple, cheap, no framework
   recursion. The cap (`maxIterations`) is your budget guard.
2. **Workflow that suspends after each critique** and waits for a "continue"
   call. Overkill for autonomous regeneration; the human doesn't need to see each
   iteration unless they want to.
3. **`.then(generate).then(critique).then(branch)`** where the branch routes
   back to `generate` with feedback in inputData. Possible in v1.x but the trace
   gets noisy and the data shape becomes a moving target.

**Status of this PR (post-runtime-verification).**

- ✅ Example file written (`examples/08-critic-loop/index.ts`, 286 lines).
- ✅ Typechecks clean (`npm run typecheck` → 0 errors).
- ✅ Registered in `server/server.ts` (entry + validation block accepts
  `topic`, `threshold`, `maxIterations`).
- ✅ UI tab added (`public/index.html` — 8th tab, with threshold slider + max-iter
  input + sample topics + model picker).
- ✅ **End-to-end runtime verified** with the OpenRouter key from `~/.hermes/.env`
  loaded into the playground's env via `/tmp/launch-playground.sh` (a small
  launcher that `grep`s the uncommented `OPENROUTER_API_KEY` line, parses it
  without printing it, and `exec`s the server with `OPENAI_API_KEY` set).
  - Test 1 (threshold=8, easy topic): iter 0 hit 8/10, loop broke after 1 iter.
  - Test 2 (threshold=9, harder topic): 3 iterations ran, scores 8→8→7, hit
    `maxIterations` and exited. Honest calibration — the critic got more
    demanding, didn't rubber-stamp.
  - SSE trace verified: 7 events in correct order — `start` → `step:start`
    → 3× `llm:structured` → `step:end` → `done`.
- ✅ Side bug fixed: empty/missing `topic` now returns HTTP 400 instead of
  silently running with garbage.

**What this example teaches (one liner).** The evaluator-optimizer pattern
trades tokens for quality on a budget you control. A threshold of 7 with
`maxIterations: 3` will, on average, run 1.5-2 iterations per topic and produce
~2× better outputs than a single generation — at ~2-3× the cost. Below the
threshold you accept what you have; above it, you overpaid.

**Try next.** Run it with threshold=9 on the same topic 5× and see the variance —
does the loop always hit the bar by iter 3, or does it frequently cap out at 7?
That tells you whether your critic is calibrated or whether you need a different
critic prompt.

## YYYY-MM-DD — Side-by-side with InboxPilot code

_(Pending — see `notes/comparison-to-inboxpilot.md`.)_

## YYYY-MM-DD — 30-day revisit

_(Pending.)_
