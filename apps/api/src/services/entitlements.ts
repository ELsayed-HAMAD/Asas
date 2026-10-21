import type { PrismaClient } from '@prisma/client'
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

/**
 * Checks whether a workspace has available seat capacity for new invitations or members.
 */
export async function checkSeatEntitlement(
  prisma: PrismaClient,
  tenantId: string,
): Promise<SeatEntitlementResult> {
  const [subscription, memberCount, pendingInvites] = await Promise.all([
    prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.member.count({ where: { tenantId } }),
    prisma.invitation.count({ where: { tenantId, status: 'pending' } }),
  ])

  const seatLimit = subscription?.seatLimit ?? 5
  const seatsUsed = memberCount + pendingInvites

  return {
    allowed: seatsUsed < seatLimit,
    seatsUsed,
    seatLimit,
  }
}

/**
 * Checks whether a workspace has remaining storage quota for file uploads or exports.
 */
export async function checkStorageEntitlement(
  prisma: PrismaClient,
  tenantId: string,
  additionalBytes = 0,
): Promise<StorageEntitlementResult> {
  const subscription = await prisma.subscription.findFirst({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  })

  const storageLimitGb = subscription ? Number(subscription.storageLimitGb) : 10

  const [exportsCount, resumesCount] = await Promise.all([
    prisma.exportJob.count({ where: { tenantId, status: 'DONE' } }),
    prisma.candidate.count({ where: { tenantId, resumeUrl: { not: null } } }),
  ])

  // Approx 2 MB per candidate resume, 5 MB per completed export bundle
  const approximateUsedBytes = resumesCount * 2 * 1024 * 1024 + exportsCount * 5 * 1024 * 1024 + additionalBytes
  const storageUsedGb = Number((approximateUsedBytes / (1024 * 1024 * 1024)).toFixed(3))

  return {
    allowed: storageUsedGb <= storageLimitGb,
    storageUsedGb,
    storageLimitGb,
  }
}

/**
 * Validates that the tenant has an active subscription or valid trial/grace period.
 * Throws AppError(402) if canceled, unpaid, or past-due beyond grace period.
 */
export async function assertSubscriptionActive(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  const subscription = await prisma.subscription.findFirst({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  })

  // If no subscription record exists, tenant operates under standard active trial/free tier
  if (!subscription) return

  if (subscription.status === 'CANCELED') {
    throw new AppError(402, 'Workspace subscription is inactive. Please renew or upgrade your plan to perform this action.')
  }

  if (subscription.status === 'PAST_DUE') {
    // 7-day grace period from last renewal / update
    const gracePeriodMs = 7 * 24 * 60 * 60 * 1000
    const referenceDate = subscription.renewsOn ? new Date(subscription.renewsOn).getTime() : 0
    if (referenceDate > 0 && Date.now() - referenceDate > gracePeriodMs) {
      throw new AppError(402, 'Subscription payment is past due and grace period has expired. Please update your billing details.')
    }
  }
}
