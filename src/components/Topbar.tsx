/**
 * Topbar — the 48px header above the layout.
 *
 * Brand + Cmd+K command palette trigger button.
 */

interface TopbarProps {
  onCmdK: () => void;
}

export function Topbar({ onCmdK }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">◆</span>
        <span className="brand-name">Mastra Playground</span>
      </div>
      <div className="topbar-center">
        <button
          className="cmd-k"
          id="cmd-k"
          title="Command palette (⌘K)"
          aria-label="Command palette"
          onClick={onCmdK}
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
