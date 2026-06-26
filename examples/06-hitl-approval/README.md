# Example 06 - Human-in-the-Loop Approval

This example demonstrates Mastra's suspend/resume workflow pattern:

1. A classifier agent extracts amount, urgency, and reasoning from a proposed
   support action.
2. The gate step auto-approves low-risk work, but suspends critical or
   high-value actions.
3. The UI receives a suspend token, shows an approval panel, and resumes the
   workflow through `POST /api/resume/:token`.
4. The execute step either performs the approved action or blocks a rejected
   one.

## Run

```bash
npm run example:06
```

The CLI demo can prove the suspend path, but it cannot resume from only a
token. Use the browser UI to exercise both Approve and Reject.

## What to look for

- Low-risk refunds complete with `auto-approved`.
- Large refunds or account deletions emit a `suspend` trace event.
- Resume requests accept `approved` or `rejected`; missing decisions default
  to `rejected`.
- Suspended runs live in memory and are lost when the server restarts.
