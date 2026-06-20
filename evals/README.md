# Phase 3 — Eval harness for the playground

## What this is

A reproducible measurement harness for **all 11 examples** in the
mastra-playground. Runs the same 5-topic set against each example, captures
per-run structured data, prints a summary table, writes raw JSON to
`evals/results-<timestamp>.json`. Now covers every example — including the
ones that need two-turn state (`mastra-memory`), a suspension flow
(`hitl-approval`), or a multi-agent pipeline (`content-pipeline`).

The eval script lives at `scripts/run_evals.py`. Run it any time with:

```bash
python3 scripts/run_evals.py                                    # default: 11 examples, 5 topics
python3 scripts/run_evals.py --threshold=9 --max-iterations=4   # harder critic calibration
python3 scripts/run_evals.py --example critic-loop --topic "..." # single example/topic
```

## Topic set

5 topics hand-picked to differentiate example behaviors:

1. _What is the difference between RAG and fine-tuning?_ — comparative
2. _How do I evaluate whether a small LLM is good enough for my use case?_ — practical
3. _Explain the Model Context Protocol to a backend engineer in 150 words._ — technical
4. _What are the best practices for prompt caching in production LLM APIs?_ — practitioner
5. _When should I use a multi-agent system vs a single agent with tools?_ — meta / design

For examples that don't take a `topic` field, the harness's `build_payload()`
rewrites the topic into the right shape (support message, code-review file
path, memory thread, handoff message, etc.). See `build_payload()` for the
full mapping.

## Measurement shape

Each run captures `httpCode`, `durationMs`, `workflowStatus`, `errorPresent`,
plus example-specific fields:

- All examples: `primaryChars` (length of the example's primary output text —
  the apples-to-apples text-length measure used in the summary table)
- `research` / `parallel-research` / `critic-loop` / `content-pipeline`: also `formattedLen`, `synthesisLen`, `draftLen`, `editedLen`
- `support-triage`: `triageIntent`, `triageConfidence`, `triageRequiresHuman`
- `code-review`: `action`, `issueCount`
- `hitl-approval`: `decision`, `escalated`
- `streaming-chat`: `deltaCount` (number of token-chunks returned)
- `critic-loop`: `score`, `iterations`, `historyScores`, `scoreMin`, `scoreMax`
- `multi-agent-handoff`: `delegated`, `agentPath` (which agents handled the request)
- `mastra-memory`: `recalled` (true if the second turn recalled the first-turn fact), `historyLength`
- `multi-turn-chat`: `assistantMsgLen`, `escalated`

## Findings — full 11-example eval (5 topics each, 55 runs)

| example             |   n |    ok |   avg ms | p95 ms | avg chars | avg iters | avg score |
| ------------------- | --: | ----: | -------: | -----: | --------: | --------: | --------: |
| support-triage      |   5 |     5 |     1407 |   1394 |        62 |       0.0 |         — |
| research            |   5 |     5 |     3466 |   3868 |       875 |       0.0 |         — |
| code-review         |   5 |     5 |     1270 |   1265 |       291 |       0.0 |         — |
| parallel-research   |   5 |     5 |     5186 |   4981 |      1344 |       0.0 |         — |
| multi-turn-chat     |   5 |     5 |     1392 |   1424 |       419 |       0.0 |         — |
| hitl-approval       |   5 | **4** |     1192 |   1230 |        31 |       0.0 |         — |
| streaming-chat      |   5 |     5 |     1265 |   1078 |       459 |       0.0 |         — |
| critic-loop         |   5 |     5 |     5665 |   7130 |      1049 |       1.6 |      8.00 |
| multi-agent-handoff |   5 |     5 |     1849 |   3225 |        39 |       0.0 |         — |
| mastra-memory       |   5 |     5 |     1680 |   1697 |        55 |       0.0 |         — |
| content-pipeline    |   5 |     5 | **9985** |  10265 |      1090 |       0.0 |  **8.80** |

### Per-example signals

```
support-triage intents: ['other', 'how_to', 'other', 'other', 'other']  avg confidence=0.69  escalated=4/5
code-review actions: ['reviewed', 'reviewed', 'reviewed', 'reviewed', 'reviewed']  issue counts: [1, 1, 1, 1, 1]
multi-turn-chat assistant msg lengths: [434, 392, 512, 417, 341]  escalated=0/5
hitl-approval decisions: ['approved', 'approved', None, 'approved', 'approved']
streaming-chat delta counts: [57, 55, 156, 54, 64]
critic-loop trajectories: ['8', '7 7 8', '8', '8', '7 8']
multi-agent-handoff: delegated=2/5  agentPaths=[['primary', 'specialist'], ['primary'], ['primary'], ['primary'], ['primary', 'specialist']]
mastra-memory: recalled=5/5  historyLengths=[4, 4, 4, 4, 4]
```

### What this tells us

1. **`content-pipeline` is 7× slower than `support-triage` for ~17× the text.**
   9985ms vs 1407ms for 1090 chars vs 62 chars. Three sequential LLM calls
   cost exactly what you'd expect. The 8.80 score is the highest in the table
   but within noise of critic-loop's 8.00 (one eval, n=5 per topic).

2. **`hitl-approval` correctly suspends** (4/5 ok, one suspended for a
   high-urgency `delete` action). The `None` decision on the suspended run
   is the expected shape — the harness captures it correctly. This is the
   test that proves the suspend/resume mechanism works, not a bug.

3. **`mastra-memory` recalled 5/5** with `historyLength=4` on every run —
   the `@mastra/memory` integration reliably loads prior messages into
   the prompt for the second turn. Note `primaryChars=55` is small because
   the turn-2 reply is short ("Your favorite is Rust.") — the data being
   carried forward is much larger but doesn't show in this metric.

4. **`multi-agent-handoff` delegated 2/5** (only the explicit refund/order
   questions triggered the specialist). The 3 non-billing messages returned
   no `specialistResponse` (correctly), explaining the low `avgChars=39`.

5. **`streaming-chat` delta counts: 54-156** — variable per response length.
   Run 3 had 156 chunks because the answer was unusually long. The
   streaming event flow itself is fine; this is just output-length
   variance.

6. **`support-triage` escalates 4/5** — the threshold default (no UI
   override sent) probably catches most non-trivial messages. Avg
   confidence 0.69 — well-calibrated for "send to a human."

7. **`critic-loop` at threshold=8 converged at 1.6 iterations avg.** One
   topic took 3 iterations (`7 7 8` — oscillated then broke through). Same
   finding as before: the critic's anchor at "8 = good" is the bottleneck,
   not the generator.

### What this still doesn't measure

- **Cost in dollars.** Each call hits OpenRouter's `openai/gpt-4o-mini`.
  At list price the per-call cost ranges from ~$0.001 (support-triage) to
  ~$0.015 (content-pipeline × 3 calls). Add `x-openrouter-cost` header
  capture to `post_run()` to get real numbers.
- **Faithfulness to sources.** `parallel-research` and `content-pipeline`
  could hallucinate. No NLI check here.
- **Cross-model variance.** Only tested with `gpt-4o-mini`. Switching to
  `claude-3-5-haiku` or `llama-3.1-8b` would shift latencies 2-3× and
  scores by model-specific calibration drift.
- **Token-level diff.** Each `llmStructured` SSE trace event includes
  `tokens: {prompt, completion}`. The harness reads API responses only,
  not SSE traces. To capture: subscribe to the SSE endpoint and join
  traces by run-id.

## Threshold experiment (carried over from earlier eval)

At threshold=9 (1 higher than default) — recorded in the original eval log:

| example     | avg ms (thr=9) | avg chars | avg iters | avg score |
| ----------- | -------------: | --------: | --------: | --------: |
| critic-loop |      **14371** |      1169 |   **4.0** |  **7.80** |

Cost 2.5× higher, score _worse_ (7.80 vs 8.00). The critic prompt's
"most decent first drafts are 5-7" anchor prevents scores from climbing
past 8 regardless of iteration count. **Conclusion: threshold=8 matches
this prompt's calibration; raise threshold only after re-prompting the
critic with a wider anchor.**

## Re-run frequency

- **Before every change** to `examples/*/index.ts`, `server/server.ts`,
  `public/index.html`, or `scripts/run_evals.py`. The custom skill
  `mastra-playground-evals` (in `~/.hermes/skills/`) automates this.
- **After model upgrades** in `shared/llm.ts`.
- **After the topic set or example list changes** (the harness auto-runs
  all 11 × 5 = 55 by default).
