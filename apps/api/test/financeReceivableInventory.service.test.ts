import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const inventory = vi.hoisted(() => ({
  postValuedIssue: vi.fn(),
  reverseValuedSaleIssue: vi.fn(),
  writeStockMovement: vi.fn(),
}))

const ledger = vi.hoisted(() => ({
  expenseSettlementComparison: vi.fn(),
  getJournal: vi.fn(),
  listJournals: vi.fn(),
  payableSettlementComparison: vi.fn(),
  receivableSettlementComparison: vi.fn(),
  postOpeningBalance: vi.fn(),
  recentSettlements: vi.fn(),
  recordCashSettlement: vi.fn(),
  recordExpenseRecognition: vi.fn(),
  recordInvoiceRecognition: vi.fn(),
  reverseCashSettlement: vi.fn(),
  reverseExpenseRecognitionIfPresent: vi.fn(),
  reverseInvoiceRecognitionIfPresent: vi.fn(),
  settlementCashFlow: vi.fn(),
  settlementCashFlowComparison: vi.fn(),
  trialBalance: vi.fn(),
}))

vi.mock('../src/modules/inventory/inventoryValuation.service.js', () => ({
  postValuedIssue: inventory.postValuedIssue,
  reverseValuedSaleIssue: inventory.reverseValuedSaleIssue,
}))
vi.mock('../src/modules/inventory/stockMovementWriter.js', () => ({
  writeStockMovement: inventory.writeStockMovement,
}))
vi.mock('../src/modules/finance/ledger.service.js', () => ledger)

const { createReceivable, deleteReceivable, voidReceivable } = await import('../src/modules/finance/finance.service.js')

const now = new Date('2026-10-24T09:00:00.000Z')

function inventoryLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'line_1', tenantId: 'tenant_1', invoiceId: 'invoice_1', productId: 'product_1',
    quantity: 2, currency: 'USD', costValue: new Prisma.Decimal('22.00'),
    stockMovementId: 'movement_issue', valuationEventId: 'event_issue', journalEntryId: 'journal_issue',
    reversedAt: null, reversalStockMovementId: null, reversalValuationEventId: null, reversalJournalEntryId: null,
    createdAt: now, updatedAt: now, product: { name: 'Widget', sku: 'W-1' },
    ...overrides,
  }
}

function receivable(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invoice_1', tenantId: 'tenant_1', currency: 'USD', customerId: 'customer_1',
    customer: { name: 'Customer' }, number: 'INV-1', date: now,
    amount: new Prisma.Decimal('100.00'), sourceOriginalAmount: null, sourcePaidAmount: null,
    dueDate: now, status: 'CURRENT', paidAt: null, createdAt: now, updatedAt: now,
    inventoryLines: [],
    ...overrides,
  }
}

function setup(options: { row?: ReturnType<typeof receivable>; valuationConfigured?: boolean } = {}) {
  const row = options.row ?? receivable()
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: row.id }]),
    tenant: { findUnique: vi.fn().mockResolvedValue({ currency: 'USD', timezone: 'UTC' }) },
    customer: { findFirst: vi.fn().mockResolvedValue({ id: 'customer_1' }) },
    inventoryValuationConfig: {
      findUnique: vi.fn().mockResolvedValue(options.valuationConfigured === false ? null : { tenantId: 'tenant_1' }),
    },
    product: {
      findMany: vi.fn().mockResolvedValue([{ id: 'product_1', name: 'Widget', sku: 'W-1' }]),
    },
    receivableInvoice: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data })),
      findFirstOrThrow: vi.fn().mockResolvedValue(row),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data })),
    },
    receivableInventoryLine: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...inventoryLine(), ...data })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...inventoryLine(), ...data })),
    },
  }
  const prisma = { ...tx, $transaction: vi.fn(async (work: (client: unknown) => Promise<unknown>) => work(tx)) }
  return { prisma, tx }
}

beforeEach(() => {
  vi.clearAllMocks()
  ledger.recordInvoiceRecognition.mockResolvedValue('journal_ar')
  ledger.reverseInvoiceRecognitionIfPresent.mockResolvedValue(undefined)
  ledger.reverseCashSettlement.mockResolvedValue(undefined)
  inventory.writeStockMovement.mockResolvedValue({ movement: { id: 'movement_1' }, newStock: 8 })
  inventory.postValuedIssue.mockResolvedValue({
    eventId: 'event_1', journalEntryId: 'journal_1', value: '22.00', currency: 'USD',
  })
  inventory.reverseValuedSaleIssue.mockResolvedValue({
    eventId: 'event_reversal', journalEntryId: 'journal_reversal', value: '22.00', currency: 'USD',
  })
})

describe('receivable inventory fulfillment', () => {
  it('issues each optional line in the invoice transaction and stores exact cost evidence', async () => {
    const line = inventoryLine()
    const { prisma, tx } = setup({ row: receivable({ inventoryLines: [line] }) })

    const result = await createReceivable(prisma as never, 'tenant_1', {
      customerId: 'customer_1',
      number: 'INV-1',
      amount: '100.00',
      inventoryLines: [{ productId: 'product_1', quantity: 2 }],
    }, 'user_1')

    expect(inventory.writeStockMovement).toHaveBeenCalledWith(tx, expect.objectContaining({
      tenantId: 'tenant_1', productId: 'product_1', delta: -2, note: 'Sale: receivable INV-1', createdAt: now,
    }))
    expect(inventory.postValuedIssue).toHaveBeenCalledWith(tx, expect.objectContaining({
      tenantId: 'tenant_1', productId: 'product_1', stockMovementId: 'movement_1',
      quantity: 2, reason: 'SALE', actorId: 'user_1', postedAt: now,
    }))
    expect(tx.receivableInventoryLine.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant_1', invoiceId: 'invoice_1', productId: 'product_1', quantity: 2,
        currency: 'USD', costValue: '22.00', stockMovementId: 'movement_1',
        valuationEventId: 'event_1', journalEntryId: 'journal_1',
      }),
    })
    expect(result.inventoryLines).toEqual([
      expect.objectContaining({ productName: 'Widget', quantity: 2, costValue: { amount: 2200, currency: 'USD' } }),
    ])
  })

  it('rejects stock fulfillment when valuation is not configured without issuing stock', async () => {
    const { prisma } = setup({ valuationConfigured: false })

    await expect(createReceivable(prisma as never, 'tenant_1', {
      customerId: 'customer_1',
      amount: '100.00',
      inventoryLines: [{ productId: 'product_1', quantity: 2 }],
    }, 'user_1')).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('Inventory valuation is not configured') })

    expect(inventory.writeStockMovement).not.toHaveBeenCalled()
    expect(inventory.postValuedIssue).not.toHaveBeenCalled()
  })

  it('returns stock and the original cost when a receivable is voided', async () => {
    const line = inventoryLine()
    const { prisma, tx } = setup({ row: receivable({ inventoryLines: [line] }) })

    const result = await voidReceivable(prisma as never, 'tenant_1', 'invoice_1', 'Duplicate invoice', 'user_1')

    expect(inventory.writeStockMovement).toHaveBeenCalledWith(tx, expect.objectContaining({
      tenantId: 'tenant_1', productId: 'product_1', delta: 2, note: 'Sale reversal: receivable INV-1',
    }))
    expect(inventory.reverseValuedSaleIssue).toHaveBeenCalledWith(tx, expect.objectContaining({
      tenantId: 'tenant_1', productId: 'product_1', originalStockMovementId: 'movement_issue',
      originalValuationEventId: 'event_issue', reversalStockMovementId: 'movement_1',
      quantity: 2, actorId: 'user_1', reason: 'Duplicate invoice',
    }))
    expect(tx.receivableInventoryLine.update).toHaveBeenCalledWith({
      where: { id_tenantId: { id: 'line_1', tenantId: 'tenant_1' } },
      data: expect.objectContaining({
        reversedAt: expect.any(Date), reversalStockMovementId: 'movement_1',
        reversalValuationEventId: 'event_reversal', reversalJournalEntryId: 'journal_reversal',
      }),
    })
    expect(ledger.reverseInvoiceRecognitionIfPresent).toHaveBeenCalledWith(tx, expect.objectContaining({
      sourceId: 'invoice_1', sourceType: 'AR_RECOGNITION', reason: 'Duplicate invoice',
    }))
    expect(result.status).toBe('VOID')
  })

  it('reports how many inventory lines a deleted receivable restored', async () => {
    const line = inventoryLine()
    const { prisma } = setup({ row: receivable({ inventoryLines: [line] }) })

    await expect(deleteReceivable(prisma as never, 'tenant_1', 'invoice_1', 'user_1'))
      .resolves.toEqual({ inventoryLinesReturned: 1 })
    expect(inventory.reverseValuedSaleIssue).toHaveBeenCalledTimes(1)
    expect(ledger.reverseInvoiceRecognitionIfPresent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      reason: 'Receivable removed',
    }))
  })
})
