import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The examples use tsx-only Node APIs (dynamic import with Mastra),
  // so all API routes run in the Node.js runtime (not Edge).
  // The React UI is a single-page client app — no SSR needed.
  reactStrictMode: true,

  // Suppress the X-Powered-By header for security hygiene.
  poweredByHeader: false,

  // Produce a self-contained standalone build for Docker deployment.
  output: 'standalone',

  // Turbopack is the default dev bundler in Next 16. No extra config needed.
};

export default nextConfig;
