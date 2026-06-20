import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
// The vanilla CSS lives in public/style.css. Vite resolves the import
// relative to the project root and emits a single bundled stylesheet.
import './styles.css';

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
