# Example 12 — Guardrail + Redaction Workflow

This example demonstrates a hybrid safety pattern:

- deterministic workflow redaction runs before any LLM receives the message;
- an LLM classifies the redacted request against a small guardrail policy;
- a branch either blocks the request or lets a responder answer;
- the responder agent also uses Mastra's native `PIIDetector` as input and
  output processors for defense-in-depth.

The user message may contain emails, phone numbers, SSNs, credit-card-like
numbers, or API-key-like strings. The workflow replaces those values with
placeholders such as `[EMAIL_1]` and only exposes detection counts.

## Run

```bash
npm run example:12
```

## What to look for

- The `redact` step emits only placeholders and counts.
- The `classify` step receives the redacted message, not the raw input.
- The `branch.guardrail` decision controls whether `block` or `respond` runs.
- The responder agent is protected by `PIIDetector` processors even though the
  workflow already redacted the message.
