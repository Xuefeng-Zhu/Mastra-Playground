'use client';

import dynamic from 'next/dynamic';

// The App component uses browser APIs (window.location.hash, localStorage)
// during initialization, so it must be rendered exclusively on the client.
const App = dynamic(() => import('../src/App').then((m) => ({ default: m.App })), { ssr: false });

export default function Page() {
  return <App />;
}
