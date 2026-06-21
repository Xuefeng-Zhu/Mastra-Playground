# Multi-stage Dockerfile for the Mastra playground (Next.js).
#
# Build:   docker build -t mastra-playground .
# Run:     docker run --rm -p 8917:8917 --env-file .env mastra-playground
# Or:      docker compose up
#
# Node version: matches .nvmrc (currently 22)

# ── Stage 1: install dependencies ───────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: build Next.js ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY tsconfig.json next.config.ts ./
COPY app/ ./app/
COPY src/ ./src/
COPY shared/ ./shared/
COPY examples/ ./examples/

# Next.js collects telemetry by default — disable during build.
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Stage 3: runtime image ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Run as non-root for defense in depth
RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid 1001 app

ENV NODE_ENV=production \
    PORT=8917 \
    NEXT_TELEMETRY_DISABLED=1

# Copy the standalone Next.js output and static assets
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static

# The examples and shared modules are needed at runtime for the API routes
COPY --from=build --chown=app:app /app/shared/ ./shared/
COPY --from=build --chown=app:app /app/examples/ ./examples/

USER app
EXPOSE 8917

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
    CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
