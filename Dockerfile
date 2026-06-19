# Multi-stage Dockerfile for the Mastra playground.
#
# Build:   docker build -t mastra-playground .
# Run:     docker run --rm -p 8917:8917 --env-file .env mastra-playground
# Or:      docker compose up
#
# Image size: ~250 MB (node:22-bookworm-slim base + production deps)
# Node version: matches .nvmrc (currently 22)

# ── Stage 1: install production dependencies ────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# Install only production deps. This layer is cached and reused across builds
# when only the source changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: install all deps (including dev, for typecheck/format during build) ──
# Used only for `npm run build` steps if we add them later. Kept separate from
# the prod-deps stage so the final image is small.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Copy sources. We don't compile (we ship .ts directly via tsx) but having
# the full tree here lets us run typecheck/format during build if we want.
COPY shared/ ./shared/
COPY examples/ ./examples/
COPY server/ ./server/
COPY public/ ./public/
COPY scripts/ ./scripts/
COPY tsconfig.json ./

# ── Stage 3: runtime image ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Run as non-root for defense in depth
RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid 1001 app

ENV NODE_ENV=production \
    PORT=8917

# Copy just the prod deps and sources from the build stage
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/shared/ ./shared/
COPY --from=build --chown=app:app /app/examples/ ./examples/
COPY --from=build --chown=app:app /app/server/ ./server/
COPY --from=build --chown=app:app /app/public/ ./public/
COPY --from=build --chown=app:app /app/scripts/ ./scripts/
COPY --from=build --chown=app:app /app/package.json ./

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
