import type { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import {
  assertSubscriptionActive,
  checkSeatEntitlement,
  checkStorageEntitlement,
} from '../src/services/entitlements.js'

describe('Finding 19: Subscription Entitlements Enforcement', () => {
  it('allows invitation when seats are within plan limit', async () => {
    const prisma = {
      subscription: {
        findFirst: async () => ({ seatLimit: 10 }),
      },
      member: {
        count: async () => 4,
      },
      invitation: {
        count: async () => 2,
      },
    } as unknown as PrismaClient

    const result = await checkSeatEntitlement(prisma, 'tenant_1')
    expect(result.allowed).toBe(true)
    expect(result.seatsUsed).toBe(6)
    expect(result.seatLimit).toBe(10)
  })

  it('rejects invitation when seats exceed plan limit', async () => {
    const prisma = {
      subscription: {
        findFirst: async () => ({ seatLimit: 5 }),
      },
      member: {
        count: async () => 4,
      },
      invitation: {
        count: async () => 1,
      },
    } as unknown as PrismaClient

    const result = await checkSeatEntitlement(prisma, 'tenant_1')
    expect(result.allowed).toBe(false)
    expect(result.seatsUsed).toBe(5)
    expect(result.seatLimit).toBe(5)
  })

  it('evaluates storage quota accurately', async () => {
    const prisma = {
      subscription: {
        findFirst: async () => ({ storageLimitGb: 1 }),
      },
      exportJob: {
        count: async () => 5,
      },
      candidate: {
        count: async () => 10,
      },
    } as unknown as PrismaClient

    const result = await checkStorageEntitlement(prisma, 'tenant_1')
    expect(result.allowed).toBe(true)
    expect(result.storageLimitGb).toBe(1)
  })

  it('rejects write actions on canceled subscriptions with 402 Payment Required', async () => {
    const prisma = {
      subscription: {
        findFirst: async () => ({ status: 'CANCELED' }),
      },
    } as unknown as PrismaClient

    await expect(assertSubscriptionActive(prisma, 'tenant_1')).rejects.toThrow(/subscription is inactive/i)
  })

  it('allows actions during active trial or active subscription', async () => {
    const prisma = {
      subscription: {
        findFirst: async () => ({ status: 'ACTIVE' }),
      },
    } as unknown as PrismaClient

    await expect(assertSubscriptionActive(prisma, 'tenant_1')).resolves.toBeUndefined()
  })
})

