import type { PrismaClient, Subscription } from '@prisma/client'
import { PLATFORM_PLANS } from '@asas/contracts'
import { describe, expect, it } from 'vitest'
import {
  checkSeatEntitlement,
  checkStorageEntitlement,
  reserveWorkspaceSeat,
  resolveEffectivePlanLimits,
} from '../src/services/entitlements.js'
import type { ObjectStorage } from '../src/services/objectStorage.js'

const freePlan = PLATFORM_PLANS.find(plan => plan.id === 'free')!

describe('plan entitlements', () => {
  it('uses the Free plan when a workspace has no subscription record', async () => {
    const prisma = {
      subscription: { findMany: async () => [] },
      member: { count: async () => 3 },
      invitation: { findMany: async () => [{ id: 'invite_1' }] },
      seatReservation: { findMany: async () => [] },
    } as unknown as PrismaClient

    const result = await checkSeatEntitlement(prisma, 'tenant_1')
    expect(result).toEqual({ allowed: true, seatsUsed: 4, seatLimit: freePlan.seatLimit })
  })

  it('counts pending invitations when enforcing the Free seat limit', async () => {
    const prisma = {
      subscription: { findMany: async () => [] },
      member: { count: async () => 4 },
      invitation: { findMany: async () => [{ id: 'invite_1' }] },
      seatReservation: { findMany: async () => [] },
    } as unknown as PrismaClient

    const result = await checkSeatEntitlement(prisma, 'tenant_1')
    expect(result).toEqual({ allowed: false, seatsUsed: 5, seatLimit: freePlan.seatLimit })
  })

  it('counts an invitation acceptance reservation once while the invitation is still pending', async () => {
    const prisma = {
      subscription: { findMany: async () => [] },
      member: { count: async () => 4 },
      invitation: { findMany: async () => [{ id: 'invite_1' }] },
      seatReservation: { findMany: async () => [{ invitationId: 'invite_1' }] },
    } as unknown as PrismaClient

    const result = await checkSeatEntitlement(prisma, 'tenant_1')
    expect(result).toEqual({ allowed: false, seatsUsed: 5, seatLimit: freePlan.seatLimit })
  })

  it('measures tenant object bytes and includes the proposed write', async () => {
    const prisma = { subscription: { findMany: async () => [] } } as unknown as PrismaClient
    const storage = {
      sumPrefixSizes: async () => 2_000,
    } as unknown as ObjectStorage

    const result = await checkStorageEntitlement(prisma, storage, 'tenant_1', 1_000)
    expect(result.allowed).toBe(true)
    expect(result.storageUsedGb).toBe(0)
    expect(result.storageLimitGb).toBe(freePlan.storageLimitGb)
  })

  it('falls back to Free when the paid subscription is canceled', () => {
    const canceledPaid = {
      status: 'CANCELED',
      stripeSubscriptionId: 'sub_paid',
      planName: 'Professional Scale',
      seatLimit: 50,
      storageLimitGb: 100,
    } as unknown as Subscription

    expect(resolveEffectivePlanLimits([canceledPaid])).toMatchObject({
      planName: freePlan.name,
      seatLimit: freePlan.seatLimit,
      storageLimitGb: freePlan.storageLimitGb,
      source: 'free-fallback',
    })
  })

  it('serializes concurrent reservations so only the last available seat can be claimed once', async () => {
    let lockTail = Promise.resolve()
    const reservations: Array<{ id: string; tenantId: string; invitationId: string | null; purpose: string; expiresAt: Date }> = []
    const tx = {
      $executeRawUnsafe: async () => 1,
      $queryRaw: async () => {
        const previous = lockTail
        let release = () => undefined
        lockTail = new Promise<void>(resolve => { release = resolve })
        await previous
        return release
      },
      subscription: { findMany: async () => [] },
      member: {
        count: async () => 4,
        findFirst: async () => null,
        updateMany: async () => ({ count: 0 }),
      },
      invitation: {
        count: async () => 0,
        findFirst: async () => null,
        updateMany: async () => ({ count: 0 }),
      },
      seatReservation: {
        findMany: async () => [],
        findFirst: async () => null,
        count: async () => reservations.length,
        create: async ({ data }: { data: Omit<typeof reservations[number], 'id'> }) => {
          const row = { id: `reservation_${reservations.length + 1}`, ...data }
          reservations.push(row)
          return row
        },
        update: async () => { throw new Error('unexpected reservation refresh') },
        delete: async () => undefined,
      },
    }
    const prisma = {
      $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => {
        let releaseLock: (() => void) | undefined
        const transaction = {
          ...tx,
          $queryRaw: async () => {
            releaseLock = await tx.$queryRaw()
            return []
          },
        }
        try {
          return await callback(transaction)
        } finally {
          releaseLock?.()
        }
      },
    } as unknown as PrismaClient

    const results = await Promise.all([
      reserveWorkspaceSeat(prisma, 'tenant_1', { purpose: 'INVITATION' }),
      reserveWorkspaceSeat(prisma, 'tenant_1', { purpose: 'INVITATION' }),
    ])

    expect(results.filter(Boolean)).toHaveLength(1)
    expect(reservations).toHaveLength(1)
  })

  it('links an invitation acceptance reservation in the same transaction', async () => {
    const reservationRows: Array<{ id: string; tenantId: string; invitationId: string | null; purpose: string; expiresAt: Date }> = []
    let linkedReservationId: string | null = null
    const tx = {
      $executeRawUnsafe: async () => 1,
      $queryRaw: async () => [],
      subscription: { findMany: async () => [] },
      member: { count: async () => 4, updateMany: async () => ({ count: 0 }) },
      invitation: {
        count: async ({ where }: { where: { id: { not: string }; seatReservationId: null } }) => {
          expect(where.id.not).toBe('invite_1')
          expect(where.seatReservationId).toBeNull()
          return 0
        },
        updateMany: async ({ data }: { data: { seatReservationId: string } }) => {
          linkedReservationId = data.seatReservationId
          return { count: 1 }
        },
      },
      seatReservation: {
        findMany: async () => [],
        findFirst: async () => null,
        count: async () => reservationRows.length,
        create: async ({ data }: { data: Omit<typeof reservationRows[number], 'id'> }) => {
          const reservation = { id: 'reservation_1', ...data }
          reservationRows.push(reservation)
          return reservation
        },
        deleteMany: async () => ({ count: 0 }),
      },
    }
    const prisma = {
      $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx),
    } as unknown as PrismaClient

    const reservationId = await reserveWorkspaceSeat(prisma, 'tenant_1', {
      purpose: 'INVITATION_ACCEPTANCE',
      invitationId: 'invite_1',
    })

    expect(reservationId).toBe('reservation_1')
    expect(linkedReservationId).toBe(reservationId)
    expect(reservationRows[0]).toMatchObject({ tenantId: 'tenant_1', invitationId: 'invite_1' })
  })
})
