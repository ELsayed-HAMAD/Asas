# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Enable corepack and prepare pnpm
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

# Copy root workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy package manifests across the workspace
COPY packages/domain/package.json ./packages/domain/
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/api/package.json ./apps/api/

# Install workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy prisma schema and generate client
COPY apps/api/prisma ./apps/api/prisma
RUN pnpm --filter @asas/api prisma:generate

# Copy source code
COPY packages/domain ./packages/domain
COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api

# Build shared packages and API application
RUN pnpm --filter @asas/domain build && \
    pnpm --filter @asas/contracts build && \
    pnpm --filter @asas/api build

# ── Stage 2: Production Runner ──────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0

# Create non-root system group and user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Enable corepack for running migration deploy
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

# Copy dependencies, built assets and prisma schema with non-root ownership
COPY --from=builder --chown=nodejs:nodejs /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/packages ./packages
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/package.json ./apps/api/
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/node_modules ./apps/api/node_modules

# Ensure storage directory exists and has correct permissions
RUN mkdir -p /app/apps/api/storage && chown -R nodejs:nodejs /app

USER nodejs

WORKDIR /app/apps/api

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/ready || exit 1

CMD ["node", "dist/server.js"]
