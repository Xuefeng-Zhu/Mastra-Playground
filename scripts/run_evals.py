#!/usr/bin/env python3
"""Phase 3 eval harness.

Runs a fixed topic set against selected examples on a running playground
server, captures structured results, prints a summary table, and writes raw
results to evals/results-<ts>.json.

Usage:
    python3 scripts/run_evals.py                  # default: 3 examples, 5 topics
    python3 scripts/run_evals.py --example critic-loop --topic "..."
"""
from __future__ import annotations
import argparse
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "evals"
OUT_DIR.mkdir(exist_ok=True)

DEFAULT_TOPICS = [
    "What is the difference between RAG and fine-tuning?",
    "How do I evaluate whether a small LLM is good enough for my use case?",
    "Explain the Model Context Protocol to a backend engineer in 150 words.",
    "What are the best practices for prompt caching in production LLM APIs?",
    "When should I use a multi-agent system vs a single agent with tools?",
]

DEFAULT_EXAMPLES = [
    "support-triage",
    "research",
    "code-review",
    "parallel-research",
    "multi-turn-chat",
    "hitl-approval",
    "streaming-chat",
    "critic-loop",
    "multi-agent-handoff",
    "mastra-memory",
    "content-pipeline",
    "guardrail-redaction",
    "plan-and-execute",
]  # All 13 examples. build_payload() handles each one's input shape.


def post_run(base: str, example: str, payload: dict, timeout_s: int = 90) -> tuple[int, float, dict]:
    url = f"{base}/api/run/{example}"
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read().decode("utf-8")
            code = resp.status
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        code = e.code
    except Exception as e:
        return 0, (time.monotonic() - t0) * 1000, {"_transport_error": str(e), "_raw": ""}
    dur_ms = (time.monotonic() - t0) * 1000
    try:
        return code, dur_ms, json.loads(raw)
    except Exception:
        return code, dur_ms, {"_parse_error": raw[:500]}


def build_payload(example: str, topic: str, run_idx: int, threshold: int, max_iters: int) -> dict:
    """Each example has its own input shape. Build it here so the loop stays clean."""
    if example in ("research", "parallel-research", "critic-loop", "content-pipeline"):
        p = {"topic": topic}
        if example == "critic-loop":
            p.update({"threshold": threshold, "maxIterations": max_iters})
        return p
    if example == "plan-and-execute":
        return {"task": topic}
    if example == "support-triage":
        # Topic doubles as the support message; mix it up with run_idx
        return {"message": topic}
    if example == "code-review":
        # Point at a real file in the repo for each topic (round-robin)
        paths = [
            "examples/01-support-triage/index.ts",
            "examples/02-research-agent/index.ts",
            "examples/04-parallel-research/index.ts",
            "examples/08-critic-loop/index.ts",
            "examples/10-content-pipeline/index.ts",
        ]
        return {"path": paths[run_idx % len(paths)]}
    if example == "multi-turn-chat":
        # threadId + resourceId are required; reuse a stable pair so we accumulate context
        return {"threadId": "eval-thread", "resourceId": "eval-user", "message": topic}
    if example == "hitl-approval":
        # Drive different action types across runs to exercise all branches
        action_types = ["refund", "send", "delete"]
        at = action_types[run_idx % len(action_types)]
        return {"action": f"test {at} for {topic[:40]}", "actionType": at}
    if example == "streaming-chat":
        return {"prompt": topic}
    if example == "multi-agent-handoff":
        # Mix refund (delegates) and non-billing (no delegation) across runs
        messages = [
            "Where is my refund for order-1234?",
            "What is the status of order-5678?",
            "How do I reset my password?",
            "What time does support close?",
            "Where is my refund for order-9999?",
        ]
        return {"message": messages[run_idx % len(messages)]}
    if example == "guardrail-redaction":
        return {"message": topic}
    if example == "mastra-memory":
        # Two-turn conversation: set a fact in turn1, ask for it in turn2
        # Each run_idx gets a fresh threadId so memory state doesn't leak between topics
        return {
            "threadId": f"eval-thread-{run_idx}",
            "resourceId": "eval-user",
            "turn1": f"My favorite programming language is {['Rust', 'TypeScript', 'Python', 'Go', 'Elixir'][run_idx % 5]}.",
            "turn2": "What programming language did I say is my favorite?",
        }
    # Default fallback — let the server validate
    return {"topic": topic}


# Per-example "primary text" extraction. The summary table's avgChars column uses
# this to compare apples to apples across heterogeneous output shapes.
PRIMARY_TEXT_FIELD = {
    "research": "formatted",
    "parallel-research": "synthesis",
    "critic-loop": "draft",
    "content-pipeline": "edited",
    "support-triage": "summary",   # nested in output.triage.summary
    "code-review": "review",
    "multi-turn-chat": "newAssistantMessage",  # dict; we measure content
    "hitl-approval": "message",
    "streaming-chat": "finalText",
    "multi-agent-handoff": "specialistResponse",
    "mastra-memory": "turn2",  # dict with .output — measure inner text
    "content-pipeline": "edited",
    "guardrail-redaction": "answer",
    "plan-and-execute": "answer",
}


def measure(result_body: dict, example: str) -> dict:
    """Pull the salient numbers out of a run response, regardless of example shape."""
    out: dict = {}
    if not isinstance(result_body, dict):
        return out
    r = result_body.get("result") or {}
    out["workflowStatus"] = r.get("status")
    out["errorPresent"] = bool(r.get("error"))
    payload = r.get("output") or {}
    if not isinstance(payload, dict):
        return out

    # Common numeric fields
    for k in ("score", "iterations", "threshold"):
        if k in payload:
            out[k] = payload[k]

    # Primary text length — used for the avgChars column
    primary = PRIMARY_TEXT_FIELD.get(example)
    primary_chars = 0
    if primary:
        # Support-triage stores the summary inside output.triage.summary (nested)
        if example == "support-triage":
            triage = payload.get("triage")
            if isinstance(triage, dict):
                v = triage.get(primary)
                primary_chars = len(v) if isinstance(v, str) else 0
        else:
            v = payload.get(primary)
            if isinstance(v, str):
                primary_chars = len(v)
            elif isinstance(v, dict) and "content" in v:
                primary_chars = len(v["content"]) if isinstance(v["content"], str) else 0
    out["primaryChars"] = primary_chars

    # Length fields (legacy — still captured for backward compat with existing reports)
    for k in ("synthesis", "formatted", "draft", "edited", "summary", "review", "message",
              "specialistResponse", "finalText", "response_text"):
        v = payload.get(k)
        if isinstance(v, str):
            out[f"{k}Len"] = len(v)

    # Critic-loop specific
    hist = payload.get("history")
    if isinstance(hist, list):
        out["historyScores"] = [h.get("score") for h in hist if isinstance(h, dict)]
        out["iterations"] = len(hist)
        if out["historyScores"]:
            out["scoreMin"] = min(out["historyScores"])
            out["scoreMax"] = max(out["historyScores"])

    # Example-specific extras
    if example == "support-triage":
        triage = payload.get("triage")
        if isinstance(triage, dict):
            out["triageIntent"] = triage.get("intent")
            out["triageConfidence"] = triage.get("confidence")
            out["triageRequiresHuman"] = triage.get("requires_human")
    if example == "code-review":
        out["issueCount"] = payload.get("issueCount")
        out["action"] = payload.get("action")
    if example == "hitl-approval":
        out["decision"] = payload.get("decision")
        out["escalated"] = payload.get("executed") is False
    if example == "multi-agent-handoff":
        out["delegated"] = payload.get("delegated")
        out["agentPath"] = payload.get("agentPath")
    if example == "streaming-chat":
        deltas = payload.get("deltas")
        if isinstance(deltas, list):
            out["deltaCount"] = len(deltas)
    if example == "multi-turn-chat":
        new_msg = payload.get("newAssistantMessage")
        if isinstance(new_msg, dict):
            out["assistantMsgLen"] = len(new_msg.get("content") or "")
        out["escalated"] = payload.get("escalated")
    if example == "mastra-memory":
        out["recalled"] = payload.get("recalled")
        out["historyLength"] = payload.get("historyLength")
        # Also pull the turn2 reply text length so the table gets a comparable number
        turn2 = payload.get("turn2")
        if isinstance(turn2, dict) and isinstance(turn2.get("output"), str):
            out["primaryChars"] = len(turn2["output"])
    if example == "guardrail-redaction":
        out["action"] = payload.get("action")
        guardrail = payload.get("guardrail")
        if isinstance(guardrail, dict):
            out["risk"] = guardrail.get("risk")
    if example == "plan-and-execute":
        out["totalSteps"] = payload.get("totalSteps")

    return out


def run(base: str, examples: list[str], topics: list[str], threshold: int, max_iters: int) -> list[dict]:
    runs = []
    total = len(examples) * len(topics)
    n = 0
    for example in examples:
        for i, topic in enumerate(topics):
            n += 1
            payload = build_payload(example, topic, i, threshold, max_iters)
            code, dur_ms, body = post_run(base, example, payload)
            meas = measure(body, example)
            runs.append({
                "n": n,
                "example": example,
                "topic": topic,
                "topicShort": topic[:60],
                "httpCode": code,
                "durationMs": round(dur_ms, 1),
                "inputPayload": payload,
                **meas,
            })
            sys.stderr.write(
                f"  [{n:>2d}/{total}] {example:18s} {dur_ms:6.0f}ms  "
                f"status={meas.get('workflowStatus')}  "
                f"primaryChars={meas.get('primaryChars', 0)}  "
                f"score={meas.get('score')}\n"
            )
    return runs


def summarize(runs: list[dict]) -> str:
    by_ex: dict[str, list[dict]] = defaultdict(list)
    for r in runs:
        by_ex[r["example"]].append(r)
    lines = []
    lines.append("")
    lines.append(
        f"{'example':22s} {'n':>3s} {'ok':>3s} {'avgMs':>7s} {'p95Ms':>7s} {'avgChars':>9s} {'avgIter':>7s} {'avgScore':>9s}"
    )
    lines.append("-" * 75)
    for ex, lst in by_ex.items():
        ok = sum(1 for r in lst if r["workflowStatus"] == "success")
        durs = sorted(r["durationMs"] for r in lst)
        avg_ms = statistics.mean(durs)
        p95 = durs[max(0, int(len(durs) * 0.95) - 1)]
        # primaryChars is the apples-to-apples text-length measure across examples
        chars = [r.get("primaryChars", 0) for r in lst]
        avg_chars = statistics.mean(chars) if chars else 0
        iters = [r["iterations"] for r in lst if r.get("iterations") is not None]
        avg_iter = statistics.mean(iters) if iters else 0
        scores = [r["score"] for r in lst if r.get("score") is not None]
        avg_score = statistics.mean(scores) if scores else 0
        lines.append(
            f"{ex:22s} {len(lst):>3d} {ok:>3d} {avg_ms:>7.0f} {p95:>7.0f} {avg_chars:>9.0f} {avg_iter:>7.1f} {avg_score:>9.2f}"
        )
    return "\n".join(lines)


def per_example_insights(runs: list[dict]) -> str:
    """Print the example-specific signals that the generic table can't show."""
    by_ex: dict[str, list[dict]] = defaultdict(list)
    for r in runs:
        by_ex[r["example"]].append(r)
    out = ["", "Per-example signals:"]
    for ex, lst in by_ex.items():
        if ex == "critic-loop":
            trajectories = [" ".join(str(s) for s in r.get("historyScores") or []) for r in lst]
            out.append(f"  critic-loop trajectories: {trajectories}")
        elif ex == "support-triage":
            intents = [r.get("triageIntent") for r in lst]
            confidences = [r.get("triageConfidence") for r in lst if r.get("triageConfidence") is not None]
            escalated = sum(1 for r in lst if r.get("triageRequiresHuman"))
            avg_conf = statistics.mean(confidences) if confidences else 0
            out.append(f"  support-triage intents: {intents}  avg confidence={avg_conf:.2f}  escalated={escalated}/{len(lst)}")
        elif ex == "code-review":
            actions = [r.get("action") for r in lst]
            issue_counts = [r.get("issueCount") for r in lst if r.get("issueCount") is not None]
            out.append(f"  code-review actions: {actions}  issue counts: {issue_counts}")
        elif ex == "hitl-approval":
            decisions = [r.get("decision") for r in lst]
            out.append(f"  hitl-approval decisions: {decisions}")
        elif ex == "multi-agent-handoff":
            delegated = sum(1 for r in lst if r.get("delegated"))
            paths = [r.get("agentPath") for r in lst]
            out.append(f"  multi-agent-handoff: delegated={delegated}/{len(lst)}  agentPaths={paths}")
        elif ex == "streaming-chat":
            delta_counts = [r.get("deltaCount") for r in lst if r.get("deltaCount") is not None]
            out.append(f"  streaming-chat delta counts: {delta_counts}")
        elif ex == "multi-turn-chat":
            assistant_lens = [r.get("assistantMsgLen") for r in lst if r.get("assistantMsgLen") is not None]
            escalated = sum(1 for r in lst if r.get("escalated"))
            out.append(f"  multi-turn-chat assistant msg lengths: {assistant_lens}  escalated={escalated}/{len(lst)}")
        elif ex == "mastra-memory":
            recalled = sum(1 for r in lst if r.get("recalled") if r.get("recalled") is not None)
            history_lens = [r.get("historyLength") for r in lst if r.get("historyLength") is not None]
            out.append(f"  mastra-memory: recalled={recalled}/{len(lst)}  historyLengths={history_lens}")
        elif ex == "guardrail-redaction":
            actions = [r.get("action") for r in lst]
            risks = [r.get("risk") for r in lst]
            out.append(f"  guardrail-redaction actions: {actions}  risks={risks}")
        elif ex == "plan-and-execute":
            steps = [r.get("totalSteps") for r in lst if r.get("totalSteps") is not None]
            out.append(f"  plan-and-execute total steps: {steps}")
    return "\n".join(out)


def critic_score_distribution(runs: list[dict]) -> str:
    crit = [r for r in runs if r["example"] == "critic-loop"]
    if not crit:
        return ""
    lines = ["", "Critic-loop score trajectory (per topic, ordered by iteration):"]
    for r in crit:
        scores = r.get("historyScores") or []
        traj = " → ".join(f"{s}" for s in scores)
        lines.append(f"  - {r['topicShort'][:55]:55s} {traj}")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=f"http://localhost:{os.environ.get('PORT', '8917')}")
    ap.add_argument("--example", action="append", help="repeat to filter examples")
    ap.add_argument("--topic", action="append", help="repeat to add topics")
    ap.add_argument("--threshold", type=int, default=8)
    ap.add_argument("--max-iterations", type=int, default=3)
    args = ap.parse_args()

    examples = args.example or DEFAULT_EXAMPLES
    topics = args.topic or DEFAULT_TOPICS

    print(f"Running eval: {len(examples)} example(s) × {len(topics)} topic(s) = {len(examples)*len(topics)} runs")
    print(f"  base: {args.base}")
    print(f"  threshold={args.threshold} maxIter={args.max_iterations}")
    print()

    runs = run(args.base, examples, topics, args.threshold, args.max_iterations)

    print(summarize(runs))
    print(per_example_insights(runs))
    print(critic_score_distribution(runs))

    ts = time.strftime("%Y%m%d-%H%M%S")
    out_file = OUT_DIR / f"results-{ts}.json"
    payload = {
        "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "base": args.base,
        "threshold": args.threshold,
        "maxIterations": args.max_iterations,
        "examples": examples,
        "topics": topics,
        "runs": runs,
    }
    temp_file = out_file.with_suffix(".json.tmp")
    temp_file.write_text(json.dumps(payload, indent=2) + "\n")
    temp_file.replace(out_file)
    print(f"\nWrote {out_file}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
