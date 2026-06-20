#!/usr/bin/env bash
# Phase 3 eval harness.
# Runs a fixed topic set against selected examples, captures structured results,
# and prints a summary table. Outputs raw JSON to evals/results-<ts>.json.
set -euo pipefail

BASE="http://localhost:${PORT:-8917}"
TS=$(date +%Y%m%d-%H%M%S)
OUT_DIR="/home/azureuser/workspace/mastra-playground/evals"
mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/results-${TS}.json"

# Topic set: 5 topics hand-picked to differentiate example behaviors
TOPICS=(
  "What is the difference between RAG and fine-tuning?"
  "How do I evaluate whether a small LLM is good enough for my use case?"
  "Explain the Model Context Protocol to a backend engineer in 150 words."
  "What are the best practices for prompt caching in production LLM APIs?"
  "When should I use a multi-agent system vs a single agent with tools?"
)

# Examples to evaluate
EXAMPLES=(research parallel-research critic-loop)

# Initialize results file
echo '{"startedAt":"'$(date -u +%FT%TZ)'","base":"'$BASE'","runs":[' > "$OUT_FILE"
FIRST=1

for example in "${EXAMPLES[@]}"; do
  for topic in "${TOPICS[@]}"; do
    echo "  → $example :: ${topic:0:60}..." >&2

    BODY='{"topic":'$(printf '%s' "$topic" | python3 -c "import sys,json;print(json.dumps(sys.stdin.read()))")
    if [[ "$example" == "critic-loop" ]]; then
      BODY='{"topic":'$(printf '%s' "$topic" | python3 -c "import sys,json;print(json.dumps(sys.stdin.read()))')',"threshold":8,"maxIterations":3}'
    fi

    T0=$(date +%s%3N)
    HTTP_CODE=$(curl -s -o /tmp/eval-resp.json -w '%{http_code}'       -X POST "$BASE/api/run/$example"       -H 'Content-Type: application/json'       -d "$BODY" 2>/dev/null || echo "000")
    T1=$(date +%s%3N)
    DUR_MS=$((T1 - T0))

    if [[ $FIRST -eq 0 ]]; then echo ',' >> "$OUT_FILE"; fi
    FIRST=0

    python3 -c "
import json, sys
try:
    body = json.load(open('/tmp/eval-resp.json'))
except Exception as e:
    body = {'_parse_error': str(e)}
out = body.get('result', {}).get('output', {}) if isinstance(body, dict) else {}
history = out.get('history', []) if isinstance(out, dict) else []
result = {
    'example': '$example',
    'topic': $(printf '%s' "$topic" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))'),
    'httpCode': $HTTP_CODE,
    'durationMs': $DUR_MS,
    'workflowStatus': (body.get('result') or {}).get('status') if isinstance(body, dict) else None,
    'finalScore': out.get('score') if isinstance(out, dict) else None,
    'iterations': out.get('iterations') if isinstance(out, dict) else None,
    'synthesisLen': len(out.get('synthesis') or '') if isinstance(out, dict) else None,
    'formattedLen': len(out.get('formatted') or '') if isinstance(out, dict) else None,
    'draftLen': len(out.get('draft') or '') if isinstance(out, dict) else None,
    'historyScores': [h.get('score') for h in history] if isinstance(history, list) else [],
}
print(json.dumps(result), file=sys.stderr)
print(json.dumps(result), end='')
" 2>>"$OUT_FILE.stderr" >> "$OUT_FILE"
  done
done

echo ']}' >> "$OUT_FILE"
echo "" >> "$OUT_FILE"
echo "Wrote $OUT_FILE" >&2

# Print summary
python3 - <<PYEOF
import json
from collections import defaultdict
runs = json.load(open("$OUT_FILE"))["runs"]
by_ex = defaultdict(list)
for r in runs:
    by_ex[r["example"]].append(r)

print()
print(f"{'example':22s} {'n':>3s} {'ok':>3s} {'avgMs':>7s} {'avgChars':>9s} {'avgIter':>7s} {'avgScore':>9s}")
print("-" * 70)
for ex, lst in by_ex.items():
    ok = sum(1 for r in lst if r["workflowStatus"] == "success")
    avg_ms = sum(r["durationMs"] for r in lst) / len(lst)
    chars = [(r.get("synthesisLen") or r.get("formattedLen") or r.get("draftLen") or 0) for r in lst]
    avg_chars = sum(chars) / len(chars) if chars else 0
    iters = [r["iterations"] for r in lst if r["iterations"] is not None]
    avg_iter = sum(iters) / len(iters) if iters else 0
    scores = [r["finalScore"] for r in lst if r["finalScore"] is not None]
    avg_score = sum(scores) / len(scores) if scores else 0
    print(f"{ex:22s} {len(lst):>3d} {ok:>3d} {avg_ms:>7.0f} {avg_chars:>9.0f} {avg_iter:>7.1f} {avg_score:>9.2f}")
PYEOF
