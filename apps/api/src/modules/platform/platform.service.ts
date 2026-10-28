import { Prisma, type PrismaClient } from '@prisma/client'
import { PLATFORM_PLANS, buildPaginationMeta } from '@asas/contracts'
import type { AsasEnv } from '../../config/env.js'
import { invalidateAuthCacheForTenant, invalidateAuthCacheForUser } from '../../middlewares/rbac.js'
import { closeStreamsForTenant, closeStreamsForUser } from '../../plugins/sse.js'
import { getTenantStorageBytes, type ObjectStorage } from '../../services/objectStorage.js'
import { bypassTenantRLS } from '../../services/rls.js'
import { withCrossTenantAccess } from '../../services/tenantContext.js'
import { AppError } from '../../utils/errors.js'

type AuditClient = PrismaClient | Prisma.TransactionClient

export interface PlatformAuditInput {
  actorId?: string | null | undefined
  action: string
  targetType?: string | null | undefined
  targetId?: string | null | undefined
  metadata?: Record<string, unknown> | null | undefined
  ipAddress?: string | null | undefined
  userAgent?: string | null | undefined
}

/** Append-only platform audit entry. Never updated or deleted by the application. */
export async function recordPlatformAudit(client: AuditClient, input: PlatformAuditInput): Promise<void> {
  await client.platformAuditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  })
}

/**
 * Run a cross-tenant operation with both guards disabled for the duration of one transaction:
 * the application tenant guard via `withCrossTenantAccess`, and PostgreSQL RLS via
 * `bypassTenantRLS`. Used only by the platform service.
 */
export function withPlatformAccess<T>(
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withCrossTenantAccess(() => prisma.$transaction(async tx => {
    await bypassTenantRLS(tx)
    return fn(tx)
  }))
}

type SubscriptionLike = {
  tenantId: string
  planName: string
  priceMonthly: Prisma.Decimal
  status: string
  seatsUsed: number
  seatLimit: number
  storageUsedGb: number
  storageLimitGb: number
  renewsOn: Date | null
  stripeSubscriptionId: string | null
  stripeCurrency: string | null
  createdAt: Date
}

function newestByTenant<T extends { tenantId: string; createdAt: Date }>(rows: T[]): Map<string, T> {
  const result = new Map<string, T>()
  for (const row of rows) {
    const current = result.get(row.tenantId)
    if (!current || row.createdAt > current.createdAt) result.set(row.tenantId, row)
  }
  return result
}

function tenantStatus(status: string): 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' {
  if (status === 'SUSPENDED' || status === 'ARCHIVED') return status
  return 'ACTIVE'
}

export async function getPlatformOverview(prisma: PrismaClient) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  return withPlatformAccess(prisma, async tx => {
    const [
      workspaceCount,
      activeWorkspaceCount,
      suspendedWorkspaceCount,
      userCount,
      newWorkspaces30d,
      newUsers30d,
      subscriptionRows,
      recentAudit,
    ] = await Promise.all([
      tx.tenant.count({ where: { status: { not: 'ARCHIVED' } } }),
      tx.tenant.count({ where: { status: 'ACTIVE' } }),
      tx.tenant.count({ where: { status: 'SUSPENDED' } }),
      tx.user.count(),
      tx.tenant.count({ where: { status: { not: 'ARCHIVED' }, createdAt: { gte: thirtyDaysAgo } } }),
      tx.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      tx.subscription.findMany({
        select: {
          tenantId: true, planName: true, priceMonthly: true, status: true,
          seatsUsed: true, seatLimit: true, storageUsedGb: true, storageLimitGb: true,
          renewsOn: true, stripeSubscriptionId: true, stripeCurrency: true, createdAt: true,
        },
      }),
      tx.platformAuditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, action: true, targetType: true, targetId: true, createdAt: true },
      }),
    ])

    const latest = newestByTenant(subscriptionRows as SubscriptionLike[])
    const active = [...latest.values()].filter(row => row.status === 'ACTIVE')
    const pastDue = [...latest.values()].filter(row => row.status === 'PAST_DUE')
    const mrr = active.reduce((sum, row) => sum + Number(row.priceMonthly.toString()), 0)
    const reportedStorageGb = [...latest.values()].reduce((sum, row) => sum + (Number(row.storageUsedGb) || 0), 0)
    const planCounts = new Map<string, number>()
    for (const row of latest.values()) {
      planCounts.set(row.planName, (planCounts.get(row.planName) ?? 0) + 1)
    }
    const withoutSubscription = workspaceCount - latest.size
    if (withoutSubscription > 0) {
      planCounts.set('Free Starter', (planCounts.get('Free Starter') ?? 0) + withoutSubscription)
    }

    return {
      workspaceCount,
      activeWorkspaceCount,
      suspendedWorkspaceCount,
      userCount,
      activeSubscriptionCount: active.length,
      pastDueSubscriptionCount: pastDue.length,
      mrr: mrr.toFixed(2),
      currency: active[0]?.stripeCurrency ?? 'USD',
      reportedStorageGb,
      newWorkspaces30d,
      newUsers30d,
      planMix: [...planCounts.entries()].map(([planName, count]) => ({ planName, count })).sort((a, b) => b.count - a.count),
      recentAudit: recentAudit.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })),
    }
  })
}

export async function listPlatformWorkspaces(
  prisma: PrismaClient,
  query: { page: number; limit: number; search?: string | undefined; status: 'ALL' | 'ACTIVE' | 'SUSPENDED'; plan?: string | undefined },
) {
  return withPlatformAccess(prisma, async tx => {
    const where: Prisma.TenantWhereInput = { status: query.status === 'ALL' ? { not: 'ARCHIVED' } : query.status }
    if (query.search) {
      where.AND = [{
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { slug: { contains: query.search, mode: 'insensitive' } },
        ],
      }]
    }
    if (query.plan) where.subscriptions = { some: { planName: { contains: query.plan, mode: 'insensitive' } } }

    const [items, total, active, suspended] = await Promise.all([
      tx.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { members: true } },
        },
      }),
      tx.tenant.count({ where }),
      tx.tenant.count({ where: { status: 'ACTIVE' } }),
      tx.tenant.count({ where: { status: 'SUSPENDED' } }),
    ])

    return {
      items: items.map(tenant => {
        const subscription = tenant.subscriptions[0]
        return {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenantStatus(tenant.status),
          onboardingStatus: tenant.onboardingStatus,
          planName: subscription?.planName ?? 'Free Starter',
          priceMonthly: subscription?.priceMonthly.toString() ?? '0',
          currency: subscription?.stripeCurrency ?? tenant.currency,
          seatsUsed: tenant._count.members,
          seatLimit: subscription?.seatLimit ?? 5,
          storageUsedGb: subscription ? Number(subscription.storageUsedGb) : null,
          createdAt: tenant.createdAt.toISOString(),
        }
      }),
      pagination: buildPaginationMeta(query, total),
      summary: { total, active, suspended },
    }
  })
}

export async function getPlatformWorkspaceDetail(
  prisma: PrismaClient,
  tenantId: string,
  storage?: ObjectStorage,
) {
  return withPlatformAccess(prisma, async tx => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      include: {
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
        members: {
          orderBy: { createdAt: 'asc' },
          take: 25,
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        _count: { select: { members: true } },
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    })
    if (!tenant || tenant.status === 'ARCHIVED') throw new AppError(404, 'Workspace not found')

    const [employees, payableInvoices, receivableInvoices, deals, projects, products] = await Promise.all([
      tx.employee.count({ where: { tenantId } }),
      tx.payableInvoice.count({ where: { tenantId } }),
      tx.receivableInvoice.count({ where: { tenantId } }),
      tx.deal.count({ where: { tenantId } }),
      tx.project.count({ where: { tenantId } }),
      tx.product.count({ where: { tenantId } }),
    ])

    let measuredStorageGb: number | null = null
    if (storage) {
      try {
        measuredStorageGb = (await getTenantStorageBytes(storage, tenantId)) / 1_000_000_000
      } catch {
        measuredStorageGb = null
      }
    }

    const subscription = tenant.subscriptions[0]
    return {
      workspace: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenantStatus(tenant.status),
        onboardingStatus: tenant.onboardingStatus,
        planName: subscription?.planName ?? 'Free Starter',
        priceMonthly: subscription?.priceMonthly.toString() ?? '0',
        seatsUsed: tenant._count.members,
        seatLimit: subscription?.seatLimit ?? 5,
        storageUsedGb: measuredStorageGb ?? (subscription ? Number(subscription.storageUsedGb) : null),
        createdAt: tenant.createdAt.toISOString(),
        supportEmail: tenant.supportEmail,
        timezone: tenant.timezone,
        currency: tenant.currency,
        suspendedAt: tenant.suspendedAt?.toISOString() ?? null,
        suspendedReason: tenant.suspendedReason,
      },
      subscription: subscription ? {
        id: subscription.id,
        planName: subscription.planName,
        status: subscription.status,
        priceMonthly: subscription.priceMonthly.toString(),
        currency: subscription.stripeCurrency ?? tenant.currency,
        renewsOn: subscription.renewsOn?.toISOString() ?? null,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        stripeCustomerId: tenant.stripeCustomerId,
        seatsUsed: subscription.seatsUsed,
        seatLimit: subscription.seatLimit,
        storageLimitGb: Number(subscription.storageLimitGb),
      } : null,
      members: tenant.members.map(member => ({
        id: member.id,
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        role: member.role,
        createdAt: member.createdAt.toISOString(),
      })),
      footprint: { employees, payableInvoices, receivableInvoices, deals, projects, products },
      recentAudit: tenant.auditLogs.map(row => ({
        id: row.id,
        action: row.action,
        actorId: row.actorId,
        createdAt: row.createdAt.toISOString(),
      })),
    }
  })
}

export async function updateWorkspaceStatus(
  prisma: PrismaClient,
  input: { tenantId: string; status: 'ACTIVE' | 'SUSPENDED'; reason?: string | undefined },
  actor: { userId: string; ipAddress?: string | null; userAgent?: string | null },
) {
  const result = await withPlatformAccess(prisma, async tx => {
    const tenant = await tx.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true, name: true, status: true } })
    if (!tenant || tenant.status === 'ARCHIVED') throw new AppError(404, 'Workspace not found')

    const suspended = input.status === 'SUSPENDED'
    const updated = await tx.tenant.update({
      where: { id: input.tenantId },
      data: {
        status: input.status,
        suspendedAt: suspended ? new Date() : null,
        suspendedReason: suspended ? (input.reason?.trim() || 'Suspended by a platform administrator') : null,
      },
      select: { id: true, status: true, suspendedAt: true, suspendedReason: true },
    })
    await recordPlatformAudit(tx, {
      actorId: actor.userId,
      action: suspended ? 'workspace.suspend' : 'workspace.reactivate',
      targetType: 'Tenant',
      targetId: input.tenantId,
      metadata: { name: tenant.name, reason: updated.suspendedReason },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    })
    return updated
  })

  invalidateAuthCacheForTenant(input.tenantId)
  closeStreamsForTenant(input.tenantId)
  return {
    id: result.id,
    status: tenantStatus(result.status),
    suspendedAt: result.suspendedAt?.toISOString() ?? null,
    suspendedReason: result.suspendedReason,
  }
}

export async function compWorkspacePlan(
  prisma: PrismaClient,
  input: { tenantId: string; planId: string },
  actor: { userId: string; ipAddress?: string | null; userAgent?: string | null },
) {
  const plan = PLATFORM_PLANS.find(item => item.id === input.planId)
  if (!plan) throw new AppError(400, 'Unknown platform plan')

  return withPlatformAccess(prisma, async tx => {
    const tenant = await tx.tenant.findUnique({
      where: { id: input.tenantId },
      include: {
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { members: true } },
      },
    })
    if (!tenant || tenant.status === 'ARCHIVED') throw new AppError(404, 'Workspace not found')

    const current = tenant.subscriptions[0]
    if (current?.stripeSubscriptionId) {
      throw new AppError(409, 'This workspace is billed by Stripe. Change its paid plan in the Stripe dashboard.', {
        code: 'STRIPE_MANAGED',
        stripeCustomerId: tenant.stripeCustomerId,
        stripeSubscriptionId: current.stripeSubscriptionId,
      })
    }

    const data = {
      planName: plan.name,
      priceMonthly: new Prisma.Decimal(plan.priceMonthly),
      status: 'ACTIVE' as const,
      seatLimit: plan.seatLimit,
      storageLimitGb: plan.storageLimitGb,
    }
    const subscription = current
      ? await tx.subscription.update({ where: { id: current.id }, data })
      : await tx.subscription.create({
        data: {
          tenantId: input.tenantId,
          ...data,
          seatsUsed: tenant._count.members,
        },
      })

    await recordPlatformAudit(tx, {
      actorId: actor.userId,
      action: 'workspace.plan.comp',
      targetType: 'Tenant',
      targetId: input.tenantId,
      metadata: { previousPlan: current?.planName ?? 'Free Starter', planId: plan.id, planName: plan.name },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    })

    return {
      id: subscription.id,
      planName: subscription.planName,
      priceMonthly: subscription.priceMonthly.toString(),
      seatLimit: subscription.seatLimit,
      storageLimitGb: Number(subscription.storageLimitGb),
    }
  })
}

export async function listPlatformUsers(
  prisma: PrismaClient,
  query: { page: number; limit: number; search?: string | undefined; verified: 'ALL' | 'VERIFIED' | 'UNVERIFIED'; twoFactor: 'ALL' | 'ENABLED' | 'DISABLED' },
) {
  return withPlatformAccess(prisma, async tx => {
    const where: Prisma.UserWhereInput = {}
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ]
    }
    if (query.verified !== 'ALL') where.emailVerified = query.verified === 'VERIFIED'
    if (query.twoFactor !== 'ALL') where.twoFactorEnabled = query.twoFactor === 'ENABLED'

    const [items, total, unverified, withTwoFactor] = await Promise.all([
      tx.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          members: { include: { tenant: { select: { name: true } } } },
          sessions: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
        },
      }),
      tx.user.count({ where }), 
      tx.user.count({ where: { emailVerified: false } }),
      tx.user.count({ where: { twoFactorEnabled: true } }),
    ])

    return {
      items: items.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        platformRole: user.platformRole,
        createdAt: user.createdAt.toISOString(),
        memberships: user.members.map(member => ({
          tenantId: member.tenantId,
          tenantName: member.tenant.name,
          role: member.role,
        })),
        lastSessionAt: user.sessions[0]?.createdAt.toISOString() ?? null,
      })),
      pagination: buildPaginationMeta(query, total),
      summary: { total, unverified, withTwoFactor },
    }
  })
}

export async function getPlatformUserDetail(prisma: PrismaClient, userId: string) {
  return withPlatformAccess(prisma, async tx => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: {
        members: { include: { tenant: { select: { name: true } } } },
        sessions: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    })
    if (!user) throw new AppError(404, 'User not found')
    const recentAudit = await tx.auditLog.findMany({
      where: { actorId: userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, action: true, targetType: true, targetId: true, createdAt: true },
    })

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        platformRole: user.platformRole,
        createdAt: user.createdAt.toISOString(),
        memberships: user.members.map(member => ({
          tenantId: member.tenantId,
          tenantName: member.tenant.name,
          role: member.role,
        })),
        lastSessionAt: user.sessions[0]?.createdAt.toISOString() ?? null,
      },
      sessions: user.sessions.map(session => ({
        id: session.id,
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      })),
      recentAudit: recentAudit.map(row => ({
        id: row.id,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        createdAt: row.createdAt.toISOString(),
      })),
    }
  })
}

export async function revokeUserSessions(
  prisma: PrismaClient,
  userId: string,
  actor: { userId: string; ipAddress?: string | null; userAgent?: string | null },
) {
  const result = await withPlatformAccess(prisma, async tx => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true } })
    if (!user) throw new AppError(404, 'User not found')
    const deleted = await tx.session.deleteMany({ where: { userId } })
    await recordPlatformAudit(tx, {
      actorId: actor.userId,
      action: 'user.sessions.revoke',
      targetType: 'User',
      targetId: userId,
      metadata: { email: user.email, sessionsRevoked: deleted.count },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    })
    return deleted.count
  })

  closeStreamsForUser(userId)
  invalidateAuthCacheForUser(userId)
  return { revoked: result }
}

export async function getPlatformBilling(prisma: PrismaClient) {
  return withPlatformAccess(prisma, async tx => {
    const [subscriptions, invoices, invoiceAggregate] = await Promise.all([
      tx.subscription.findMany({
        orderBy: { createdAt: 'desc' },
        take: 500,
        include: { tenant: { select: { name: true, stripeCustomerId: true } } },
      }),
      tx.billingInvoice.findMany({
        orderBy: { date: 'desc' },
        take: 200,
        include: { tenant: { select: { name: true } } },
      }),
      tx.billingInvoice.aggregate({ _sum: { amount: true }, _count: { _all: true } }),
    ])

    const latest = newestByTenant(subscriptions as unknown as SubscriptionLike[])
    const active = [...latest.values()].filter(row => row.status === 'ACTIVE')
    const pastDue = [...latest.values()].filter(row => row.status === 'PAST_DUE')
    const mrr = active.reduce((sum, row) => sum + Number(row.priceMonthly.toString()), 0)

    return {
      summary: {
        activeSubscriptions: active.length,
        pastDueSubscriptions: pastDue.length,
        mrr: mrr.toFixed(2),
        currency: active[0]?.stripeCurrency ?? 'USD',
        invoiceTotal: invoiceAggregate._sum.amount?.toString() ?? '0',
        invoiceCount: invoiceAggregate._count._all,
      },
      subscriptions: subscriptions.map(row => ({
        id: row.id,
        tenantId: row.tenantId,
        tenantName: row.tenant.name,
        planName: row.planName,
        status: row.status,
        priceMonthly: row.priceMonthly.toString(),
        currency: row.stripeCurrency ?? 'USD',
        renewsOn: row.renewsOn?.toISOString() ?? null,
        stripeSubscriptionId: row.stripeSubscriptionId,
        stripeCustomerId: row.tenant.stripeCustomerId,
      })),
      invoices: invoices.map(row => ({
        id: row.id,
        tenantId: row.tenantId,
        tenantName: row.tenant.name,
        date: row.date.toISOString(),
        description: row.description,
        amount: row.amount.toString(),
        currency: row.stripeCurrency ?? 'USD',
        status: row.status,
        stripeInvoiceId: row.stripeInvoiceId,
      })),
    }
  })
}

export async function getPlatformHealth(prisma: PrismaClient, env: AsasEnv) {
  try {
    return await withPlatformAccess(prisma, async tx => {
      await tx.$queryRaw`-- tenant-scope: all
        SELECT 1`
      const grouped = await tx.exportJob.groupBy({ by: ['status'], _count: { _all: true } })
      const failedJobs = await tx.exportJob.findMany({
        where: { status: 'FAILED' },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        include: { tenant: { select: { name: true } } },
      })
      const counts = { queued: 0, running: 0, failed: 0, done: 0 }
      for (const row of grouped) {
        if (row.status === 'QUEUED') counts.queued = row._count._all
        if (row.status === 'RUNNING') counts.running = row._count._all
        if (row.status === 'FAILED') counts.failed = row._count._all
        if (row.status === 'DONE') counts.done = row._count._all
      }
      return {
        status: 'ok' as const,
        database: 'connected' as const,
        uptimeSeconds: process.uptime(),
        timestamp: new Date().toISOString(),
        nodeEnv: env.nodeEnv,
        storageDriver: env.objectStorageDriver,
        emailDelivery: env.resendApiKey ? 'configured' as const : 'disabled' as const,
        queueMode: env.queueUrl ? 'pg-boss' as const : 'inline' as const,
        redisConfigured: Boolean(env.redisUrl),
        exportJobs: counts,
        failedJobs: failedJobs.map(job => ({
          id: job.id,
          tenantId: job.tenantId,
          tenantName: job.tenant.name,
          filename: job.filename,
          updatedAt: job.updatedAt.toISOString(),
        })),
      }
    })
  } catch {
    return {
      status: 'degraded' as const,
      database: 'unavailable' as const,
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
      nodeEnv: env.nodeEnv,
      storageDriver: env.objectStorageDriver,
      emailDelivery: env.resendApiKey ? 'configured' as const : 'disabled' as const,
      queueMode: env.queueUrl ? 'pg-boss' as const : 'inline' as const,
      redisConfigured: Boolean(env.redisUrl),
      exportJobs: { queued: 0, running: 0, failed: 0, done: 0 },
      failedJobs: [],
    }
  }
}

export async function listPlatformAudit(
  prisma: PrismaClient,
  query: { page: number; limit: number; action?: string | undefined; targetId?: string | undefined },
) {
  return withPlatformAccess(prisma, async tx => {
    const where: Prisma.PlatformAuditLogWhereInput = {}
    if (query.action) where.action = { contains: query.action, mode: 'insensitive' }
    if (query.targetId) where.targetId = query.targetId
    const [items, total] = await Promise.all([
      tx.platformAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      tx.platformAuditLog.count({ where }),
    ])
    const actorIds = [...new Set(items.map(item => item.actorId).filter((id): id is string => Boolean(id)))]
    const actors = actorIds.length
      ? await tx.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } })
      : []
    const actorMap = new Map(actors.map(actor => [actor.id, actor]))

    return {
      items: items.map(item => {
        const actor = item.actorId ? actorMap.get(item.actorId) : undefined
        return {
          id: item.id,
          actorId: item.actorId,
          actorName: actor?.name ?? null,
          actorEmail: actor?.email ?? null,
          action: item.action,
          targetType: item.targetType,
          targetId: item.targetId,
          metadata: item.metadata,
          ipAddress: item.ipAddress,
          userAgent: item.userAgent,
          createdAt: item.createdAt.toISOString(),
        }
      }),
      pagination: buildPaginationMeta(query, total),
      summary: null,
    }
  })
}
