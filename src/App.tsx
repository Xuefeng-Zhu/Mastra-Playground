'use client';

import { useEffect, useState } from 'react';
import { Topbar } from './components/Topbar';
import { Rail } from './components/Rail';
import { Workspace } from './components/Workspace';
import { CommandPalette } from './components/CommandPalette';
import { EXAMPLES } from './registry/examples';
import { isExampleId, type ExampleId } from '../shared/example-manifest';

const DEFAULT_EXAMPLE_ID: ExampleId = 'support-triage';

function getHashExample(): ExampleId | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.slice(1);
  if (isExampleId(hash)) return hash;
  return null;
}

export function App() {
  const [activeId, setActiveId] = useState<ExampleId>(DEFAULT_EXAMPLE_ID);
  const [hasReadInitialHash, setHasReadInitialHash] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const hashExample = getHashExample();
    if (hashExample) setActiveId(hashExample);
    setHasReadInitialHash(true);
  }, []);

  // Sync hash ↔ active example
  useEffect(() => {
    if (!hasReadInitialHash) return;
    window.location.hash = activeId;
  }, [activeId, hasReadInitialHash]);

  useEffect(() => {
    const onHashChange = () => {
      const hashExample = getHashExample();
      if (hashExample) setActiveId(hashExample);
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
      <div className="app-layout">
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
