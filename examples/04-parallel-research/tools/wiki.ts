/**
 * Mock "wiki" tool. Returns canned encyclopedia-style content.
 * Used by Example 04 to demonstrate parallel fan-out.
 *
 * In a real deployment, this would call your internal KB or a Wikipedia API.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const wikiParams = z.object({
  topic: z.string().describe('The topic to look up'),
});
const wikiResult = z.object({
  topic: z.string(),
  summary: z.string(),
  references: z.array(z.string()),
});

export const wiki = createTool({
  id: 'wiki',
  description: 'Look up a topic in the internal wiki. Returns a summary paragraph and 1-2 reference links.',
  inputSchema: wikiParams,
  outputSchema: wikiResult,
  execute: async ({ topic }) => wikiDirect(topic),
});

/** Direct-call version for use inside workflow steps. */
export async function wikiDirect(topic: string): Promise<{
  topic: string;
  summary: string;
  references: string[];
}> {
  // 100-300ms simulated latency (parallel in real usage)
  await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
  return {
    topic,
    summary: `Internal-wiki summary for "${topic}". This is a curated, authoritative overview maintained by the org. For background concepts and internal terminology, the wiki is the canonical source.`,
    references: [
      `https://wiki.internal/${encodeURIComponent(topic)}`,
      `https://wiki.internal/${encodeURIComponent(topic)}/history`,
    ],
  };
}
