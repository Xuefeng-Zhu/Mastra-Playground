/**
 * Topbar — the 48px header above the v2 layout.
 *
 * The brand + a placeholder for the future Cmd+K palette (proposal §4.4).
 * Theme toggle, "open in new tab", and settings buttons were removed from
 * earlier drafts because they had no onClick handlers — the project stays
 * dark-only (proposal §9) and the other two are out of scope.
 */

export function Topbar() {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">◆</span>
        <span className="brand-name">Mastra Playground</span>
        <span className="brand-tag">v2</span>
      </div>
      <div className="topbar-center">
        <button
          className="cmd-k"
          id="cmd-k"
          title="Command palette (reserved for proposal §4.4)"
          aria-label="Command palette"
          disabled
        >
          <span className="cmd-k-icon">⌕</span>
          <span className="cmd-k-text">Search examples…</span>
          <span className="cmd-k-keys">
            <kbd>⌘</kbd>
            <kbd>K</kbd>
          </span>
        </button>
      </div>
      <div className="topbar-right">
        <span className="status-pill" title="System status">
          <span>System · Live</span>
        </span>
      </div>
    </header>
  );
}