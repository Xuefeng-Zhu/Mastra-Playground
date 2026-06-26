# Example 09 - Multi-Agent Handoff

This example demonstrates a primary-agent-to-specialist handoff:

1. The primary support agent receives the customer message.
2. Billing/refund questions call `transfer_to_billing_specialist`.
3. The specialist agent can call its narrower `lookup_refund` tool.
4. The primary agent relays the specialist response back to the user.

The point is scope control: the primary agent decides whether to delegate,
while the specialist owns the narrower billing context and tool set.

## Run

```bash
npm run example:09
```

## What to look for

- Refund/order messages should set `delegated: true` and show an
  `agentPath` of `["primary", "specialist"]`.
- Non-billing messages should stay on the primary agent.
- Mock refund data exists for `order-1234`, `order-5678`, and `order-9999`.
