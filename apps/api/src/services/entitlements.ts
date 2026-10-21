import type { Prisma, PrismaClient, Subscription } from '@prisma/client'
import { PLATFORM_PLANS } from '@asas/contracts'
import { getTenantStorageBytes, type ObjectStorage } from './objectStorage.js'
import { withTenantContext } from './rls.js'
import { AppError } from '../utils/errors.js'

export interface SeatEntitlementResult {
  allowed: boolean
  seatsUsed: number
  seatLimit: number
}

export interface StorageEntitlementResult {
  allowed: boolean
  storageUsedGb: number
  storageLimitGb: number
}

export interface EffectivePlanLimits {
  planName: string
  seatLimit: number
  storageLimitGb: number
  status: 'ACTIVE'
  source: 'subscription' | 'free-fallback'
}

const FREE_PLAN = PLATFORM_PLANS.find(plan => plan.id === 'free')!
const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000
const BYTES_PER_GB = 1_000_000_000

function isWithinPastDueGrace(subscription: Subscription, now: Date): boolean {
  const reference = subscription.renewsOn ?? subscription.updatedAt
  return now.getTime() <= reference.getTime() + PAST_DUE_GRACE_MS
}

/**
 * Resolve the plan that currently grants capacity. A still-active or grace-period Stripe plan
 * takes precedence over the Free row left behind by checkout. Once that paid plan is canceled
 * or its grace period expires, the workspace falls back to its active Free row or the canonical
 * platform Free limits. A stale canceled paid row must never continue granting paid quotas.
 */
export function resolveEffectivePlanLimits(
  subscriptions: readonly Subscription[],
  now = new Date(),
): EffectivePlanLimits {
  const activePaid = subscriptions.find(row => row.status === 'ACTIVE' && row.stripeSubscriptionId !== null)
  if (activePaid) {
    return {
      planName: activePaid.planName,
      seatLimit: activePaid.seatLimit,
      storageLimitGb: Number(activePaid.storageLimitGb),
      status: 'ACTIVE',
      source: 'subscription',
    }
  }

  const gracePaid = subscriptions.find(row =>
    row.status === 'PAST_DUE' && row.stripeSubscriptionId !== null && isWithinPastDueGrace(row, now),
  )
  if (gracePaid) {
    return {
      planName: gracePaid.planName,
      seatLimit: gracePaid.seatLimit,
      storageLimitGb: Number(gracePaid.storageLimitGb),
      status: 'ACTIVE',
      source: 'subscription',
    }
  }

  const activeFree = subscriptions.find(row =>
    row.status === 'ACTIVE' && row.stripeSubscriptionId === null && row.planName === FREE_PLAN.name,
  )
  if (activeFree) {
    return {
      planName: FREE_PLAN.name,
      seatLimit: FREE_PLAN.seatLimit,
      storageLimitGb: FREE_PLAN.storageLimitGb,
      status: 'ACTIVE',
      source: 'subscription',
    }
  }

  return {
    planName: FREE_PLAN.name,
    seatLimit: FREE_PLAN.seatLimit,
    storageLimitGb: FREE_PLAN.storageLimitGb,
    status: 'ACTIVE',
    source: 'free-fallback',
  }
}

async function effectivePlanLimits(
  prisma: Pick<PrismaClient, 'subscription'> | Pick<Prisma.TransactionClient, 'subscription'>,
  tenantId: string,
  now = new Date(),
): Promise<EffectivePlanLimits> {
  const subscriptions = await prisma.subscription.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  })
  return resolveEffectivePlanLimits(subscriptions, now)
}

/** Checks available seats against the effective plan, including pending invitations. */
export async function checkSeatEntitlement(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
): Promise<SeatEntitlementResult> {
  const [plan, memberCount, pendingInvites] = await Promise.all([
    effectivePlanLimits(prisma, tenantId),
    prisma.member.count({ where: { tenantId } }),
    prisma.invitation.count({ where: { tenantId, status: 'pending' } }),
  ])

  const seatsUsed = memberCount + pendingInvites
  return { allowed: seatsUsed < plan.seatLimit, seatsUsed, seatLimit: plan.seatLimit }
}

/** Measures actual tenant object bytes and checks a proposed write against the effective plan. */
export async function checkStorageEntitlement(
  prisma: PrismaClient | Prisma.TransactionClient,
  storage: ObjectStorage,
  tenantId: string,
  additionalBytes = 0,
  reclaimedBytes = 0,
): Promise<StorageEntitlementResult> {
  if (!Number.isSafeInteger(additionalBytes) || additionalBytes < 0 || !Number.isSafeInteger(reclaimedBytes) || reclaimedBytes < 0) {
    throw new AppError(400, 'Storage adjustments must be non-negative whole numbers of bytes')
  }

  const [plan, usedBytes] = await Promise.all([
    effectivePlanLimits(prisma, tenantId),
    getTenantStorageBytes(storage, tenantId),
  ])
  const limitBytes = plan.storageLimitGb * BYTES_PER_GB
  return {
    allowed: Math.max(0, usedBytes - reclaimedBytes) + additionalBytes <= limitBytes,
    storageUsedGb: Number((usedBytes / BYTES_PER_GB).toFixed(3)),
    storageLimitGb: plan.storageLimitGb,
  }
}

/**
 * Serializes tenant object writes across API replicas. The advisory transaction lock is held
 * through the storage write, so another uploader/export worker cannot pass quota using the same
 * stale byte count. Failed writes release the database lock and leave no quota reservation.
 */
export async function withStorageCapacity<T>(
  prisma: PrismaClient,
  storage: ObjectStorage,
  tenantId: string,
  additionalBytes: number,
  write: (tx: Prisma.TransactionClient) => Promise<T>,
  reclaimedBytes: number | (() => Promise<number>) = 0,
): Promise<T> {
  return withTenantContext(prisma, tenantId, async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId}, 0))`
    const reclaim = typeof reclaimedBytes === 'function' ? await reclaimedBytes() : reclaimedBytes
    const check = await checkStorageEntitlement(tx, storage, tenantId, additionalBytes, reclaim)
    if (!check.allowed) {
      throw new AppError(402, 'Workspace storage quota exceeded. Free up storage or switch to a plan with more capacity.')
    }
    return write(tx)
  })
}
