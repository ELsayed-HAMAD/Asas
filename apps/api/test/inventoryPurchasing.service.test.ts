import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { createPurchaseOrder, listProductSuppliers } from '../src/modules/inventory/inventory.service.js'
import { setProductArchived } from '../src/modules/inventory/inventory.service.js'

describe('inventory purchasing', () => {
  it('lists only supplier links belonging to a tenant-owned product', async () => {
    const findFirst = vi.fn().mockResolvedValue({ suppliers: [{ supplier: { id: 'supplier_1', name: 'Northwind' } }] })
    const prisma = { product: { findFirst } } as unknown as PrismaClient

    await expect(listProductSuppliers(prisma, 'tenant_1', 'product_1')).resolves.toEqual([{ id: 'supplier_1', name: 'Northwind' }])
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'product_1', tenantId: 'tenant_1' } }))
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
})
