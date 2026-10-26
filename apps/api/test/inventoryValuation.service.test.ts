import { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import {
  getInventoryValuationReport,
  postInventoryOpeningValuation,
  postValuedIssue,
  postValuedReceipt,
  reverseValuedSaleIssue,
  saveValuationSetup,
} from '../src/modules/inventory/inventoryValuation.service.js'

const postedAt = new Date('2026-10-24T09:00:00.000Z')
const configuredAt = new Date('2026-10-24T08:00:00.000Z')

const accounts = {
  INV: { id: 'acct_inv', code: 'INV', name: 'Inventory', kind: 'ASSET', currency: 'USD' },
  COGS: { id: 'acct_cogs', code: 'COGS', name: 'Cost of goods sold', kind: 'EXPENSE', currency: 'USD' },
  GRNI: { id: 'acct_grni', code: 'GRNI', name: 'Goods received not invoiced', kind: 'LIABILITY', currency: 'USD' },
  SHRINK: { id: 'acct_shrink', code: 'SHRINK', name: 'Inventory shrinkage', kind: 'EXPENSE', currency: 'USD' },
  GAIN: { id: 'acct_gain', code: 'GAIN', name: 'Inventory adjustment gain', kind: 'INCOME', currency: 'USD' },
} as const

const mapping = {
  currency: 'USD',
  inventoryAssetAccountCode: 'INV',
  costOfGoodsSoldAccountCode: 'COGS',
  goodsReceivedNotInvoicedAccountCode: 'GRNI',
  adjustmentExpenseAccountCode: 'SHRINK',
  adjustmentGainAccountCode: 'GAIN',
}

function valuationTx(options: {
  method?: 'FIFO' | 'WEIGHTED_AVERAGE'
  balance?: { id: string; onHandQuantity: number; inventoryValue: string; currency: string } | null
  layers?: Array<{ id: string; receivedAt: Date; remainingQuantity: number; remainingValue: string; tenantId: string; productId: string }>
  originalEvent?: Record<string, unknown> | null
  originalJournal?: Record<string, unknown> | null
} = {}) {
  const method = options.method ?? 'FIFO'
  const layers = options.layers ?? []
  const accountByCode = accounts as Record<string, typeof accounts[keyof typeof accounts]>
  const tx = {
    product: { findFirst: vi.fn().mockResolvedValue({ id: 'product_1', sku: 'W-1', name: 'Widget', currency: 'USD' }) },
    tenant: { findUnique: vi.fn().mockResolvedValue({ currency: 'USD' }) },
    inventoryValuationConfig: { findUnique: vi.fn().mockResolvedValue({ costingMethod: method }) },
    inventoryValuationAccountMapping: { findUnique: vi.fn().mockResolvedValue(mapping) },
    ledgerAccount: {
      findUnique: vi.fn(({ where }: { where: { tenantId_code_currency: { code: string } } }) =>
        Promise.resolve(accountByCode[where.tenantId_code_currency.code] ?? null)),
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue(Object.values(accounts)),
    },
    inventoryValuationBalance: {
      findUnique: vi.fn().mockResolvedValue(options.balance ?? null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({}),
    },
    inventoryCostLayer: {
      findMany: vi.fn().mockResolvedValue(layers),
      create: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    inventoryValuationEvent: {
      findFirst: vi.fn().mockResolvedValue(options.originalEvent ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'event_1', ...data })),
      update: vi.fn().mockResolvedValue({}),
    },
    inventoryCostAllocation: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    journalEntry: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        where.id && where.id === options.originalJournal?.id ? options.originalJournal : null),
      create: vi.fn().mockResolvedValue({ id: 'journal_1' }),
      count: vi.fn().mockResolvedValue(0),
    },
    journalLine: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit_1' }) },
  }
  return { tx, layers }
}

describe('inventory valuation posting', () => {
  it('values a FIFO receipt and posts inventory against goods received not invoiced', async () => {
    const { tx } = valuationTx()

    const result = await postValuedReceipt(tx as never, {
      tenantId: 'tenant_1',
      productId: 'product_1',
      stockMovementId: 'movement_1',
      quantity: 10,
      unitCost: '5.00',
      reason: 'PURCHASE_RECEIPT',
      postedAt,
      actorId: 'user_1',
      purchaseOrderId: 'po_1',
    })

    expect(result).toEqual({ eventId: 'event_1', journalEntryId: 'journal_1', value: '50.00' })
    expect(tx.inventoryValuationBalance.create).toHaveBeenCalledWith({
      data: { tenantId: 'tenant_1', productId: 'product_1', currency: 'USD', onHandQuantity: 10, inventoryValue: '50.00' },
    })
    expect(tx.inventoryCostLayer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'movement_1', sourceMovementId: 'movement_1', originalQuantity: 10,
        remainingQuantity: 10, originalValue: '50.00', remainingValue: '50.00', receivedAt: postedAt,
      }),
    })
    expect(tx.inventoryValuationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stockMovementId: 'movement_1', purchaseOrderId: 'po_1', costingMethod: 'FIFO', reason: 'PURCHASE_RECEIPT',
        quantityDelta: 10, costValue: '50.00', currency: 'USD',
      }),
    })
    expect(tx.journalEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sourceType: 'INVENTORY_RECEIPT', amount: '50.00', currency: 'USD' }),
    })
    expect(tx.journalLine.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ accountId: 'acct_inv', side: 'DEBIT', amount: '50.00' }),
        expect.objectContaining({ accountId: 'acct_grni', side: 'CREDIT', amount: '50.00' }),
      ],
    })
    expect(tx.inventoryValuationEvent.update).toHaveBeenCalledWith({
      where: { id: 'event_1' }, data: { journalEntryId: 'journal_1' },
    })
  })

  it('allocates a FIFO issue across the oldest layers and debits cost of goods sold', async () => {
    const { tx } = valuationTx({
      balance: { id: 'balance_1', onHandQuantity: 10, inventoryValue: '50.00', currency: 'USD' },
      layers: [
        { id: 'layer_1', receivedAt: new Date('2026-10-01T00:00:00.000Z'), remainingQuantity: 4, remainingValue: '8.00', tenantId: 'tenant_1', productId: 'product_1' },
        { id: 'layer_2', receivedAt: new Date('2026-10-02T00:00:00.000Z'), remainingQuantity: 6, remainingValue: '42.00', tenantId: 'tenant_1', productId: 'product_1' },
      ],
    })

    const result = await postValuedIssue(tx as never, {
      tenantId: 'tenant_1',
      productId: 'product_1',
      stockMovementId: 'movement_2',
      quantity: 6,
      reason: 'SALE',
      postedAt,
      actorId: 'user_1',
    })

    expect(result.value).toBe('22.00')
    expect(tx.inventoryValuationBalance.updateMany).toHaveBeenCalledWith({
      where: { id: 'balance_1', tenantId: 'tenant_1', onHandQuantity: 10 },
      data: { onHandQuantity: 4, inventoryValue: '28.00' },
    })
    expect(tx.inventoryCostLayer.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'layer_1', tenantId: 'tenant_1', remainingQuantity: 4 },
      data: { remainingQuantity: 0, remainingValue: '0.00' },
    })
    expect(tx.inventoryCostLayer.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'layer_2', tenantId: 'tenant_1', remainingQuantity: 6 },
      data: { remainingQuantity: 4, remainingValue: '28.00' },
    })
    expect(tx.inventoryCostAllocation.createMany).toHaveBeenCalledWith({
      data: [
        { tenantId: 'tenant_1', eventId: 'event_1', layerId: 'layer_1', quantity: 4, value: '8.00' },
        { tenantId: 'tenant_1', eventId: 'event_1', layerId: 'layer_2', quantity: 2, value: '14.00' },
      ],
    })
    expect(tx.journalLine.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ accountId: 'acct_cogs', side: 'DEBIT', amount: '22.00' }),
        expect.objectContaining({ accountId: 'acct_inv', side: 'CREDIT', amount: '22.00' }),
      ],
    })
  })

  it('restores a FIFO sale at its exact original value and reverses the exact issue journal', async () => {
    const originalJournal = {
      id: 'journal_issue', tenantId: 'tenant_1', currency: 'USD', amount: new Prisma.Decimal('22.00'),
      baseCurrency: 'USD', baseAmount: new Prisma.Decimal('22.00'), baseMinorUnitDigits: 2,
      fxRate: new Prisma.Decimal('1'), exchangeRateId: null, sourceType: 'INVENTORY_ISSUE',
      currencyProvenance: 'DOCUMENT', description: 'Inventory issue — W-1 (SALE)',
      lines: [
        { accountId: 'acct_cogs', side: 'DEBIT', amount: new Prisma.Decimal('22.00'), baseAmount: new Prisma.Decimal('22.00') },
        { accountId: 'acct_inv', side: 'CREDIT', amount: new Prisma.Decimal('22.00'), baseAmount: new Prisma.Decimal('22.00') },
      ],
    }
    const { tx } = valuationTx({
      balance: { id: 'balance_1', onHandQuantity: 4, inventoryValue: '28.00', currency: 'USD' },
      layers: [{ id: 'layer_2', receivedAt: new Date('2026-10-02T00:00:00.000Z'), remainingQuantity: 4, remainingValue: '28.00', tenantId: 'tenant_1', productId: 'product_1' }],
      originalEvent: {
        id: 'event_issue', tenantId: 'tenant_1', productId: 'product_1', stockMovementId: 'movement_issue',
        journalEntryId: 'journal_issue', costingMethod: 'FIFO', reason: 'SALE', quantityDelta: -6,
        costValue: new Prisma.Decimal('22.00'), currency: 'USD',
      },
      originalJournal,
    })

    const result = await reverseValuedSaleIssue(tx as never, {
      tenantId: 'tenant_1',
      productId: 'product_1',
      originalStockMovementId: 'movement_issue',
      originalValuationEventId: 'event_issue',
      reversalStockMovementId: 'movement_return',
      quantity: 6,
      postedAt,
      actorId: 'user_1',
      reason: 'Invoice voided',
    })

    expect(result).toEqual({ eventId: 'event_1', journalEntryId: 'journal_1', value: '22.00', currency: 'USD' })
    expect(tx.inventoryValuationBalance.updateMany).toHaveBeenCalledWith({
      where: { id: 'balance_1', tenantId: 'tenant_1', onHandQuantity: 4 },
      data: { onHandQuantity: 10, inventoryValue: '50.00' },
    })
    expect(tx.inventoryCostLayer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'movement_return', sourceMovementId: 'movement_return', originalQuantity: 6,
        remainingQuantity: 6, originalValue: '22.00', remainingValue: '22.00', receivedAt: postedAt,
      }),
    })
    expect(tx.journalEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceType: 'INVENTORY_REVERSAL', reversesJournalEntryId: 'journal_issue',
        reversalReason: 'Invoice voided', amount: new Prisma.Decimal('22.00'), currency: 'USD',
      }),
    })
    expect(tx.journalLine.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ accountId: 'acct_cogs', side: 'CREDIT', amount: new Prisma.Decimal('22.00') }),
        expect.objectContaining({ accountId: 'acct_inv', side: 'DEBIT', amount: new Prisma.Decimal('22.00') }),
      ],
    })
    expect(tx.inventoryValuationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stockMovementId: 'movement_return', journalEntryId: 'journal_1', reason: 'CUSTOMER_RETURN',
        quantityDelta: 6, costValue: '22.00', currency: 'USD',
      }),
    })
  })

  it('restores weighted-average quantity and value without creating a layer', async () => {
    const { tx } = valuationTx({
      method: 'WEIGHTED_AVERAGE',
      balance: { id: 'balance_1', onHandQuantity: 14, inventoryValue: '84.00', currency: 'USD' },
      originalEvent: {
        id: 'event_issue', tenantId: 'tenant_1', productId: 'product_1', stockMovementId: 'movement_issue',
        journalEntryId: null, costingMethod: 'WEIGHTED_AVERAGE', reason: 'SALE', quantityDelta: -6,
        costValue: new Prisma.Decimal('36.00'), currency: 'USD',
      },
    })

    const result = await reverseValuedSaleIssue(tx as never, {
      tenantId: 'tenant_1',
      productId: 'product_1',
      originalStockMovementId: 'movement_issue',
      originalValuationEventId: 'event_issue',
      reversalStockMovementId: 'movement_return',
      quantity: 6,
      postedAt,
      actorId: 'user_1',
      reason: 'Invoice removed',
    })

    expect(result).toEqual({ eventId: 'event_1', journalEntryId: null, value: '36.00', currency: 'USD' })
    expect(tx.inventoryValuationBalance.updateMany).toHaveBeenCalledWith({
      where: { id: 'balance_1', tenantId: 'tenant_1', onHandQuantity: 14 },
      data: { onHandQuantity: 20, inventoryValue: '120.00' },
    })
    expect(tx.inventoryCostLayer.create).not.toHaveBeenCalled()
    expect(tx.journalEntry.create).not.toHaveBeenCalled()
    expect(tx.inventoryValuationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reason: 'CUSTOMER_RETURN', journalEntryId: null, quantityDelta: 6, costValue: '36.00' }),
    })
  })

  it('refuses to reverse a quantity that differs from the original sale', async () => {
    const { tx } = valuationTx({
      balance: { id: 'balance_1', onHandQuantity: 4, inventoryValue: '28.00', currency: 'USD' },
      originalEvent: {
        id: 'event_issue', tenantId: 'tenant_1', productId: 'product_1', stockMovementId: 'movement_issue',
        journalEntryId: null, costingMethod: 'FIFO', reason: 'SALE', quantityDelta: -5,
        costValue: new Prisma.Decimal('22.00'), currency: 'USD',
      },
    })

    await expect(reverseValuedSaleIssue(tx as never, {
      tenantId: 'tenant_1',
      productId: 'product_1',
      originalStockMovementId: 'movement_issue',
      originalValuationEventId: 'event_issue',
      reversalStockMovementId: 'movement_return',
      quantity: 6,
      postedAt,
      actorId: 'user_1',
      reason: 'Invoice voided',
    })).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('does not match the original issue') })
    expect(tx.inventoryValuationBalance.updateMany).not.toHaveBeenCalled()
    expect(tx.inventoryValuationEvent.create).not.toHaveBeenCalled()
  })

  it('values a weighted-average receipt and issue without creating FIFO layers', async () => {
    const receipt = valuationTx({
      method: 'WEIGHTED_AVERAGE',
      balance: { id: 'balance_1', onHandQuantity: 10, inventoryValue: '50.00', currency: 'USD' },
    })

    await postValuedReceipt(receipt.tx as never, {
      tenantId: 'tenant_1',
      productId: 'product_1',
      stockMovementId: 'movement_3',
      quantity: 10,
      unitCost: '7.00',
      reason: 'PURCHASE_RECEIPT',
      postedAt,
      actorId: 'user_1',
    })
    expect(receipt.tx.inventoryCostLayer.create).not.toHaveBeenCalled()
    expect(receipt.tx.inventoryValuationBalance.updateMany).toHaveBeenCalledWith({
      where: { id: 'balance_1', tenantId: 'tenant_1', onHandQuantity: 10 },
      data: { onHandQuantity: 20, inventoryValue: '120.00' },
    })

    const issue = valuationTx({
      method: 'WEIGHTED_AVERAGE',
      balance: { id: 'balance_1', onHandQuantity: 20, inventoryValue: '120.00', currency: 'USD' },
    })
    await postValuedIssue(issue.tx as never, {
      tenantId: 'tenant_1',
      productId: 'product_1',
      stockMovementId: 'movement_4',
      quantity: 6,
      reason: 'DAMAGE',
      postedAt,
      actorId: 'user_1',
    })
    expect(issue.tx.inventoryValuationBalance.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'balance_1', tenantId: 'tenant_1', onHandQuantity: 20 },
      data: { onHandQuantity: 14, inventoryValue: '84.00' },
    })
    expect(issue.tx.inventoryCostLayer.updateMany).not.toHaveBeenCalled()
    expect(issue.tx.inventoryCostAllocation.createMany).not.toHaveBeenCalled()
    expect(issue.tx.journalLine.createMany).toHaveBeenLastCalledWith({
      data: [
        expect.objectContaining({ accountId: 'acct_shrink', side: 'DEBIT', amount: '36.00' }),
        expect.objectContaining({ accountId: 'acct_inv', side: 'CREDIT', amount: '36.00' }),
      ],
    })
  })

  it('rejects issuing quantity that has no established cost', async () => {
    const { tx } = valuationTx()

    await expect(postValuedIssue(tx as never, {
      tenantId: 'tenant_1',
      productId: 'product_1',
      stockMovementId: 'movement_5',
      quantity: 1,
      reason: 'SALE',
      postedAt,
      actorId: 'user_1',
    })).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('Record an opening valuation') })
    expect(tx.inventoryValuationBalance.create).not.toHaveBeenCalled()
    expect(tx.journalEntry.create).not.toHaveBeenCalled()
  })

  it('rejects a cost entered in a different currency from the product valuation', async () => {
    const { tx } = valuationTx()

    await expect(postValuedReceipt(tx as never, {
      tenantId: 'tenant_1',
      productId: 'product_1',
      stockMovementId: 'movement_6',
      quantity: 1,
      unitCost: '5.00',
      unitCostCurrency: 'EUR',
      reason: 'PURCHASE_RECEIPT',
      postedAt,
      actorId: 'user_1',
    })).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('valued in USD') })
  })

  it('creates an opening valuation layer and event without fabricating a stock movement', async () => {
    const tx = {
      ...valuationTx().tx,
      product: { findFirst: vi.fn().mockResolvedValue({ id: 'product_1', sku: 'W-1', name: 'Widget', currency: 'USD', stock: 10 }) },
      ledgerAccount: {
        findUnique: vi.fn(({ where }: { where: { tenantId_code_currency: { code: string } } }) => {
          const code = where.tenantId_code_currency.code
          if (code === 'INV') return Promise.resolve(accounts.INV)
          if (code === 'INVENTORY_OPENING_EQUITY') return Promise.resolve(null)
          return Promise.resolve(null)
        }),
        create: vi.fn().mockResolvedValue({ id: 'acct_equity', code: 'INVENTORY_OPENING_EQUITY' }),
        findMany: vi.fn().mockResolvedValue(Object.values(accounts)),
      },
      inventoryValuationBalance: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), updateMany: vi.fn() },
    }
    const prisma = { $transaction: vi.fn(async (work: (client: unknown) => unknown) => work(tx)) }

    const result = await postInventoryOpeningValuation(
      prisma as never,
      'tenant_1',
      { productId: 'product_1', unitCost: '5.00', asOf: '2026-10-24' },
      'user_1',
    )

    expect(result).toEqual({ productId: 'product_1', quantity: 10, value: '50.00', journalEntryId: 'journal_1' })
    expect(tx.inventoryCostLayer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceMovementId: null, originalQuantity: 10, remainingQuantity: 10, originalValue: '50.00',
      }),
    })
    expect(tx.inventoryValuationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stockMovementId: null, journalEntryId: 'journal_1', reason: 'OPENING_BALANCE',
        quantityDelta: 10, costValue: '50.00',
      }),
    })
    expect(tx.journalLine.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ accountId: 'acct_inv', side: 'DEBIT' }),
        expect.objectContaining({ accountId: 'acct_equity', side: 'CREDIT' }),
      ],
    })
  })

  it('refuses opening value after a Finance opening balance has been posted', async () => {
    const base = valuationTx().tx
    const tx = {
      ...base,
      product: { findFirst: vi.fn().mockResolvedValue({ id: 'product_1', sku: 'W-1', name: 'Widget', currency: 'USD', stock: 10 }) },
      journalEntry: { ...base.journalEntry, count: vi.fn().mockResolvedValue(1) },
    }
    const prisma = { $transaction: vi.fn(async (work: (client: unknown) => unknown) => work(tx)) }

    await expect(postInventoryOpeningValuation(
      prisma as never,
      'tenant_1',
      { productId: 'product_1', unitCost: '5.00', asOf: '2026-10-24' },
      'user_1',
    )).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('Finance opening balance is already posted'),
    })
    expect(tx.inventoryValuationBalance.create).not.toHaveBeenCalled()
    expect(tx.journalEntry.create).not.toHaveBeenCalled()
  })

  it('tops up only the unvalued remainder of a partially valued product', async () => {
    const base = valuationTx({
      balance: { id: 'balance_1', onHandQuantity: 6, inventoryValue: '30.00', currency: 'USD' },
      layers: [{
        id: 'layer_existing', receivedAt: new Date('2026-10-01T00:00:00.000Z'),
        remainingQuantity: 6, remainingValue: '30.00', tenantId: 'tenant_1', productId: 'product_1',
      }],
    }).tx
    const tx = {
      ...base,
      product: { findFirst: vi.fn().mockResolvedValue({ id: 'product_1', sku: 'W-1', name: 'Widget', currency: 'USD', stock: 10 }) },
      ledgerAccount: {
        findUnique: vi.fn(({ where }: { where: { tenantId_code_currency: { code: string } } }) => {
          const code = where.tenantId_code_currency.code
          if (code === 'INV') return Promise.resolve(accounts.INV)
          return Promise.resolve(null)
        }),
        create: vi.fn().mockResolvedValue({ id: 'acct_equity', code: 'INVENTORY_OPENING_EQUITY' }),
        findMany: vi.fn().mockResolvedValue(Object.values(accounts)),
      },
    }
    const prisma = { $transaction: vi.fn(async (work: (client: unknown) => unknown) => work(tx)) }

    const result = await postInventoryOpeningValuation(
      prisma as never,
      'tenant_1',
      { productId: 'product_1', unitCost: '5.00', asOf: '2026-10-24' },
      'user_1',
    )

    expect(result).toEqual({ productId: 'product_1', quantity: 4, value: '20.00', journalEntryId: 'journal_1' })
    expect(tx.inventoryValuationBalance.updateMany).toHaveBeenCalledWith({
      where: { id: 'balance_1', tenantId: 'tenant_1', onHandQuantity: 6 },
      data: { onHandQuantity: 10, inventoryValue: '50.00' },
    })
    expect(tx.inventoryCostLayer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ originalQuantity: 4, remainingQuantity: 4, originalValue: '20.00' }),
    })
    expect(tx.inventoryValuationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ quantityDelta: 4, costValue: '20.00' }),
    })
  })

  it('refuses to post opening value into an existing non-equity opening account', async () => {
    const tx = {
      ...valuationTx().tx,
      product: { findFirst: vi.fn().mockResolvedValue({ id: 'product_1', sku: 'W-1', name: 'Widget', currency: 'USD', stock: 10 }) },
      ledgerAccount: {
        findUnique: vi.fn(({ where }: { where: { tenantId_code_currency: { code: string } } }) => {
          const code = where.tenantId_code_currency.code
          if (code === 'INV') return Promise.resolve(accounts.INV)
          if (code === 'INVENTORY_OPENING_EQUITY') return Promise.resolve({ id: 'acct_wrong', kind: 'ASSET', code, currency: 'USD' })
          return Promise.resolve(null)
        }),
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue(Object.values(accounts)),
      },
      inventoryValuationBalance: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), updateMany: vi.fn() },
    }
    const prisma = { $transaction: vi.fn(async (work: (client: unknown) => unknown) => work(tx)) }

    await expect(postInventoryOpeningValuation(
      prisma as never,
      'tenant_1',
      { productId: 'product_1', unitCost: '5.00', asOf: '2026-10-24' },
      'user_1',
    )).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('must post to an equity account') })
    expect(tx.journalEntry.create).not.toHaveBeenCalled()
    expect(tx.inventoryValuationBalance.create).not.toHaveBeenCalled()
  })

  it('refuses to change the costing method after valuation postings exist', async () => {
    const tx = {
      inventoryValuationConfig: { findUnique: vi.fn().mockResolvedValue({ costingMethod: 'FIFO', configuredAt }) },
      inventoryValuationEvent: { count: vi.fn().mockResolvedValue(1) },
      inventoryValuationAccountMapping: { findMany: vi.fn().mockResolvedValue([{ currency: 'USD' }]) },
      inventoryValuationBalance: { findFirst: vi.fn().mockResolvedValue(null) },
      ledgerAccount: { findUnique: vi.fn(), create: vi.fn() },
    }
    const prisma = { $transaction: vi.fn(async (work: (client: unknown) => unknown) => work(tx)) }
    const input = {
      costingMethod: 'WEIGHTED_AVERAGE' as const,
      mappings: [{
        currency: 'USD',
        accounts: {
          inventoryAsset: { code: 'INV', name: 'Inventory' },
          costOfGoodsSold: { code: 'COGS', name: 'Cost of goods sold' },
          goodsReceivedNotInvoiced: { code: 'GRNI', name: 'Goods received not invoiced' },
          adjustmentExpense: { code: 'SHRINK', name: 'Inventory shrinkage' },
          adjustmentGain: { code: 'GAIN', name: 'Inventory adjustment gain' },
        },
      }],
    }

    await expect(saveValuationSetup(prisma as never, 'tenant_1', input, 'user_1'))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('cannot change') })
    expect(tx.ledgerAccount.create).not.toHaveBeenCalled()
  })

  it('refuses to map a role to an existing account of the wrong kind', async () => {
    const tx = {
      inventoryValuationConfig: { findUnique: vi.fn().mockResolvedValue(null) },
      inventoryValuationEvent: { count: vi.fn().mockResolvedValue(0) },
      inventoryValuationAccountMapping: { findMany: vi.fn().mockResolvedValue([]) },
      inventoryValuationBalance: { findFirst: vi.fn().mockResolvedValue(null) },
      ledgerAccount: {
        findUnique: vi.fn().mockResolvedValue({ id: 'acct_inv', code: 'INV', kind: 'EXPENSE', currency: 'USD' }),
        create: vi.fn(),
      },
    }
    const prisma = { $transaction: vi.fn(async (work: (client: unknown) => unknown) => work(tx)) }
    const input = {
      costingMethod: 'FIFO' as const,
      mappings: [{
        currency: 'USD',
        accounts: {
          inventoryAsset: { code: 'INV', name: 'Inventory' },
          costOfGoodsSold: { code: 'COGS', name: 'Cost of goods sold' },
          goodsReceivedNotInvoiced: { code: 'GRNI', name: 'Goods received not invoiced' },
          adjustmentExpense: { code: 'SHRINK', name: 'Inventory shrinkage' },
          adjustmentGain: { code: 'GAIN', name: 'Inventory adjustment gain' },
        },
      }],
    }

    await expect(saveValuationSetup(prisma as never, 'tenant_1', input, 'user_1'))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('must use an ASSET account') })
  })
})

describe('inventory valuation report', () => {
  function reportPrisma(options: {
    stock?: number
    valuedQuantity?: number
    inventoryValue?: string
    ledgerBalance?: string
    unpostedValue?: string
  } = {}) {
    const stock = options.stock ?? 10
    const valuedQuantity = options.valuedQuantity ?? 10
    const inventoryValue = options.inventoryValue ?? '50.00'
    const ledgerBalance = options.ledgerBalance ?? '50.00'
    const unpostedValue = options.unpostedValue ?? '0'
    return {
      inventoryValuationConfig: { findUnique: vi.fn().mockResolvedValue({ costingMethod: 'FIFO', configuredAt }) },
      inventoryValuationAccountMapping: { findMany: vi.fn().mockResolvedValue([mapping]) },
      inventoryValuationEvent: {
        count: vi.fn().mockResolvedValue(2),
      },
      ledgerAccount: { findMany: vi.fn().mockResolvedValue(Object.values(accounts)) },
      tenant: { findUnique: vi.fn().mockResolvedValue({ currency: 'USD' }) },
      product: {
        groupBy: vi.fn().mockResolvedValue([{ currency: 'USD', _sum: { stock }, _count: { _all: 1 } }]),
      },
      inventoryValuationBalance: {
        groupBy: vi.fn().mockResolvedValue([{
          currency: 'USD',
          _sum: { onHandQuantity: valuedQuantity, inventoryValue: new Prisma.Decimal(inventoryValue) },
        }]),
      },
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{
          currency: 'USD',
          postedValue: new Prisma.Decimal('50.00'),
          unpostedValue: new Prisma.Decimal(unpostedValue),
        }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ balance: new Prisma.Decimal(ledgerBalance) }]),
    }
  }

  it('reconciles stock, subledger value, and the mapped ledger account', async () => {
    const report = await getInventoryValuationReport(reportPrisma() as never, 'tenant_1')

    expect(report.configured).toBe(true)
    expect(report.costingMethod).toBe('FIFO')
    expect(report.currencies).toEqual([{
      currency: 'USD',
      productCount: 1,
      quantityOnHand: 10,
      valuedQuantity: 10,
      unvaluedQuantity: 0,
      inventoryValue: '50.0000',
      postedValue: '50.0000',
      unpostedValue: '0.0000',
      ledgerAssetBalance: '50.0000',
      ledgerDifference: '0.0000',
      subledgerDifference: '0.0000',
      unvaluedMovementCount: 0,
      reconciled: true,
    }])
  })

  it('does not reconcile when the valued quantity exceeds on-hand stock', async () => {
    const report = await getInventoryValuationReport(reportPrisma({
      stock: 10, valuedQuantity: 12, inventoryValue: '50.00', ledgerBalance: '50.00',
    }) as never, 'tenant_1')

    expect(report.currencies[0]).toMatchObject({
      quantityOnHand: 10,
      valuedQuantity: 12,
      unvaluedQuantity: 0,
      inventoryValue: '50.0000',
      postedValue: '50.0000',
      ledgerDifference: '0.0000',
      subledgerDifference: '0.0000',
      reconciled: false,
    })
  })

  it('reports unvalued quantity and ledger differences instead of claiming reconciliation', async () => {
    const report = await getInventoryValuationReport(reportPrisma({
      valuedQuantity: 4, inventoryValue: '20.00', ledgerBalance: '12.00',
    }) as never, 'tenant_1')

    expect(report.currencies[0]).toMatchObject({
      quantityOnHand: 10,
      valuedQuantity: 4,
      unvaluedQuantity: 6,
      inventoryValue: '20.0000',
      postedValue: '50.0000',
      ledgerAssetBalance: '12.0000',
      ledgerDifference: '38.0000',
      subledgerDifference: '-30.0000',
      reconciled: false,
    })
  })
})
