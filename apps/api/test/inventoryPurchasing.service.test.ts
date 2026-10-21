import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import {
  addProductSupplier,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseOrder,
  listProductSuppliers,
  receivePurchaseOrder,
  removeProductSupplier,
  setProductArchived,
} from '../src/modules/inventory/inventory.service.js'

describe('inventory purchasing', () => {
  it('lists only supplier links belonging to a tenant-owned product', async () => {
    const findFirst = vi.fn().mockResolvedValue({ suppliers: [{ supplier: { id: 'supplier_1', name: 'Northwind' } }] })
    const prisma = { product: { findFirst } } as unknown as PrismaClient

    await expect(listProductSuppliers(prisma, 'tenant_1', 'product_1')).resolves.toEqual([{ id: 'supplier_1', name: 'Northwind' }])
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'product_1', tenantId: 'tenant_1' } }))
  })

  it('adds supplier to product and returns updated supplier list', async () => {
    const productFindFirst = vi.fn().mockResolvedValue({ id: 'product_1', suppliers: [{ supplier: { id: 'supplier_1', name: 'Acme Corp' } }] })
    const supplierFindFirst = vi.fn().mockResolvedValue(null)
    const supplierCreate = vi.fn().mockResolvedValue({ id: 'supplier_1', tenantId: 'tenant_1', name: 'Acme Corp' })
    const productSupplierUpsert = vi.fn().mockResolvedValue({ productId: 'product_1', supplierId: 'supplier_1' })

    const prisma = {
      product: { findFirst: productFindFirst },
      supplier: { findFirst: supplierFindFirst, create: supplierCreate },
      productSupplier: { upsert: productSupplierUpsert },
    } as unknown as PrismaClient

    const result = await addProductSupplier(prisma, 'tenant_1', 'product_1', 'Acme Corp')
    expect(result).toEqual([{ id: 'supplier_1', name: 'Acme Corp' }])
    expect(productSupplierUpsert).toHaveBeenCalledWith({
      where: { productId_supplierId: { productId: 'product_1', supplierId: 'supplier_1' } },
      create: { productId: 'product_1', supplierId: 'supplier_1' },
      update: {},
    })
  })

  it('removes supplier from product and returns updated supplier list', async () => {
    const productFindFirst = vi.fn().mockResolvedValue({ id: 'product_1', suppliers: [] })
    const productSupplierDeleteMany = vi.fn().mockResolvedValue({ count: 1 })

    const prisma = {
      product: { findFirst: productFindFirst },
      productSupplier: { deleteMany: productSupplierDeleteMany },
    } as unknown as PrismaClient

    const result = await removeProductSupplier(prisma, 'tenant_1', 'product_1', 'supplier_1')
    expect(result).toEqual([])
    expect(productSupplierDeleteMany).toHaveBeenCalledWith({
      where: { productId: 'product_1', supplierId: 'supplier_1' },
    })
  })

  it('creates a draft purchase order with one validated, tenant-scoped line', async () => {
    const tx = {
      product: { findFirst: vi.fn().mockResolvedValue({ id: 'product_1' }) },
      purchaseOrder: { create: vi.fn().mockResolvedValue({
        id: 'po_1',
        status: 'DRAFT',
        createdAt: new Date('2026-10-05T10:00:00.000Z'),
        lines: [{ quantity: 12, product: { id: 'product_1', name: 'Widget', sku: 'W-1' } }],
      }) },
    }
    const prisma = { $transaction: vi.fn(async (callback: (client: unknown) => unknown) => callback(tx)) } as unknown as PrismaClient

    await expect(createPurchaseOrder(prisma, 'tenant_1', { productId: 'product_1', quantity: 12 })).resolves.toEqual({
      id: 'po_1', status: 'DRAFT', createdAt: '2026-10-05T10:00:00.000Z',
      productId: 'product_1', productName: 'Widget', sku: 'W-1', quantity: 12,
    })
    expect(tx.product.findFirst).toHaveBeenCalledWith({ where: { id: 'product_1', tenantId: 'tenant_1', archivedAt: null }, select: { id: true } })
    expect(tx.purchaseOrder.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { tenantId: 'tenant_1', status: 'DRAFT', lines: { create: { productId: 'product_1', quantity: 12 } } },
    }))
  })

  it('does not create an order for a product outside the tenant', async () => {
    const tx = {
      product: { findFirst: vi.fn().mockResolvedValue(null) },
      purchaseOrder: { create: vi.fn() },
    }
    const prisma = { $transaction: vi.fn(async (callback: (client: unknown) => unknown) => callback(tx)) } as unknown as PrismaClient

    await expect(createPurchaseOrder(prisma, 'tenant_1', { productId: 'foreign_product', quantity: 1 })).rejects.toThrow('Product not found')
    expect(tx.purchaseOrder.create).not.toHaveBeenCalled()
  })

  it('archives and restores products without deleting their rows or stock history', async () => {
    const product = {
      id: 'product_1', name: 'Widget', sku: 'W-1', price: { toString: () => '1.25' }, stock: 4,
      warehouse: null, aisle: null, bin: null, avgMonthlyUsage: null, leadTimeDays: null,
      minThreshold: 2, archivedAt: new Date('2026-10-05T10:00:00.000Z'),
      createdAt: new Date('2026-10-01T00:00:00.000Z'), updatedAt: new Date('2026-10-05T10:00:00.000Z'),
    }
    const prisma = {
      product: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue(product),
      },
      stockMovement: { groupBy: vi.fn().mockResolvedValue([{ productId: 'product_1', _sum: { delta: 4 } }]) },
    } as unknown as PrismaClient

    await expect(setProductArchived(prisma, 'tenant_1', 'product_1', { archived: true })).resolves.toMatchObject({
      id: 'product_1', stock: 4, archivedAt: '2026-10-05T10:00:00.000Z',
    })
    expect(prisma.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'product_1', tenantId: 'tenant_1' }, data: { archivedAt: expect.any(Date) },
    }))
    await setProductArchived(prisma, 'tenant_1', 'product_1', { archived: false })
    expect(prisma.product.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'product_1', tenantId: 'tenant_1' }, data: { archivedAt: null },
    })
  })

  describe('approvePurchaseOrder', () => {
    it('approves a draft purchase order with atomic update', async () => {
      const order = {
        id: 'po_1',
        tenantId: 'tenant_1',
        status: 'DRAFT',
        createdAt: new Date('2026-10-21T00:00:00.000Z'),
        lines: [{ productId: 'product_1', quantity: 10, product: { id: 'product_1', name: 'Widget', sku: 'W-1' } }],
      }
      const updatedOrder = {
        ...order,
        status: 'APPROVED',
        approvedAt: new Date('2026-10-21T01:00:00.000Z'),
      }

      const tx = {
        purchaseOrder: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValue(updatedOrder),
        },
      }
      const prisma = {
        purchaseOrder: { findFirst: vi.fn().mockResolvedValue(order) },
        $transaction: vi.fn(async (cb: (txClient: unknown) => unknown) => cb(tx)),
      } as unknown as PrismaClient

      const result = await approvePurchaseOrder(prisma, 'tenant_1', 'po_1')
      expect(result.status).toBe('APPROVED')
      expect(result.approvedAt).toBe('2026-10-21T01:00:00.000Z')
      expect(tx.purchaseOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'po_1', tenantId: 'tenant_1', status: 'DRAFT' },
        data: { status: 'APPROVED', approvedAt: expect.any(Date) },
      })
    })

    it('rejects approving non-existent purchase order with 404', async () => {
      const prisma = {
        purchaseOrder: { findFirst: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient

      await expect(approvePurchaseOrder(prisma, 'tenant_1', 'nonexistent')).rejects.toMatchObject({
        statusCode: 404,
        message: 'Purchase order not found',
      })
    })

    it('rejects approving non-draft order with 409', async () => {
      const order = {
        id: 'po_1',
        tenantId: 'tenant_1',
        status: 'APPROVED',
        lines: [],
      }
      const prisma = {
        purchaseOrder: { findFirst: vi.fn().mockResolvedValue(order) },
      } as unknown as PrismaClient

      await expect(approvePurchaseOrder(prisma, 'tenant_1', 'po_1')).rejects.toMatchObject({
        statusCode: 409,
        message: 'Cannot approve order with status "APPROVED"',
      })
    })

    it('rejects approval when concurrent update wins the race', async () => {
      const order = {
        id: 'po_1',
        tenantId: 'tenant_1',
        status: 'DRAFT',
        lines: [{ productId: 'product_1', quantity: 5, product: { id: 'product_1', name: 'Widget', sku: 'W-1' } }],
      }
      const tx = {
        purchaseOrder: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      }
      const prisma = {
        purchaseOrder: { findFirst: vi.fn().mockResolvedValue(order) },
        $transaction: vi.fn(async (cb: (txClient: unknown) => unknown) => cb(tx)),
      } as unknown as PrismaClient

      await expect(approvePurchaseOrder(prisma, 'tenant_1', 'po_1')).rejects.toMatchObject({
        statusCode: 409,
        message: 'Purchase order is not in an approvable state or was already updated',
      })
    })
  })

  describe('receivePurchaseOrder', () => {
    it('status gating: rejects DRAFT purchase order with 409', async () => {
      const order = {
        id: 'po_1',
        tenantId: 'tenant_1',
        status: 'DRAFT',
        lines: [{ productId: 'product_1', quantity: 5, product: { id: 'product_1', name: 'Widget', sku: 'W-1' } }],
      }
      const prisma = {
        purchaseOrder: { findFirst: vi.fn().mockResolvedValue(order) },
        $transaction: vi.fn(),
      } as unknown as PrismaClient

      await expect(receivePurchaseOrder(prisma, 'tenant_1', 'po_1')).rejects.toMatchObject({
        statusCode: 409,
        message: 'Purchase order must be approved before receiving',
      })
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('status gating: rejects already RECEIVED purchase order with 409', async () => {
      const order = {
        id: 'po_1',
        tenantId: 'tenant_1',
        status: 'RECEIVED',
        lines: [],
      }
      const prisma = {
        purchaseOrder: { findFirst: vi.fn().mockResolvedValue(order) },
        $transaction: vi.fn(),
      } as unknown as PrismaClient

      await expect(receivePurchaseOrder(prisma, 'tenant_1', 'po_1')).rejects.toMatchObject({
        statusCode: 409,
        message: 'Purchase order is already received',
      })
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('status gating: rejects CANCELLED purchase order with 409', async () => {
      const order = {
        id: 'po_1',
        tenantId: 'tenant_1',
        status: 'CANCELLED',
        lines: [],
      }
      const prisma = {
        purchaseOrder: { findFirst: vi.fn().mockResolvedValue(order) },
        $transaction: vi.fn(),
      } as unknown as PrismaClient

      await expect(receivePurchaseOrder(prisma, 'tenant_1', 'po_1')).rejects.toMatchObject({
        statusCode: 409,
        message: 'Cannot receive cancelled purchase order',
      })
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('receives an approved purchase order and atomically increments stock', async () => {
      const order = {
        id: 'po_1',
        tenantId: 'tenant_1',
        status: 'APPROVED',
        createdAt: new Date('2026-10-21T00:00:00.000Z'),
        lines: [{ productId: 'product_1', quantity: 15, product: { id: 'product_1', name: 'Widget', sku: 'W-1' } }],
      }
      const receivedOrder = {
        ...order,
        status: 'RECEIVED',
        receivedAt: new Date('2026-10-21T02:00:00.000Z'),
      }

      const tx = {
        purchaseOrder: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValue(receivedOrder),
        },
        product: {
          update: vi.fn().mockResolvedValue({ id: 'product_1', stock: 25 }),
        },
        stockMovement: {
          create: vi.fn().mockResolvedValue({ id: 'sm_1' }),
        },
      }
      const prisma = {
        purchaseOrder: { findFirst: vi.fn().mockResolvedValue(order) },
        $transaction: vi.fn(async (cb: (txClient: unknown) => unknown) => cb(tx)),
      } as unknown as PrismaClient

      const result = await receivePurchaseOrder(prisma, 'tenant_1', 'po_1')
      expect(result.status).toBe('RECEIVED')
      expect(result.receivedAt).toBe('2026-10-21T02:00:00.000Z')

      expect(tx.purchaseOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'po_1', tenantId: 'tenant_1', status: 'APPROVED' },
        data: { status: 'RECEIVED', receivedAt: expect.any(Date) },
      })
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'product_1' },
        data: { stock: { increment: 15 } },
      })
      expect(tx.stockMovement.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant_1',
          productId: 'product_1',
          delta: 15,
          note: 'PO #po_1 received',
        },
      })
    })

    it('concurrency stress test: exactly one concurrent receive succeeds and stock increments once', async () => {
      const order = {
        id: 'po_1',
        tenantId: 'tenant_1',
        status: 'APPROVED',
        createdAt: new Date('2026-10-21T00:00:00.000Z'),
        lines: [{ productId: 'product_1', quantity: 10, product: { id: 'product_1', name: 'Widget', sku: 'W-1' } }],
      }

      let attempt = 0
      const tx = {
        purchaseOrder: {
          updateMany: vi.fn().mockImplementation(() => {
            attempt++
            // First call succeeds with count 1, concurrent second call gets count 0
            return Promise.resolve({ count: attempt === 1 ? 1 : 0 })
          }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            ...order,
            status: 'RECEIVED',
            receivedAt: new Date('2026-10-21T02:00:00.000Z'),
          }),
        },
        product: {
          update: vi.fn().mockResolvedValue({ id: 'product_1', stock: 20 }),
        },
        stockMovement: {
          create: vi.fn().mockResolvedValue({ id: 'sm_1' }),
        },
      }
      const prisma = {
        purchaseOrder: { findFirst: vi.fn().mockResolvedValue(order) },
        $transaction: vi.fn(async (cb: (txClient: unknown) => unknown) => cb(tx)),
      } as unknown as PrismaClient

      // Fire two receives concurrently against the same order
      const results = await Promise.allSettled([
        receivePurchaseOrder(prisma, 'tenant_1', 'po_1'),
        receivePurchaseOrder(prisma, 'tenant_1', 'po_1'),
      ])

      const succeeded = results.filter(r => r.status === 'fulfilled')
      const rejected = results.filter(r => r.status === 'rejected')

      expect(succeeded).toHaveLength(1)
      expect(rejected).toHaveLength(1)

      const rejectionReason = (rejected[0] as PromiseRejectedResult).reason
      expect(rejectionReason.statusCode).toBe(409)
      expect(rejectionReason.message).toBe('Purchase order is not in an approvable state or was already received')

      // Crucial assertion: Product stock incremented exactly ONCE, StockMovement created ONCE
      expect(tx.product.update).toHaveBeenCalledTimes(1)
      expect(tx.stockMovement.create).toHaveBeenCalledTimes(1)
    })
  })

  describe('cancelPurchaseOrder', () => {
    it('cancels a draft purchase order', async () => {
      const order = {
        id: 'po_1',
        tenantId: 'tenant_1',
        status: 'DRAFT',
        createdAt: new Date('2026-10-21T00:00:00.000Z'),
        lines: [{ productId: 'product_1', quantity: 5, product: { id: 'product_1', name: 'Widget', sku: 'W-1' } }],
      }
      const tx = {
        purchaseOrder: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({ ...order, status: 'CANCELLED' }),
        },
      }
      const prisma = {
        purchaseOrder: { findFirst: vi.fn().mockResolvedValue(order) },
        $transaction: vi.fn(async (cb: (txClient: unknown) => unknown) => cb(tx)),
      } as unknown as PrismaClient

      const result = await cancelPurchaseOrder(prisma, 'tenant_1', 'po_1')
      expect(result.status).toBe('CANCELLED')
      expect(tx.purchaseOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'po_1', tenantId: 'tenant_1', status: { in: ['DRAFT', 'APPROVED'] } },
        data: { status: 'CANCELLED' },
      })
    })

    it('rejects cancelling an already received order with 409', async () => {
      const order = { id: 'po_1', tenantId: 'tenant_1', status: 'RECEIVED', lines: [] }
      const prisma = {
        purchaseOrder: { findFirst: vi.fn().mockResolvedValue(order) },
      } as unknown as PrismaClient

      await expect(cancelPurchaseOrder(prisma, 'tenant_1', 'po_1')).rejects.toMatchObject({
        statusCode: 409,
        message: 'Cannot cancel already received purchase order',
      })
    })
  })
})
