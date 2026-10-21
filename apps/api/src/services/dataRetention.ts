import type { PrismaClient } from '@prisma/client'
import type { DataRetentionCleanupRequest, DataRetentionCleanupResponse } from '@asas/contracts'

/**
 * Compliance & Data Retention Cleanup Service.
 *
 * Automatically purges expired transient verification tokens, obsolete sessions,
 * and old export jobs beyond the configured tenant retention threshold.
 */
export async function executeDataRetentionCleanup(
  prisma: PrismaClient,
  tenantId: string,
  options: DataRetentionCleanupRequest,
): Promise<DataRetentionCleanupResponse> {
  const now = new Date()
  const cutoffDate = new Date(now.getTime() - options.retentionDays * 24 * 60 * 60 * 1000)

  let expiredTokensCount = 0
  let expiredSessionsCount = 0
  let expiredExportsCount = 0
  let transientLogsCount = 0

  const categories = options.categories ?? ['EXPIRED_TOKENS', 'OLD_SESSIONS', 'EXPIRED_EXPORTS']

  if (categories.includes('EXPIRED_TOKENS')) {
    const members = await prisma.member.findMany({
      where: { tenantId },
      select: { user: { select: { email: true } } },
    })
    const memberEmails = members.map(m => m.user?.email).filter((email): email is string => Boolean(email))
    if (memberEmails.length > 0) {
      const res = await prisma.verification.deleteMany({
        where: {
          identifier: { in: memberEmails },
          expiresAt: { lt: now },
        },
      })
      expiredTokensCount = res.count
    }
  }

  if (categories.includes('OLD_SESSIONS')) {
    const res = await prisma.session.deleteMany({
      where: {
        activeOrganizationId: tenantId,
        expiresAt: { lt: cutoffDate },
      },
    })
    expiredSessionsCount = res.count
  }

  if (categories.includes('EXPIRED_EXPORTS')) {
    const res = await prisma.exportJob.deleteMany({
      where: {
        tenantId,
        status: { in: ['DONE', 'FAILED'] },
        createdAt: { lt: cutoffDate },
      },
    })
    expiredExportsCount = res.count
  }

  if (categories.includes('TRANSIENT_LOGS')) {
    const res = await prisma.webhookLog.deleteMany({
      where: {
        integration: { tenantId },
        createdAt: { lt: cutoffDate },
      },
    })
    transientLogsCount = res.count
  }

  return {
    success: true,
    executedAt: now.toISOString(),
    purgedCounts: {
      expiredTokens: expiredTokensCount,
      expiredSessions: expiredSessionsCount,
      expiredExports: expiredExportsCount,
      transientLogs: transientLogsCount,
    },
  }
}
