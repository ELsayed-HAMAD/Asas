import { describe, expect, it, vi } from 'vitest'
import type { Prisma, PrismaClient } from '@prisma/client'
import {
  confirmBankStatementMatch,
  importBankStatement,
  undoBankStatementMatch,
} from '../src/modules/finance/reconciliation.service.js'

describe('bank statement reconciliation service', () => {
  it('stores normalized rows and invokes audit work inside the same transaction', async () => {
    const tx = {
      bankStatementImport: { create: vi.fn().mockResolvedValue({ id: 'import_1234567890' }) },
      bankStatementLine: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    }
    const prisma = {
      bankStatementImport: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async callback => callback(tx)),
    } as unknown as PrismaClient
    const audit = vi.fn(async () => undefined)
    const result = await importBankStatement(prisma, 'tenant_1234567890', {
      fileName: '../October.csv',
      rows: [{ postedAt: '2026-10-12', description: '  Payroll  ', reference: ' P-42 ', currency: 'usd', amount: '-100.00' }],
    }, async (transaction, id) => { expect(transaction).toBe(tx); await audit(id) })

    expect(result).toEqual({ id: 'import_1234567890', created: true })
    expect(tx.bankStatementImport.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId: 'tenant_1234567890', fileName: 'October.csv' }) })
    expect(tx.bankStatementLine.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({
      tenantId: 'tenant_1234567890', description: 'Payroll', reference: 'P-42', currency: 'USD', amount: '-100.0000',
    })] })
    expect(audit).toHaveBeenCalledWith('import_1234567890')
  })

  it('returns an existing tenant import without rewriting rows or re-auditing it', async () => {
    const prisma = {
      bankStatementImport: { findUnique: vi.fn().mockResolvedValue({ id: 'import_1234567890' }) },
      $transaction: vi.fn(),
    } as unknown as PrismaClient
    const audit = vi.fn()
    const result = await importBankStatement(prisma, 'tenant_1234567890', {
      fileName: 'same.csv',
      rows: [{ postedAt: '2026-10-12', description: 'Payroll', currency: 'USD', amount: '100' }],
    }, async () => audit())

    expect(result).toEqual({ id: 'import_1234567890', created: false })
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('scopes a match to the tenant and import in the URL', async () => {
    const findFirst = vi.fn().mockResolvedValue(null)
    const tx = { bankStatementLine: { findFirst } } as unknown as Prisma.TransactionClient

    await expect(confirmBankStatementMatch(tx, 'tenant_1234567890', 'import_1234567890', 'line_1234567890', 'journal_1234567890'))
      .rejects.toMatchObject({ statusCode: 404 })
    expect(findFirst).toHaveBeenCalledWith({ where: { id: 'line_1234567890', tenantId: 'tenant_1234567890', importId: 'import_1234567890' } })
  })

  it('scopes undo to the tenant and import in the URL', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 })
    const tx = { bankStatementLine: { updateMany } } as unknown as Prisma.TransactionClient

    await expect(undoBankStatementMatch(tx, 'tenant_1234567890', 'import_1234567890', 'line_1234567890'))
      .rejects.toMatchObject({ statusCode: 404 })
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'line_1234567890', tenantId: 'tenant_1234567890', importId: 'import_1234567890', matchedJournalLineId: { not: null } },
      data: { matchedJournalLineId: null, matchedAt: null },
    })
  })
})
