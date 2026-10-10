import { Prisma, type PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import {
  deletePayable, deleteReceivable, deleteExpense, updatePayable, updateReceivable, updateExpense,
  voidPayable, voidReceivable,
  updatePayableStatus, updateReceivableStatus, updateExpenseStatus,
} from '../src/modules/finance/finance.service.js'

function setup(status: string, createdById: string | null = null) {
  const now = new Date('2026-10-07T00:00:00Z')
  const row = {
    id: 'doc_1', tenantId: 'tenant_1', status, createdById,
    vendorId: 'vendor_1', vendor: { name: 'Vendor' }, invoiceNumber: 'INV-1', _count: { lineItems: 0 },
    customerId: 'customer_1', customer: { name: 'Customer' }, number: 'INV-1',
    employeeId: null, employee: null, name: 'Expense', category: 'OTHER', merchant: null, policyMatch: null,
    amount: new Prisma.Decimal('100'), tax: new Prisma.Decimal('10'), date: now, dueDate: now, createdAt: now, updatedAt: now,
  }
  const delegate = {
    findFirstOrThrow: vi.fn().mockResolvedValue(row),
    update: vi.fn(async ({ data }: { data: object }) => ({ ...row, ...data })),
    delete: vi.fn(),
  }
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: row.id }]), payableInvoice: delegate, receivableInvoice: delegate, expense: delegate,
    ledgerAccount: { upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: String(create.code) })) },
    journalEntry: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: 'journal_1' })) },
    journalLine: { createMany: vi.fn(async () => ({ count: 2 })) },
  }
  const prisma = {
    tenant: { findUnique: vi.fn().mockResolvedValue({ currency: 'USD' }) },
    $transaction: vi.fn(async (work: (client: unknown) => unknown) => work(tx)),
  } as unknown as PrismaClient
  return { prisma, tx, delegate }
}

describe('finance workflow integrity', () => {
  it('retains unpaid invoices when cancelling instead of deleting their history', async () => {
    for (const cancel of [voidPayable, voidReceivable]) {
      const { prisma, delegate } = setup('PENDING')
      const invoice = await cancel(prisma, 'tenant_1', 'doc_1')
      expect(invoice.status).toBe('VOID')
      expect(delegate.delete).not.toHaveBeenCalled()
      expect(delegate.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'VOID' } }))
    }
  })
  it('reverses a paid settlement before voiding and rejects missing settlement journals', async () => {
    for (const cancel of [voidPayable, voidReceivable]) {
      const { prisma, delegate } = setup('PAID')
      await expect(cancel(prisma, 'tenant_1', 'doc_1')).rejects.toMatchObject({ statusCode: 409 })
      expect(delegate.update).not.toHaveBeenCalled()
    }
    for (const cancel of [voidPayable, voidReceivable]) {
      const { prisma, delegate, tx } = setup('PAID')
      const original = {
        id: 'payment_journal', sourceType: cancel === voidPayable ? 'AP_PAYMENT' : 'AR_COLLECTION',
        amount: new Prisma.Decimal('100'), currency: 'USD', currencyProvenance: 'DOCUMENT', description: 'Settlement',
        lines: [
          { accountId: 'cash', side: 'CREDIT', amount: new Prisma.Decimal('100') },
          { accountId: 'clearing', side: 'DEBIT', amount: new Prisma.Decimal('100') },
        ],
      }
      ;(tx.journalEntry.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(original).mockResolvedValueOnce(null)
      await cancel(prisma, 'tenant_1', 'doc_1', 'Bank returned payment', 'admin_1')
      expect(tx.journalEntry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
        sourceType: 'SETTLEMENT_REVERSAL', reversesJournalEntryId: 'payment_journal',
        reversalReason: 'Bank returned payment', actorId: 'admin_1',
      }) }))
      expect(tx.journalLine.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([
        expect.objectContaining({ accountId: 'cash', side: 'DEBIT' }),
        expect.objectContaining({ accountId: 'clearing', side: 'CREDIT' }),
      ]) }))
      expect(delegate.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'VOID' } }))
    }
  })
  it('blocks editing, deleting, reopening or paying a void invoice', async () => {
    const { prisma, delegate } = setup('VOID')
    await expect(updatePayable(prisma, 'tenant_1', 'doc_1', { amount: '1' })).rejects.toMatchObject({ statusCode: 409 })
    await expect(updateReceivable(prisma, 'tenant_1', 'doc_1', { amount: '1' })).rejects.toMatchObject({ statusCode: 409 })
    await expect(deletePayable(prisma, 'tenant_1', 'doc_1')).rejects.toMatchObject({ statusCode: 409 })
    await expect(deleteReceivable(prisma, 'tenant_1', 'doc_1')).rejects.toMatchObject({ statusCode: 409 })
    await expect(updatePayableStatus(prisma, 'tenant_1', 'doc_1', 'APPROVED', 'approver')).rejects.toMatchObject({ statusCode: 409 })
    await expect(updateReceivableStatus(prisma, 'tenant_1', 'doc_1', 'PAID')).rejects.toMatchObject({ statusCode: 409 })
    expect(delegate.update).not.toHaveBeenCalled()
    expect(delegate.delete).not.toHaveBeenCalled()
  })
  it('does not allow generic status mutations to bypass the audited void endpoint', async () => {
    const { prisma, delegate } = setup('PENDING')
    await expect(updatePayableStatus(prisma, 'tenant_1', 'doc_1', 'VOID', 'approver')).rejects.toMatchObject({ statusCode: 409 })
    const receivable = setup('CURRENT')
    await expect(updateReceivableStatus(receivable.prisma, 'tenant_1', 'doc_1', 'VOID')).rejects.toMatchObject({ statusCode: 409 })
    expect(delegate.update).not.toHaveBeenCalled()
    expect(receivable.delegate.update).not.toHaveBeenCalled()
  })
  it('blocks skipping approval before paying a bill', async () => {
    const { prisma, delegate } = setup('PENDING')
    await expect(updatePayableStatus(prisma, 'tenant_1', 'doc_1', 'PAID', 'approver')).rejects.toMatchObject({ statusCode: 409 })
    expect(delegate.update).not.toHaveBeenCalled()
  })
  it('blocks self-approval for invoices and expenses', async () => {
    for (const change of [updatePayableStatus, updateExpenseStatus]) {
      const { prisma, delegate } = setup('PENDING', 'creator')
      await expect(change(prisma, 'tenant_1', 'doc_1', 'APPROVED', 'creator')).rejects.toMatchObject({ statusCode: 403 })
      expect(delegate.update).not.toHaveBeenCalled()
    }
  })
  it('records independent approval attribution', async () => {
    const { prisma, delegate } = setup('PENDING', 'creator')
    await updatePayableStatus(prisma, 'tenant_1', 'doc_1', 'APPROVED', 'approver')
    expect(delegate.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id_tenantId: { id: 'doc_1', tenantId: 'tenant_1' } },
      data: { status: 'APPROVED', approvedById: 'approver', approvedAt: expect.any(Date) },
    }))
  })
  it('timestamps approved bill payment', async () => {
    const { prisma, delegate, tx } = setup('APPROVED')
    ;(tx.journalEntry.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'recognition_1', amount: new Prisma.Decimal('100'), currency: 'USD', baseAmount: new Prisma.Decimal('100'),
    })
    await updatePayableStatus(prisma, 'tenant_1', 'doc_1', 'PAID', 'payer')
    expect(delegate.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'PAID', paidAt: expect.any(Date) } }))
  })
  it('rejects repeated payment and reopening paid receivables', async () => {
    const { prisma, delegate } = setup('PAID')
    await expect(updateReceivableStatus(prisma, 'tenant_1', 'doc_1', 'PAID')).rejects.toMatchObject({ statusCode: 409 })
    await expect(updateReceivableStatus(prisma, 'tenant_1', 'doc_1', 'CURRENT')).rejects.toMatchObject({ statusCode: 409 })
    expect(delegate.update).not.toHaveBeenCalled()
  })
  it('prevents editing and deleting locked financial records', async () => {
    const { prisma, delegate } = setup('PAID')
    await expect(updatePayable(prisma, 'tenant_1', 'doc_1', { amount: '1' })).rejects.toMatchObject({ statusCode: 409 })
    await expect(deletePayable(prisma, 'tenant_1', 'doc_1')).rejects.toMatchObject({ statusCode: 409 })
    await expect(deleteReceivable(prisma, 'tenant_1', 'doc_1')).rejects.toMatchObject({ statusCode: 409 })
    const approved = setup('APPROVED')
    await expect(deleteExpense(approved.prisma, 'tenant_1', 'doc_1')).rejects.toMatchObject({ statusCode: 409 })
    expect(delegate.update).not.toHaveBeenCalled()
    expect(delegate.delete).not.toHaveBeenCalled()
  })
  it('validates a partial date or amount update against stored fields', async () => {
    const { prisma, delegate } = setup('PENDING')
    await expect(updatePayable(prisma, 'tenant_1', 'doc_1', { date: '2026-10-08' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(updateExpense(prisma, 'tenant_1', 'doc_1', { amount: '5' })).rejects.toMatchObject({ statusCode: 400 })
    expect(delegate.update).not.toHaveBeenCalled()
  })
  it('locks only a document belonging to the active tenant', async () => {
    const { prisma, tx, delegate } = setup('PENDING')
    tx.$queryRaw.mockResolvedValue([])
    await expect(updatePayableStatus(prisma, 'tenant_1', 'foreign', 'APPROVED', 'approver')).rejects.toMatchObject({ statusCode: 404 })
    expect(delegate.update).not.toHaveBeenCalled()
    const sql = tx.$queryRaw.mock.calls[0]
    expect(sql).toContain('tenant_1')
    expect(sql).toContain('foreign')
  })
})
