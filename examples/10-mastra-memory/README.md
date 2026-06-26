# Example 10 - Mastra Memory

This example uses the real `@mastra/memory` `Memory` class instead of the
hand-rolled store from Example 05.

The workflow sends two turns through the same `threadId` and `resourceId`.
Turn 1 plants a fact, then turn 2 asks the model to recall it. Memory is backed
by `InMemoryStore`, so it works without extra services but is lost on restart.

## Run

```bash
npm run example:10
```

## Inputs

- `threadId` - required conversation identifier.
- `resourceId` - optional user/tenant identifier, default `playground-user`.
- `turn1` - optional setup message.
- `turn2` - optional recall question.

## What to look for

- Both turns share the same Mastra memory options.
- The output includes `recalled` and `historyLength` as quick inspection aids.
- This is still a learning setup; use a persistent Mastra storage adapter for
  durable production memory.
