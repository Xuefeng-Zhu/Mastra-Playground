#!/usr/bin/env bash
# Launch the mastra-playground server with OPENROUTER_API_KEY
# pulled from the uncommented line in ~/.hermes/.env (line 476).
# Does NOT print the key value.
set -euo pipefail

ENV_FILE="$HOME/.hermes/.env"

# Find the uncommented OPENROUTER_API_KEY= line
KEY_LINE=$(grep -nE '^[^#]*OPENROUTER_API_KEY=' "$ENV_FILE" | tail -1 || true)
if [[ -z "$KEY_LINE" ]]; then
  echo "ERROR: no uncommented OPENROUTER_API_KEY found in $ENV_FILE" >&2
  exit 1
fi

# Extract just the value (everything after the first = on that line), strip surrounding quotes/whitespace
KEY_VALUE=$(printf '%s' "$KEY_LINE" | sed -E 's/^[0-9]+:OPENROUTER_API_KEY=//' | tr -d '"' | tr -d "'" | xargs)

if [[ -z "$KEY_VALUE" ]]; then
  echo "ERROR: parsed empty key" >&2
  exit 1
fi

# Sanity check: real OpenRouter keys start with sk-or- or sk-
if [[ "$KEY_VALUE" != sk-* ]]; then
  echo "ERROR: parsed key does not look like an OpenRouter key (does not start with sk-)" >&2
  exit 1
fi

# Export for the playground server. The server reads OPENAI_API_KEY and OPENAI_BASE_URL.
export OPENAI_API_KEY="$KEY_VALUE"
export OPENAI_BASE_URL="https://openrouter.ai/api/v1"
export OPENAI_MODEL="openrouter/free"
export PORT=8917
export NODE_ENV=development

cd /home/azureuser/workspace/mastra-playground

echo "Launching mastra-playground server with OpenRouter key (len=${#KEY_VALUE})" >&2
exec npx tsx server/server.ts
