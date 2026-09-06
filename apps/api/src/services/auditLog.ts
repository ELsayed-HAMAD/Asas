import type { PrismaClient } from '@prisma/client'
import type { Permission } from '../middlewares/permissions.js'

export interface AuditLogEntry {
  tenantId: string
  actorId: string
  action: Permission | (string & {})
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
}

/**
 * Appends one row to `AuditLog`. Called from inside the route handler that actually performs
 * a privileged mutation \u2014 not from the `requirePermission` preHandler \u2014 because only the
 * handler knows the specific target (which payroll run, which employee) and the outcome.
 *
 * There is no corresponding update/delete export from this module, by design: see the
 * append-only note on the `AuditLog` Prisma model.
 */
export async function recordAuditLog(prisma: Pick<PrismaClient, 'auditLog'>, entry: AuditLogEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId: entry.tenantId,
      actorId: entry.actorId,
      action: entry.action,
      ...(entry.targetType !== undefined && { targetType: entry.targetType }),
      ...(entry.targetId !== undefined && { targetId: entry.targetId }),
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    },
  })
}
