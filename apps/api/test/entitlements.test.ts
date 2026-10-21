import type { PrismaClient, Subscription } from '@prisma/client'
import { PLATFORM_PLANS } from '@asas/contracts'
import { describe, expect, it } from 'vitest'
import {
  checkSeatEntitlement,
  checkStorageEntitlement,
  resolveEffectivePlanLimits,
} from '../src/services/entitlements.js'
import type { ObjectStorage } from '../src/services/objectStorage.js'

const freePlan = PLATFORM_PLANS.find(plan => plan.id === 'free')!

describe('plan entitlements', () => {
  it('uses the Free plan when a workspace has no subscription record', async () => {
    const prisma = {
      subscription: { findMany: async () => [] },
      member: { count: async () => 3 },
      invitation: { count: async () => 1 },
    } as unknown as PrismaClient

    const result = await checkSeatEntitlement(prisma, 'tenant_1')
    expect(result).toEqual({ allowed: true, seatsUsed: 4, seatLimit: freePlan.seatLimit })
  })

  it('counts pending invitations when enforcing the Free seat limit', async () => {
    const prisma = {
      subscription: { findMany: async () => [] },
      member: { count: async () => 4 },
      invitation: { count: async () => 1 },
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
})
