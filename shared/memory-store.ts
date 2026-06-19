/**
 * In-memory conversation store.
 *
 * For the playground, this is a Map. For production (InboxPilot),
 * this would be a DB table (e.g. messages + conversations in Postgres).
 *
 * Lesson: Mastra's Memory abstraction is real, but for a learning playground
 * we want the *interface* (getMessages / appendUserMessage / etc.) to be the
 * focus, not the storage engine. Swapping this Map for a SQL-backed store
 * is a 2-line change.
 */

export type Message = {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
};

export type ThreadState = {
  threadId: string;
  messages: Message[];
  escalated: boolean;
  escalationReason?: string;
};

const threads = new Map<string, ThreadState>();

export const memoryStore = {
  getOrCreate(threadId: string): ThreadState {
    let t = threads.get(threadId);
    if (!t) {
      t = { threadId, messages: [], escalated: false };
      threads.set(threadId, t);
    }
    return t;
  },

  getMessages(threadId: string): Message[] {
    return this.getOrCreate(threadId).messages;
  },

  appendUserMessage(threadId: string, content: string): Message {
    const t = this.getOrCreate(threadId);
    const msg: Message = { role: 'user', content, ts: Date.now() };
    t.messages.push(msg);
    return msg;
  },

  appendAssistantMessage(threadId: string, content: string): Message {
    const t = this.getOrCreate(threadId);
    const msg: Message = { role: 'assistant', content, ts: Date.now() };
    t.messages.push(msg);
    return msg;
  },

  isEscalated(threadId: string): boolean {
    return this.getOrCreate(threadId).escalated;
  },

  markEscalated(threadId: string, reason: string): void {
    const t = this.getOrCreate(threadId);
    t.escalated = true;
    t.escalationReason = reason;
  },

  clearMessages(threadId: string): void {
    const t = this.getOrCreate(threadId);
    t.messages = [];
    t.escalated = false;
    t.escalationReason = undefined;
  },

  clearAll(): void {
    threads.clear();
  },
};
