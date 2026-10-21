import type { Prisma, PrismaClient } from '@prisma/client'

/**
 * PostgreSQL Row-Level Security (RLS) Service
 *
 * Enforces database engine level tenant isolation by binding the active tenant ID
 * to PostgreSQL's session setting `app.tenant_id`.
 */

export async function setTenantSessionContext(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  const sanitized = tenantId.replace(/'/g, "''")
  // tenant-filter: rls-context
  await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${sanitized}' /* tenantId */`)
}

export async function bypassTenantRLS(tx: Prisma.TransactionClient): Promise<void> {
  // tenant-scope: all
  await tx.$executeRawUnsafe(`SET LOCAL app.bypass_rls = 'on' /* tenant-scope: all */`)
}

/**
 * Executes a callback within a tenant-isolated database transaction.
 * Row-Level Security policies in PostgreSQL will automatically hide rows belonging to other tenants.
 */
export async function withTenantContext<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await setTenantSessionContext(tx, tenantId)
    return fn(tx)
  })
}
