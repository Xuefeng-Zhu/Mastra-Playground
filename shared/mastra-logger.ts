/**
 * Observability helpers.
 *
 * Lesson: Mastra's logger is configured at the Mastra-instance level,
 * not per-agent. Spans, traces, and logs are emitted by the framework
 * for every agent.generate / workflow.run call automatically.
 *
 * For InboxPilot, this maps to the "ai_traces" JSONB table recommended
 * in the research brief §7. Mastra's spans serialize cleanly to JSON
 * so you could emit them straight into Postgres.
 *
 * The simplest path: pass a ConsoleLogger to the Mastra constructor.
 * For real observability, swap in @mastra/observability's Observability
 * class with MastraStorageExporter / a custom Prometheus / OTel exporter.
 */

import { ConsoleLogger, LogLevel } from '@mastra/core/logger';

/** Verbose logger for learning. Quiet it down to LogLevel.WARN for production. */
export const logger = new ConsoleLogger({ name: 'mastra-playground', level: LogLevel.INFO });
