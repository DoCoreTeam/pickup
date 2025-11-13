# Multi-stage build for production
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8081

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy dependencies
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application files (no build step needed - JavaScript files run directly)
COPY --chown=nodejs:nodejs package.json ./
COPY --chown=nodejs:nodejs src ./src
COPY --chown=nodejs:nodejs admin ./admin
COPY --chown=nodejs:nodejs assets ./assets
COPY --chown=nodejs:nodejs qr ./qr
COPY --chown=nodejs:nodejs index.html ./
COPY --chown=nodejs:nodejs store.html ./
COPY --chown=nodejs:nodejs paused.html ./
COPY --chown=nodejs:nodejs owner ./owner

USER nodejs

EXPOSE 8081

ENV PORT=8081

# Health check (wget is available in alpine)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8081/api/healthz || exit 1

CMD ["npm", "run", "start:api"]
