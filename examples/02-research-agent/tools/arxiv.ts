/**
 * Mock arxiv search tool. Returns a deterministic canned result.
 *
 * In a real deployment, this would hit the arxiv API and parse Atom XML.
 * For learning, the mock keeps the example deterministic and offline.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const arxivSearch = createTool({
  id: 'arxiv-search',
  description:
    'Search arxiv.org for academic papers matching a query. Returns up to 3 papers with title, authors, and abstract.',
  inputSchema: z.object({
    query: z.string().describe('The search query for arxiv'),
  }),
  outputSchema: z.object({
    papers: z.array(
      z.object({
        title: z.string(),
        authors: z.array(z.string()),
        abstract: z.string(),
        url: z.string(),
      }),
    ),
  }),
  execute: async ({ query }) => {
    return {
      papers: [
        {
          title: `A Survey of ${query}`,
          authors: ['A. Author', 'B. Author'],
          abstract: `We survey recent work on ${query}, covering the period 2024-2026.`,
          url: `https://arxiv.org/abs/2026.00001`,
        },
        {
          title: `Empirical Results on ${query}`,
          authors: ['C. Author'],
          abstract: `We present empirical benchmarks for ${query} on standard datasets.`,
          url: `https://arxiv.org/abs/2026.00002`,
        },
      ],
    };
  },
});
