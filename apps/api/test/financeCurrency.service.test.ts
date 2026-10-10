import { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { createExpense, createPayable, createReceivable, getExpense, getInvoiceDoc, getPayable, getReceivable, updateExpense, updatePayable, updateReceivable } from '../src/modules/finance/finance.service.js'

const now = new Date('2026-10-07T00:00:00Z')
function setup(currency: string | null = 'KWD', workspaceCurrency = 'JPY') {
  const row = {
    id: 'invoice_1', tenantId: 'tenant_1', currency, amount: new Prisma.Decimal('1.234'), tax: new Prisma.Decimal('0.123'),
    vendorId: 'vendor_1', vendor: { name: 'Vendor' }, invoiceNumber: 'Invoice', _count: { lineItems: 1 },
    lineItems: [{ id: 'line_1', description: 'Item', periodOrUsage: null, amount: new Prisma.Decimal('1.234') }],
    customerId: 'customer_1', customer: { name: 'Customer' }, number: 'Invoice', employeeId: null, employee: null,
    name: 'Expense', category: 'OTHER', merchant: null, policyMatch: null, status: 'PENDING', date: now, dueDate: null,
    createdAt: now, updatedAt: now,
  }
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data }))
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data }))
  const prisma = {
    tenant: { findUnique: async () => ({ name: 'Workspace', currency: workspaceCurrency }) },
    vendor: { findFirst: async () => ({ id: 'vendor_1' }) }, customer: { findFirst: async () => ({ id: 'customer_1' }) },
    payableInvoice: { findFirst: async () => row, findFirstOrThrow: async () => row, create, update },
    receivableInvoice: { findFirst: async () => row, findFirstOrThrow: async () => row, create, update },
    expense: { findFirst: async () => row, findFirstOrThrow: async () => row, create, update },
    ledgerAccount: { upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: String(create.code) })) },
    journalEntry: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: 'recognition_1' })) },
    exchangeRate: { findFirst: vi.fn(async () => ({ id: 'kwd_jpy_rate', rateToBase: new Prisma.Decimal('200') })) },
    journalLine: { createMany: vi.fn(async () => ({ count: 2 })) },
    $queryRaw: async () => [{ id: row.id }],
  } as unknown as Prisma.TransactionClient
  return { prisma, create, update }
}

describe('finance currency snapshots', () => {
  it('uses invoice snapshot currency consistently for its amount, line items and PDF', async () => {
    const { prisma } = setup()
    const invoice = await getPayable(prisma, 'tenant_1', 'invoice_1')
    expect(invoice.amount).toEqual({ amount: 1234, currency: 'KWD' })
    expect(invoice.lineItems[0].amount).toEqual({ amount: 1234, currency: 'KWD' })
    expect(await getInvoiceDoc(prisma, 'tenant_1', 'invoice_1')).toMatchObject({ currency: 'KWD', total: '1.234' })
  })
  it('uses snapshot currency for receivables and expense amount/tax', async () => {
    const { prisma } = setup()
    expect((await getReceivable(prisma, 'tenant_1', 'invoice_1')).amount).toEqual({ amount: 1234, currency: 'KWD' })
    expect(await getExpense(prisma, 'tenant_1', 'invoice_1')).toMatchObject({ amount: { amount: 1234, currency: 'KWD' }, tax: { amount: 123, currency: 'KWD' } })
  })
  it('retains the existing workspace-denominated fallback for unknown legacy provenance', async () => {
    const { prisma } = setup(null, 'USD')
    expect((await getReceivable(prisma, 'tenant_1', 'invoice_1')).amount).toEqual({ amount: 123, currency: 'USD' })
  })
  it.each(['payable', 'receivable', 'expense'])('writes an explicit currency snapshot when creating a %s', async kind => {
    const { prisma, create } = setup(null, 'KWD')
    if (kind === 'payable') await createPayable(prisma, 'tenant_1', { vendorId: 'vendor_1', date: '2026-10-07', amount: '1.234' }, 'admin_1')
    if (kind === 'receivable') await createReceivable(prisma, 'tenant_1', { customerId: 'customer_1', amount: '1.234' })
    if (kind === 'expense') await createExpense(prisma, 'tenant_1', { name: 'Expense', date: '2026-10-07', amount: '1.234' }, 'admin_1')
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ currency: 'KWD', amount: '1.234' }) }))
  })
  it.each(['payable', 'receivable', 'expense'])('validates a %s adjustment using its snapshot quantum, not tenant currency', async kind => {
    const { prisma, update } = setup('KWD', 'JPY')
    if (kind === 'payable') await updatePayable(prisma, 'tenant_1', 'invoice_1', { amount: '2.345' })
    if (kind === 'receivable') await updateReceivable(prisma, 'tenant_1', 'invoice_1', { amount: '2.345' })
    if (kind === 'expense') await updateExpense(prisma, 'tenant_1', 'invoice_1', { amount: '2.345' })
    expect(String(update.mock.calls[0][0].data.amount)).toBe('2.345')
  })
})
