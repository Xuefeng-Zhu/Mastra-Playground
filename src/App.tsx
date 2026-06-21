import { useEffect, useState } from 'react';
import { Topbar } from './components/Topbar.js';
import { Rail } from './components/Rail.js';
import { Workspace } from './components/Workspace.js';
import { V2_EXAMPLES } from './registry/examples.js';

export function App() {
  const [activeId, setActiveId] = useState<string>('parallel-research');

  // Cmd/Ctrl+Enter triggers the active Workspace's run(). The Workspace
  // component registers `window.__mpg.run` on mount via useEffect.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key === 'Enter') {
        e.preventDefault();
        window.__mpg?.run?.();
      }
      // Cmd/Ctrl+K is reserved for a future command palette (proposal §4.4).
      // The previous "flash the search bar" implementation was visual noise
      // with no real behavior; it has been removed pending the palette.
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const example = V2_EXAMPLES[activeId];

  return (
    <>
      <Topbar />
      <div className="v2-layout">
        <Rail activeExampleId={activeId} onSelect={setActiveId} />
        <main>{example ? <Workspace key={activeId} example={example} /> : null}</main>
      </div>
    </>
  );
}