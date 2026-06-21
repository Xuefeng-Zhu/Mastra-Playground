// Ambient declarations for non-code assets the build pipeline understands.

declare module '*.css';
declare module '*.svg';
declare module '*.png';

// Global hook used by App.tsx keyboard shortcuts (Cmd/Ctrl+Enter) to call
// the active Workspace's run() handler. Workspace registers itself via
// useEffect; App reads it back. Typed here so neither side needs `as any`.
interface MpgGlobal {
  run?: () => void;
}

interface Window {
  __mpg?: MpgGlobal;
}
