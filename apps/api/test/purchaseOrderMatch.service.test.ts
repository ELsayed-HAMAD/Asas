import { Prisma, type PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import {
  activatePurchaseOrderMatch,
  listMatchablePurchaseOrders,
  resolvePurchaseOrderMatch,
  reversePurchaseOrderMatchIfPresent,
} from '../src/modules/finance/purchaseOrderMatch.service.js'

const postedAt = new Date('2026-10-25T10:00:00.000Z')

function evidenceOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'po_1',
    tenantId: 'tenant_1',
    vendorId: 'vendor_1',
    status: 'RECEIVED',
    receivedAt: postedAt,
    lines: [{
      productId: 'product_1',
      quantity: 5,
      product: { name: 'Widget', sku: 'W-1' },
    }],
    valuationEvents: [{
      id: 'event_1',
      reason: 'PURCHASE_RECEIPT',
      productId: 'product_1',
      quantityDelta: 5,
      costValue: new Prisma.Decimal('62.5000'),
      currency: 'USD',
      journalEntryId: 'journal_1',
      postedAt,
      journalEntry: {
        id: 'journal_1',
        amount: new Prisma.Decimal('62.5000'),
        sourceType: 'INVENTORY_RECEIPT',
        reversedBy: null,
        lines: [
          {
            side: 'DEBIT',
            amount: new Prisma.Decimal('62.5000'),
            accountId: 'inventory_account',
            account: { tenantId: 'tenant_1', kind: 'ASSET', currency: 'USD' },
          },
          {
            side: 'CREDIT',
            amount: new Prisma.Decimal('62.5000'),
            accountId: 'grni_account',
            account: { tenantId: 'tenant_1', kind: 'LIABILITY', currency: 'USD' },
          },
        ],
      },
    }],
    invoiceMatches: [],
    ...overrides,
  }
}

function clientFor(order: unknown) {
  return {
    purchaseOrder: { findFirst: vi.fn().mockResolvedValue(order) },
  } as unknown as PrismaClient
}

describe('exact purchase-order / supplier-bill matching', () => {
  it('resolves one full valued receipt and its exact GRNI liability account', async () => {
    const client = clientFor(evidenceOrder())
    await expect(resolvePurchaseOrderMatch(client, {
      tenantId: 'tenant_1',
      vendorId: 'vendor_1',
      purchaseOrderId: 'po_1',
      invoiceAmount: '62.50',
      invoiceCurrency: 'USD',
    })).resolves.toMatchObject({
      purchaseOrderId: 'po_1',
      valuationEventId: 'event_1',
      journalEntryId: 'journal_1',
      grniAccountId: 'grni_account',
      amount: '62.5',
      currency: 'USD',
      productName: 'Widget',
      sku: 'W-1',
      quantity: 5,
    })
  })

  it('rejects a bill whose amount is not exactly the received value', async () => {
    const client = clientFor(evidenceOrder())
    await expect(resolvePurchaseOrderMatch(client, {
      tenantId: 'tenant_1',
      vendorId: 'vendor_1',
      purchaseOrderId: 'po_1',
      invoiceAmount: '62.51',
      invoiceCurrency: 'USD',
    })).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('exactly equal') })
  })

  it('rejects currency differences instead of approximating them', async () => {
    const client = clientFor(evidenceOrder())
    await expect(resolvePurchaseOrderMatch(client, {
      tenantId: 'tenant_1',
      vendorId: 'vendor_1',
      purchaseOrderId: 'po_1',
      invoiceAmount: '62.50',
      invoiceCurrency: 'EUR',
    })).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('same currency') })
  })

  it('rejects quantity-only receipts and already matched orders', async () => {
    const quantityOnly = clientFor(evidenceOrder({ valuationEvents: [] }))
    await expect(resolvePurchaseOrderMatch(quantityOnly, {
      tenantId: 'tenant_1', vendorId: 'vendor_1', purchaseOrderId: 'po_1', invoiceAmount: '62.50', invoiceCurrency: 'USD',
    })).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('no valued receipt') })

    const matched = clientFor(evidenceOrder({ invoiceMatches: [{ id: 'match_1', status: 'ACTIVE' }] }))
    await expect(resolvePurchaseOrderMatch(matched, {
      tenantId: 'tenant_1', vendorId: 'vendor_1', purchaseOrderId: 'po_1', invoiceAmount: '62.50', invoiceCurrency: 'USD',
    })).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('already matched') })
  })

  it('rejects a reversed receipt journal', async () => {
    const order = evidenceOrder()
    order.valuationEvents[0]!.journalEntry.reversedBy = { id: 'reversal_1' }
    const client = clientFor(order)
    await expect(resolvePurchaseOrderMatch(client, {
      tenantId: 'tenant_1', vendorId: 'vendor_1', purchaseOrderId: 'po_1', invoiceAmount: '62.50', invoiceCurrency: 'USD',
    })).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('reversed') })
  })

  it('rejects a vendor mismatch', async () => {
    const client = clientFor(evidenceOrder())
    await expect(resolvePurchaseOrderMatch(client, {
      tenantId: 'tenant_1', vendorId: 'vendor_2', purchaseOrderId: 'po_1', invoiceAmount: '62.50', invoiceCurrency: 'USD',
    })).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('vendor') })
  })

  it('lists only candidates with an unreversed valued receipt journal', async () => {
    const order = evidenceOrder()
    const client = {
      vendor: { findFirst: vi.fn().mockResolvedValue({ id: 'vendor_1' }) },
      purchaseOrder: { findMany: vi.fn().mockResolvedValue([order]) },
    } as unknown as PrismaClient

    await expect(listMatchablePurchaseOrders(client, 'tenant_1', 'vendor_1')).resolves.toEqual([{
      id: 'po_1',
      productName: 'Widget',
      sku: 'W-1',
      quantity: 5,
      receivedValue: '62.5',
      receivedValueMoney: { amount: 6250, currency: 'USD' },
      currency: 'USD',
      receivedAt: postedAt.toISOString(),
    }])
  })

  it('activates once and reverses without deleting match history', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'match_1' })
    const update = vi.fn().mockResolvedValue({ id: 'match_1' })
    const tx = {
      purchaseOrderInvoiceMatch: {
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'match_1' }),
        create,
        update,
      },
    } as unknown as Prisma.TransactionClient

    await activatePurchaseOrderMatch(tx, {
      tenantId: 'tenant_1',
      payableInvoiceId: 'bill_1',
      evidence: {
        purchaseOrderId: 'po_1',
        valuationEventId: 'event_1',
        journalEntryId: 'journal_1',
        grniAccountId: 'grni_account',
        amount: '62.5',
        currency: 'USD',
        productName: 'Widget',
        sku: 'W-1',
        quantity: 5,
        receivedAt: postedAt,
      },
    })
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant_1',
        purchaseOrderId: 'po_1',
        payableInvoiceId: 'bill_1',
        activePurchaseOrderId: 'po_1',
        amount: '62.5',
        currency: 'USD',
        status: 'ACTIVE',
      }),
    })

    await expect(reversePurchaseOrderMatchIfPresent(tx, 'tenant_1', 'bill_1')).resolves.toBe(true)
    expect(update).toHaveBeenCalledWith({
      where: { id_tenantId: { id: 'match_1', tenantId: 'tenant_1' } },
      data: expect.objectContaining({ status: 'REVERSED', activePurchaseOrderId: null, reversedAt: expect.any(Date) }),
    })
  })
})
