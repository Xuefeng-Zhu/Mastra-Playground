/**
 * Mock web search tool. Returns a deterministic canned result based on the query.
 *
 * This is the lesson that an InboxPilot-shaped tool is just:
 *   { id, description, inputSchema, outputSchema, execute }
 * No special framework. Zod-validated input → typed output.
 *
 * In a real deployment, this would call Tavily, SerpAPI, or your own search API.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const webSearch = createTool({
  id: 'web-search',
  description:
    'Search the public web for a query. Returns the top 3 results with title, url, and a one-line snippet.',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string(),
      }),
    ),
  }),
  execute: async ({ query }) => {
    // Mocked — deterministic, no network.
    const results = [
      {
        title: `Top result for "${query}"`,
        url: `https://example.com/${encodeURIComponent(query)}/1`,
        snippet: `A high-level overview of ${query} and why it matters.`,
      },
      {
        title: `${query} — recent developments`,
        url: `https://example.com/${encodeURIComponent(query)}/2`,
        snippet: `Latest 2026 developments related to ${query}.`,
      },
      {
        title: `${query}: practical guide`,
        url: `https://example.com/${encodeURIComponent(query)}/3`,
        snippet: `Step-by-step guide on how to apply ${query} in production.`,
      },
    ];
    return { results };
  },
});
