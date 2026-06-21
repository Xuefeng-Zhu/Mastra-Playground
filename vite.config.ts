import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standard Vite layout:
//   index.html  → project root  (entry point)
//   src/        → React source (TypeScript + JSX, bundled to dist/)
//
// The server (`server/server.ts`) reads from `dist/`. The source CSS lives
// in `src/styles.css` (imported from src/main.tsx) and is bundled into
// `dist/assets/index-*.css` by Vite — no separate public/stylesheet.
//
// `sourcemap: false` — the server is a learning playground served to the
// public; shipping .map files would disclose the full React source.

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
  },
  server: {
    port: 5173,
    open: false,
  },
});
