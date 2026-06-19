# Example 05 — Multi-turn Chat with Memory

**Mastra primitives exercised:** Agent with tools, **explicit conversation history in the prompt**, write-action tool that mutates state.

**What it teaches:** how multi-turn conversation actually works under the hood. Mastra's `Memory` abstraction adds persistence and retrieval on top of this pattern, but the core idea is: *load the prior messages, prepend them to the new message, call the LLM, append the response*.

**Why it matters for InboxPilot:** InboxPilot already passes `messages = await this.messageRepo.listByConversation(...)` to the LLM. This example shows the same pattern explicitly, plus what happens when a tool mutates persistent state (the `escalate_to_human` tool marks the thread as escalated — the UI then shows a badge).

## Run

```bash
npm run example:05
```

## Shape

```
input: { threadId, resourceId, message }
  ↓
chat step:
  - load history from memoryStore
  - append user message
  - call agent with full history as the prompt
  - append assistant response
  - check if escalate_to_human was called (mutates state)
  ↓
output: { threadId, escalated, escalationReason, newUserMessage, newAssistantMessage, allMessages }
```

## What you'll see in the trace

```
step:start  chat           ← LLM call begins
  (if escalate was called:)
  tool:call  escalate_to_human
step:end    chat           ← response received

done                          total: ~800ms
```

The chat step has no branches and no internal sub-steps. The conversation state lives in the memory store, not in the workflow's per-step state.

## Compare to InboxPilot's `AiAgentService`

| InboxPilot step | This example |
|---|---|
| `loadSettings()` | (omitted — hardcoded) |
| `loadConversationHistory()` | `memoryStore.getMessages(threadId)` |
| `getKnowledgeChunks()` | (would be a `lookup_order` tool call inside the step) |
| pre-LLM escalation chain | (omitted — see ex 01) |
| LLM call with history | `agent.generate(promptMessages)` where promptMessages is history + new |
| parse JSON decision | (omitted — free-form text here) |
| audit log | `tracer.emit(...)` |
| persist assistant message | `memoryStore.appendAssistantMessage(...)` |

## What to look for

1. **Send 3 messages in a row** with the same `threadId`. The agent's 3rd response should reference the context from messages 1 and 2. The memory store keeps the full transcript.
2. **Type "I want a manager"** — the agent calls `escalate_to_human`, which marks the thread. The UI shows an "Escalated" badge. Subsequent messages on the same thread return `escalated: true`.
3. **Click "New conversation"** — generates a fresh `threadId`. The memory store starts empty for that thread. The agent has no prior context to reference.
4. **Refresh the page** — the `threadId` is stored in `localStorage`, so the conversation continues.

## Why this isn't using Mastra's `Memory` directly

Mastra's `Memory` class (in `@mastra/core/memory`) requires a `storage` backend (LibSQL, Postgres, Upstash, etc.). For a learning playground with zero setup, that's overkill. Instead, this example:

- Uses a plain `Map<threadId, Message[]>` in `shared/memory-store.ts`
- Loads the messages explicitly in the step's `execute`
- Passes them as the prompt to `agent.generate()`

The same `Memory` interface could be a drop-in replacement: swap the `getMessages` call for `memory.recall({ threadId })`. The agent's prompt composition doesn't change.

## What to look for in the code

- `tools/escalate.ts` — a *write* tool (mutates `memoryStore.markEscalated`). The agent's decision to escalate becomes a side effect.
- `tools/lookup_order.ts` — a *read* tool (returns canned data). Demonstrates how a tool call looks inside the trace.
- `runOne` — accepts a `threadId` and an `action` field (`'new'` | `'clear'` | `'send'`). `'new'` returns a fresh threadId; `'clear'` wipes history; the default processes a turn.
- The trace emits `tool:call` only when `escalate_to_human` was called — a *visual* signal in the UI that the agent made an escalation decision.
