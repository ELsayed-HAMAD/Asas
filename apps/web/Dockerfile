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
COPY apps/web/package.json ./apps/web/

# Install workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/domain ./packages/domain
COPY packages/contracts ./packages/contracts
COPY apps/web ./apps/web

# Build shared packages and web SPA
RUN pnpm --filter @asas/domain build && \
    pnpm --filter @asas/contracts build && \
    pnpm --filter @asas/web build

# ── Stage 2: Serve with Nginx ────────────────────────────────────────────────
FROM nginx:alpine AS runner

# Copy built SPA artifacts
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy Nginx SPA configuration
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
