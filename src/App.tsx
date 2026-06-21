import { useEffect, useState } from 'react';
import { Topbar } from './components/Topbar.js';
import { Rail } from './components/Rail.js';
import { Workspace } from './components/Workspace.js';
import { CommandPalette } from './components/CommandPalette.js';
import { EXAMPLES } from './registry/examples.js';

function getInitialExample(): string {
  const hash = window.location.hash.slice(1);
  if (hash && hash in EXAMPLES) return hash;
  return 'support-triage';
}

export function App() {
  const [activeId, setActiveId] = useState<string>(getInitialExample);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Sync hash ↔ active example
  useEffect(() => {
    window.location.hash = activeId;
  }, [activeId]);

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash && hash in EXAMPLES) setActiveId(hash);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+K → toggle command palette
      if (isMod && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }

      // Cmd/Ctrl+Enter → run active workspace
      if (isMod && e.key === 'Enter') {
        e.preventDefault();
        window.__mpg?.run?.();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const example = EXAMPLES[activeId];

  return (
    <>
      <Topbar onCmdK={() => setPaletteOpen(true)} />
      <div className="v2-layout">
        <Rail activeExampleId={activeId} onSelect={setActiveId} />
        <main>{example ? <Workspace key={activeId} example={example} /> : null}</main>
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={setActiveId}
        activeId={activeId}
      />
    </>
  );
}
