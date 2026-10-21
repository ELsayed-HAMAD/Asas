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
const SEAT_RESERVATION_TTL_MS = 10 * 60 * 1000

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
  const now = new Date()
  const [plan, memberCount, pendingInvitations, activeReservations] = await Promise.all([
    effectivePlanLimits(prisma, tenantId),
    prisma.member.count({ where: { tenantId } }),
    prisma.invitation.findMany({
      where: { tenantId, status: 'pending', expiresAt: { gt: now } },
      select: { id: true },
    }),
    prisma.seatReservation.findMany({
      where: { tenantId, expiresAt: { gt: now } },
      select: { invitationId: true },
    }),
  ])
  const pendingInvitationIds = new Set(pendingInvitations.map(invitation => invitation.id))
  const pendingInvites = pendingInvitations.length
  const reservationsWithoutPendingInvite = activeReservations.filter(
    reservation => !reservation.invitationId || !pendingInvitationIds.has(reservation.invitationId),
  ).length

  const seatsUsed = memberCount + pendingInvites + reservationsWithoutPendingInvite
  return { allowed: seatsUsed < plan.seatLimit, seatsUsed, seatLimit: plan.seatLimit }
}

export interface ReserveWorkspaceSeatOptions {
  purpose: 'INVITATION' | 'INVITATION_ACCEPTANCE' | 'MEMBER'
  invitationId?: string
}

/**
 * Creates a short-lived seat reservation under a tenant advisory lock. Better Auth's hooks run
 * before and after its writes in separate transactions, so the reservation closes the gap
 * between the capacity check and the actual invitation/member insert across API replicas.
 * A pending invitation being accepted is excluded from the count while its replacement
 * reservation is created, keeping the slot continuously occupied.
 */
export async function reserveWorkspaceSeat(
  prisma: PrismaClient,
  tenantId: string,
  options: ReserveWorkspaceSeatOptions,
): Promise<string | null> {
  return withTenantContext(prisma, tenantId, async tx => {
    const lockKey = `seat-capacity:${tenantId}`
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))` // tenant-filter: tenantId is included in lockKey
    const now = new Date()

    const expired = await tx.seatReservation.findMany({
      where: { tenantId, expiresAt: { lte: now } },
      select: { id: true, invitationId: true },
    })
    for (const reservation of expired) {
      const invitation = reservation.invitationId
        ? await tx.invitation.findFirst({ where: { id: reservation.invitationId, tenantId } })
        : await tx.invitation.findFirst({ where: { tenantId, seatReservationId: reservation.id } })
      if (invitation?.seatReservationId === reservation.id) {
        if (invitation.status === 'accepted') {
          const member = await tx.member.findFirst({
            where: { tenantId, user: { email: { equals: invitation.email, mode: 'insensitive' } } },
            select: { id: true },
          })
          await tx.invitation.update({
            where: { id: invitation.id },
            data: {
              ...(member ? {} : { status: invitation.expiresAt > now ? 'pending' : 'expired' }),
              seatReservationId: null,
            },
          })
        } else {
          await tx.invitation.update({ where: { id: invitation.id }, data: { seatReservationId: null } })
        }
      }
      await tx.member.updateMany({ where: { tenantId, seatReservationId: reservation.id }, data: { seatReservationId: null } })
      await tx.seatReservation.delete({ where: { id: reservation.id } })
    }

    const plan = await effectivePlanLimits(tx, tenantId, now)
    const existing = options.invitationId
      ? await tx.seatReservation.findFirst({ where: { tenantId, invitationId: options.invitationId } })
      : null
    const [members, invitations, reservations] = await Promise.all([
      tx.member.count({ where: { tenantId } }),
      tx.invitation.count({
        where: {
          tenantId,
          status: 'pending',
          expiresAt: { gt: now },
          seatReservationId: null,
          ...(options.invitationId ? { id: { not: options.invitationId } } : {}),
        },
      }),
      tx.seatReservation.count({ where: { tenantId, expiresAt: { gt: now } } }),
    ])
    const activeExistingReservation = existing && existing.expiresAt > now ? 1 : 0
    if (members + invitations + reservations - activeExistingReservation >= plan.seatLimit) return null

    const expiresAt = new Date(now.getTime() + SEAT_RESERVATION_TTL_MS)
    let reservationId: string
    if (existing) {
      const refreshed = await tx.seatReservation.update({
        where: { id: existing.id },
        data: { purpose: options.purpose, expiresAt },
      })
      reservationId = refreshed.id
    } else {
      const reservation = await tx.seatReservation.create({
        data: {
          tenantId,
          ...(options.invitationId ? { invitationId: options.invitationId } : {}),
          purpose: options.purpose,
          expiresAt,
        },
      })
      reservationId = reservation.id
    }

    if (options.purpose === 'INVITATION_ACCEPTANCE' && options.invitationId) {
      const linked = await tx.invitation.updateMany({
        where: { id: options.invitationId, tenantId, status: 'pending', expiresAt: { gt: now } },
        data: { seatReservationId: reservationId },
      })
      if (linked.count !== 1) {
        await tx.seatReservation.deleteMany({ where: { id: reservationId, tenantId } })
        return null
      }
    }
    return reservationId
  })
}

/** Releases a completed Better Auth reservation and clears its back-reference. */
export async function releaseWorkspaceSeat(prisma: PrismaClient, tenantId: string, reservationId: string): Promise<void> {
  await withTenantContext(prisma, tenantId, async tx => {
    const lockKey = `seat-capacity:${tenantId}`
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))` // tenant-filter: tenantId is included in lockKey
    await Promise.all([
      tx.invitation.updateMany({ where: { tenantId, seatReservationId: reservationId }, data: { seatReservationId: null } }),
      tx.member.updateMany({ where: { tenantId, seatReservationId: reservationId }, data: { seatReservationId: null } }),
      tx.seatReservation.deleteMany({ where: { id: reservationId, tenantId } }),
    ])
  })
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
