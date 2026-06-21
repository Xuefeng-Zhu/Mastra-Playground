/**
 * Shared schemas for the HITL approval example.
 *
 * - InputSchema        : what the form sends
 * - ClassifiedSchema   : what the LLM extracts from the action
 * - GateOutputSchema   : what the gate step returns
 * - GateResumeSchema   : what the resume() call passes back
 * - ExecuteOutputSchema: what the execute step returns (final outcome)
 */

import { z } from 'zod';

/** The action the user is proposing (what they typed in the form). */
export const InputSchema = z.object({
  action: z.string(),
  actionType: z.enum(['refund', 'send', 'delete']),
});

/** What the LLM extracts from the action. */
export const ClassifiedSchema = z.object({
  amount: z.number().describe('The dollar amount of the action, 0 if not applicable'),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  reasoning: z.string().describe('1-2 sentences explaining the risk assessment'),
});

/** What the gate step returns:
 *  - 'auto-approved' : the gate decided the action is safe; no human needed
 *  - 'approved'      : the gate was resumed with a human approve decision
 *  - 'rejected'      : the gate was resumed with a human reject decision
 */
export const GateOutputSchema = z.object({
  classified: ClassifiedSchema,
  decision: z.enum(['auto-approved', 'approved', 'rejected']),
  token: z.string().nullable(), // resumption token if pending
});

/** What the resume() call passes back. */
export const GateResumeSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
});

/** What the execute step returns (final outcome). */
export const ExecuteOutputSchema = z.object({
  classified: ClassifiedSchema,
  decision: z.enum(['approved', 'rejected']),
  executed: z.boolean(),
  message: z.string(),
});
