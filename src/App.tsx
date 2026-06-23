'use client';

import { useEffect, useState } from 'react';
import { Topbar } from './components/Topbar';
import { Rail } from './components/Rail';
import { Workspace } from './components/Workspace';
import { WorkflowBuilder } from './components/WorkflowBuilder';
import { CommandPalette } from './components/CommandPalette';
import { EXAMPLES } from './registry/examples';
import { isExampleId, type ExampleId } from '../shared/example-manifest';
import { CUSTOM_WORKFLOW_HASH } from './registry/custom-workflow';

const DEFAULT_EXAMPLE_ID: ExampleId = 'support-triage';
export type ActiveWorkspaceId = ExampleId | typeof CUSTOM_WORKFLOW_HASH;

function getHashWorkspace(): ActiveWorkspaceId | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.slice(1);
  if (hash === CUSTOM_WORKFLOW_HASH) return CUSTOM_WORKFLOW_HASH;
  if (isExampleId(hash)) return hash;
  return null;
}

export function App() {
  const [activeId, setActiveId] = useState<ActiveWorkspaceId>(DEFAULT_EXAMPLE_ID);
  const [hasReadInitialHash, setHasReadInitialHash] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const applyHashWorkspace = () => {
      const hashExample = getHashWorkspace();
      if (hashExample) setActiveId(hashExample);
    };
    applyHashWorkspace();
    setHasReadInitialHash(true);
    window.addEventListener('hashchange', applyHashWorkspace);
    return () => window.removeEventListener('hashchange', applyHashWorkspace);
  }, []);

  // Sync hash ↔ active example
  useEffect(() => {
    if (!hasReadInitialHash) return;
    if (window.location.hash.slice(1) !== activeId) window.location.hash = activeId;
  }, [activeId, hasReadInitialHash]);

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

  const example = activeId === CUSTOM_WORKFLOW_HASH ? null : EXAMPLES[activeId];

  return (
    <>
      <Topbar onCmdK={() => setPaletteOpen(true)} />
      <div className="app-layout">
        <Rail activeExampleId={activeId} onSelect={setActiveId} />
        <main>
          {activeId === CUSTOM_WORKFLOW_HASH ? (
            <WorkflowBuilder key={activeId} />
          ) : example ? (
            <Workspace key={activeId} example={example} />
          ) : null}
        </main>
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
