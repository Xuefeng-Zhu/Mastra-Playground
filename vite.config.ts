import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standard Vite layout:
//   index.html  → project root  (entry point)
//   src/        → React source
//   public/     → static assets (the existing style.css lives here)
//
// Vite copies `public/` into the build output verbatim. Our server
// (`server/server.ts`) serves files from the build output dir, so the
// existing /style.css route still works without code changes.

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
    open: false,
  },
});
