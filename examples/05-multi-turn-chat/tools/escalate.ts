/**
 * Mock "escalate to human" tool — a write-action.
 *
 * Lesson: tools can do more than read. A write-action that mutates
 * persistent state (the memory store) is the kind of side effect
 * InboxPilot would need for real agent workflows.
 *
 * In production: this would call a Twilio API to page an on-call
 * human, insert a row in the escalations table, fire a webhook, etc.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { memoryStore } from '../../../shared/memory-store.js';

const params = z.object({
  threadId: z.string().describe('The conversation thread to escalate'),
  reason: z.string().describe('Why this thread needs a human (1-2 sentences)'),
});

const result = z.object({
  escalated: z.boolean(),
  reason: z.string(),
});

export const escalate = createTool({
  id: 'escalate_to_human',
  description:
    'Escalate the current conversation to a human agent. Use this when the user is upset, asks for a manager, or the issue is too complex for the bot to handle.',
  inputSchema: params,
  outputSchema: result,
  execute: async ({ threadId, reason }) => {
    memoryStore.markEscalated(threadId, reason);
    return { escalated: true, reason };
  },
});

/** Direct-call version for use inside workflow steps. */
export async function escalateDirect(threadId: string, reason: string) {
  memoryStore.markEscalated(threadId, reason);
  return { escalated: true, reason };
}
