# Multi-stage Dockerfile for the Mastra playground.
#
# Build:   docker build -t mastra-playground .
# Run:     docker run --rm -p 8917:8917 --env-file .env mastra-playground
# Or:      docker compose up
#
# Image size: ~180 MB (node:22-bookworm-slim base + production deps + tsx)
# Node version: matches .nvmrc (currently 22)

# ── Stage 1: install production dependencies ────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# Install prod deps + tsx (needed at runtime to execute .ts directly).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install tsx@4

# ── Stage 2: full install + Vite build ──────────────────────────────────
# Installs all deps (including devDependencies) so we can run `npm run build`
# to produce the React UI bundle in dist/.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Copy source files needed for the Vite build and the server.
COPY shared/ ./shared/
COPY examples/ ./examples/
COPY server/ ./server/
COPY scripts/ ./scripts/
COPY src/ ./src/
COPY index.html ./
COPY vite.config.ts tsconfig.json ./

# Build the React UI → dist/
RUN npm run build

# ── Stage 3: runtime image ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Run as non-root for defense in depth
RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid 1001 app

ENV NODE_ENV=production \
    PORT=8917

# Copy production node_modules (no devDeps) from the deps stage
COPY --from=deps --chown=app:app /app/node_modules ./node_modules

# Copy source files the server needs at runtime
COPY --from=build --chown=app:app /app/shared/ ./shared/
COPY --from=build --chown=app:app /app/examples/ ./examples/
COPY --from=build --chown=app:app /app/server/ ./server/
COPY --from=build --chown=app:app /app/package.json ./

# Copy the Vite-built React UI (dist/)
COPY --from=build --chown=app:app /app/dist/ ./dist/

USER app
EXPOSE 8917

# Health check against the server's /api/health endpoint
#   interval: 30s (don't hammer the server)
#   timeout: 5s (faster than the request timeout)
#   retries: 3 (allow a couple of failures before declaring unhealthy)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
    CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Use tsx directly — no separate compile step needed.
# The HEALTHCHECK needs Node's built-in fetch (Node 22 has it).
CMD ["npx", "tsx", "server/server.ts"]
