import { Prisma, type PrismaClient } from '@prisma/client'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it, vi } from 'vitest'
import { listStockMovements, recordStockMovement } from '../src/modules/inventory/inventory.service.js'

function movementSetup(count = 1) {
  const tx = {
    product: {
      updateMany: vi.fn().mockResolvedValue({ count }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ stock: 2 }),
    },
    stockMovement: { create: vi.fn().mockResolvedValue({
      id: 'move_1', productId: 'product_1', delta: -3, note: null,
      createdAt: new Date(), product: { name: 'Product', warehouse: null },
    }) },
  }
  const prisma = {
    product: { findFirst: vi.fn().mockResolvedValue({ id: 'product_1', stock: 10 }) },
    $transaction: vi.fn(async (work: (client: unknown) => unknown) => work(tx)),
  } as unknown as PrismaClient
  return { prisma, tx }
}

describe('stock integrity', () => {
  it('enforces stock availability in the write and returns the updated stock, not the stale read', async () => {
    const { prisma, tx } = movementSetup()
    const result = await recordStockMovement(prisma, 'tenant_1', { productId: 'product_1', delta: -3 })
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'product_1', tenantId: 'tenant_1', archivedAt: null, stock: { gte: 3 } },
      data: { stock: { increment: -3 } },
    })
    expect(result.newStock).toBe(2)
  })
  it('does not create a movement when an atomic decrement loses the stock race', async () => {
    const { prisma, tx } = movementSetup(0)
    await expect(recordStockMovement(prisma, 'tenant_1', { productId: 'product_1', delta: -3 })).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.stockMovement.create).not.toHaveBeenCalled()
  })
  it('returns positive OUT totals and applies filters to counts and aggregates', async () => {
    const stockMovement = {
      findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(2),
      aggregate: vi.fn().mockResolvedValueOnce({ _sum: { delta: 10 } }).mockResolvedValueOnce({ _sum: { delta: -7 } }),
    }
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: 'UTC' }) },
      $queryRaw: vi.fn().mockResolvedValue([{ currentIn: 0n, currentOut: 0n, previousIn: 0n, previousOut: 0n }]),
      stockMovement,
    } as unknown as PrismaClient
    const result = await listStockMovements(prisma, 'tenant_1', { page: 1, limit: 10, productId: 'product_1' })
    expect(result.summary.totalOut).toBe(7)
    expect(stockMovement.count).toHaveBeenCalledWith({ where: { tenantId: 'tenant_1', productId: 'product_1' } })
    expect(stockMovement.aggregate).toHaveBeenLastCalledWith({
      where: { AND: [{ tenantId: 'tenant_1', productId: 'product_1' }, { delta: { lt: 0 } }] }, _sum: { delta: true },
    })
  })

  it('compares recorded product movements in tenant-local month windows and isolates the product', async () => {
    const db = new PGlite()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T00:30:00.000Z'))
    try {
      await db.exec(`
        CREATE TABLE "StockMovement" ("tenantId" TEXT, "productId" TEXT, "delta" INTEGER, "createdAt" TIMESTAMP);
        INSERT INTO "StockMovement" VALUES
          ('tenant_1', 'product_1', 10, '2026-10-01 00:00:00'),
          ('tenant_1', 'product_1', -3, '2026-10-05 12:00:00'),
          ('tenant_1', 'product_1', 6, '2026-09-01 00:00:00'),
          ('tenant_1', 'product_1', -2, '2026-09-04 12:00:00'),
          ('tenant_1', 'product_2', 50, '2026-10-02 00:00:00'),
          ('tenant_2', 'product_1', 70, '2026-10-02 00:00:00');
      `)
      const stockMovement = {
        findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0),
        aggregate: vi.fn().mockResolvedValue({ _sum: { delta: null } }),
      }
      const prisma = {
        tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: 'Africa/Cairo' }) },
        stockMovement,
        $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const query = Prisma.sql(strings, ...values)
          let parameter = 0
          const sql = query.sql.replace(/\?/g, () => `$${++parameter}`)
          const result = await db.query(sql, query.values)
          return result.rows
        },
      } as unknown as PrismaClient

      const result = await listStockMovements(prisma, 'tenant_1', { page: 1, limit: 10, productId: 'product_1' })
      expect(result.summary.recordedThisMonth).toEqual({ totalIn: 10, totalOut: 3 })
      expect(result.summary.recordedThisMonthComparison).toMatchObject({
        previousStartDate: '2026-09-01', previousEndDateExclusive: '2026-09-09', totalIn: 6, totalOut: 2,
      })
    } finally {
      vi.useRealTimers()
      await db.close()
    }
  }, 30_000)
})
