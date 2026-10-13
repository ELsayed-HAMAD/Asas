import { describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import { trialBalance, invalidateLedgerCache } from '../src/modules/finance/ledger.service.js'

describe('Trial Balance Read-Model Caching & Invalidation', () => {
  it('caches trial balance result across identical queries and re-queries after invalidation', async () => {
    const queryRawSpy = vi.fn(async () => [
      {
        accountId: 'acc_1',
        accountCode: 'CASH',
        accountName: 'Cash',
        accountKind: 'ASSET',
        currency: 'USD',
        debit: new Prisma.Decimal('1000'),
        credit: new Prisma.Decimal('0'),
        debitBase: new Prisma.Decimal('1000'),
        creditBase: new Prisma.Decimal('0'),
      },
    ])

    const mockPrisma = {
      $connect: vi.fn(),
      tenant: {
        findUnique: vi.fn(async () => ({ currency: 'USD' })),
      },
      $queryRaw: queryRawSpy,
      journalEntry: {
        count: vi.fn(async () => 0),
      },
    } as any

    const tenantId = 'tenant_cache_test'
    const asOf = '2026-10-12'

    // First call -> cache miss, executes raw query
    const res1 = await trialBalance(mockPrisma, tenantId, asOf)
    expect(res1.totalDebitBase).toEqual({ amount: 100000, currency: 'USD' })
    expect(queryRawSpy).toHaveBeenCalledTimes(1)

    // Second call -> cache hit, does not execute raw query
    const res2 = await trialBalance(mockPrisma, tenantId, asOf)
    expect(res2.totalDebitBase).toEqual({ amount: 100000, currency: 'USD' })
    expect(queryRawSpy).toHaveBeenCalledTimes(1)

    // Invalidate cache for tenant
    invalidateLedgerCache(tenantId)

    // Third call -> cache miss after invalidation, executes raw query again
    const res3 = await trialBalance(mockPrisma, tenantId, asOf)
    expect(res3.totalDebitBase).toEqual({ amount: 100000, currency: 'USD' })
    expect(queryRawSpy).toHaveBeenCalledTimes(2)

    // Clean up
    invalidateLedgerCache()
  })
})
