import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Request-scoped tenant context.
 *
 * Fastify's `onRequest` hook opens a scope for the whole request, and the RBAC preHandler
 * records the authenticated tenant in it. The Prisma tenant guard reads this scope so every
 * query on a tenant-owned model is automatically constrained to the active workspace, even
 * when an individual call site forgets to pass `tenantId`.
 */
export interface TenantScope {
  tenantId: string | null
  crossTenant: boolean
}

const tenantStorage = new AsyncLocalStorage<TenantScope>()

export function createTenantScope(): TenantScope {
  return { tenantId: null, crossTenant: false }
}

/** Run a callback inside a scope (used by the request hook and explicit tenant transactions). */
export function runWithTenantScope<T>(scope: TenantScope, callback: () => T): T {
  return tenantStorage.run(scope, callback)
}

/**
 * Run a callback with a fixed tenant. Used by `withTenantContext`, which is the explicit
 * transaction wrapper for code that runs outside an HTTP request (workers, migrations) or
 * needs the tenant guard active inside a transaction.
 */
export function runWithTenantId<T>(tenantId: string, callback: () => T): T {
  return tenantStorage.run({ tenantId, crossTenant: false }, callback)
}

export function getTenantScope(): TenantScope | undefined {
  return tenantStorage.getStore()
}

/** Record the authenticated tenant for the current request. No-op outside a request scope. */
export function setActiveTenant(tenantId: string): void {
  const scope = tenantStorage.getStore()
  if (scope) scope.tenantId = tenantId
}

export function activeTenantId(): string | null {
  return tenantStorage.getStore()?.tenantId ?? null
}

/**
 * Deliberate, narrow escape hatch for operations that genuinely span tenants (maintenance
 * sweeps, platform billing reconciliation). Keep its use explicit and reviewable.
 */
export function withCrossTenantAccess<T>(callback: () => T): T {
  const scope = tenantStorage.getStore()
  if (!scope) return callback()
  const previous = scope.crossTenant
  scope.crossTenant = true
  try {
    return callback()
  } finally {
    scope.crossTenant = previous
  }
}
