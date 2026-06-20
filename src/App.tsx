import { useEffect, useState, useCallback } from 'react';
import { Topbar } from './components/Topbar.js';
import { Rail } from './components/Rail.js';
import { Workspace } from './components/Workspace.js';
import { V2_EXAMPLES } from './registry/examples.js';

export function App() {
  const [activeId, setActiveId] = useState<string>('parallel-research');
  const [activeWs, setActiveWs] = useState<{ run: () => void } | null>(null);

  // Expose a global hook so the Cmd+Enter handler can call run() on the
  // current workspace. (An alternative is to lift state up; this is
  // simpler and good enough for a single-workspace app.)
  useEffect(() => {
    (window as any).__mpg = {
      run: () => activeWs?.run(),
    };
  }, [activeWs]);

  // ⌘K flashes the search bar; ⌘↵ triggers Run
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const cmd = document.getElementById('cmd-k');
        if (cmd) {
          cmd.style.borderColor = 'var(--accent)';
          cmd.style.boxShadow = '0 0 0 3px rgba(88,166,255,0.18)';
          setTimeout(() => {
            cmd.style.borderColor = '';
            cmd.style.boxShadow = '';
          }, 600);
        }
      }
      if (isMod && e.key === 'Enter') {
        e.preventDefault();
        (window as any).__mpg?.run?.();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const example = V2_EXAMPLES[activeId];

  return (
    <>
      <Topbar
        onCmdK={() => {
          const cmd = document.getElementById('cmd-k');
          if (cmd) {
            cmd.style.borderColor = 'var(--accent)';
            cmd.style.boxShadow = '0 0 0 3px rgba(88,166,255,0.18)';
            setTimeout(() => {
              cmd.style.borderColor = '';
              cmd.style.boxShadow = '';
            }, 600);
          }
        }}
      />
      <div className="v2-layout">
        <Rail activeExampleId={activeId} onSelect={setActiveId} />
        <main>{example ? <Workspace key={activeId} example={example} /> : null}</main>
      </div>
    </>
  );
}
