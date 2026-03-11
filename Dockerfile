FROM node:20-alpine AS dashboard-build
WORKDIR /build
COPY server/dashboard/package*.json ./
RUN npm ci
COPY server/dashboard/ .
RUN npm run build

FROM node:20-alpine
WORKDIR /usr/src/app

COPY server/package*.json ./
RUN npm ci --only=production

COPY server/src/ ./src/
COPY server/migrations/ ./migrations/
COPY server/sites.json ./sites.json
COPY --from=dashboard-build /build/dist ./dashboard/dist

RUN mkdir -p /usr/src/app/data && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /usr/src/app
USER nodejs

EXPOSE 3000

VOLUME /usr/src/app/data

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "src/index.js"]
