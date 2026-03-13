# ── Stage 1: Build React dashboard ──────────────────────────────────────────
FROM node:20-alpine AS dashboard-build
WORKDIR /build
COPY server/dashboard/package*.json ./
# --include=dev ensures vite/@vitejs/plugin-react are installed even when NODE_ENV=production
RUN npm ci --include=dev
COPY server/dashboard/ .
RUN npm run build

# ── Stage 2: Build server deps (native modules need build tools) ─────────────
FROM node:20-alpine AS server-deps
WORKDIR /app

# better-sqlite3 requires C++ compilation tools on Alpine
RUN apk add --no-cache python3 make g++

COPY server/package*.json ./
RUN npm ci --only=production

# ── Stage 3: Runtime (clean image, copy compiled node_modules) ───────────────
FROM node:20-alpine
WORKDIR /usr/src/app

# Copy pre-compiled node_modules from the build stage
COPY --from=server-deps /app/node_modules ./node_modules

COPY server/src/ ./src/
COPY server/migrations/ ./migrations/
COPY server/sites.json ./sites.json
COPY server/package.json ./package.json

# Copy dashboard static build
COPY --from=dashboard-build /build/dist ./dashboard/dist

# Data volume for SQLite WAL database
RUN mkdir -p /usr/src/app/data && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /usr/src/app
USER nodejs

EXPOSE 3000

VOLUME /usr/src/app/data

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "src/index.js"]
