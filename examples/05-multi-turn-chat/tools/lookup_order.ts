/**
 * Mock "lookup order" tool — a read-action.
 *
 * Returns canned order status for known order IDs.
 * In production: this would call Stripe / Shopify / your internal order API.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const params = z.object({
  order_id: z.string().describe('The order ID to look up (e.g. "12345")'),
});

const result = z.object({
  order_id: z.string(),
  status: z.string(),
  items: z.array(z.string()),
  total_usd: z.number(),
  estimated_delivery: z.string(),
});

const MOCK_ORDERS: Record<string, z.infer<typeof result>> = {
  '12345': {
    order_id: '12345',
    status: 'shipped',
    items: ['Widget Pro (1)', 'Gadget Mini (2)'],
    total_usd: 89.97,
    estimated_delivery: '2026-06-22',
  },
  '67890': {
    order_id: '67890',
    status: 'processing',
    items: ['Sprocket XL (1)'],
    total_usd: 24.99,
    estimated_delivery: '2026-06-25',
  },
  '11111': {
    order_id: '11111',
    status: 'delivered',
    items: ['Thingamajig (3)'],
    total_usd: 149.85,
    estimated_delivery: '2026-06-10',
  },
};

export const lookupOrder = createTool({
  id: 'lookup_order',
  description:
    'Look up the status of an order by its order ID. Returns the current status, items, total, and estimated delivery date.',
  inputSchema: params,
  outputSchema: result,
  execute: async ({ order_id }) => {
    return (
      MOCK_ORDERS[order_id] ?? {
        order_id,
        status: 'unknown',
        items: [],
        total_usd: 0,
        estimated_delivery: 'n/a',
      }
    );
  },
});

/** Direct-call version for use inside workflow steps. */
export async function lookupOrderDirect(order_id: string) {
  return (
    MOCK_ORDERS[order_id] ?? {
      order_id,
      status: 'unknown',
      items: [],
      total_usd: 0,
      estimated_delivery: 'n/a',
    }
  );
}
