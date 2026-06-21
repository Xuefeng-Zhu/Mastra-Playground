/**
 * Pure helpers used by both the React shell and the legacy renderers.
 *
 * Kept in a separate file (no React, no DOM) so it can be imported from
 * anywhere without dragging in transitive deps.
 */

/**
 * Format a duration in milliseconds as `1.23s`. Returns `—` for null /
 * undefined / NaN.
 */
export function formatSec(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  return (ms / 1000).toFixed(2) + 's';
}

/**
 * HTML-escape a value for safe insertion into innerHTML. Mirrors the
 * previous vanilla `escapeHtml` in public/app.js so the JSON highlight
 * regexes in OutputPanel keep working.
 */
export function escapeText(s: unknown): string {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
