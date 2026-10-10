import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { requestPayableChanges } from '../src/modules/finance/finance.service.js'

function setup(status: string | null = 'SCHEDULED') {
  const prisma = {
    tenant: { findUnique: vi.fn().mockResolvedValue({ currency: 'USD' }) },
    $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(prisma)),
    $queryRaw: vi.fn().mockResolvedValue(status ? [{ id: 'payable_1' }] : []),
    payableInvoice: {
      findFirstOrThrow: vi.fn().mockResolvedValue({ id: 'payable_1', tenantId: 'tenant_1', status }),
      update: vi.fn().mockResolvedValue({
        id: 'payable_1', vendorId: 'vendor_1', vendor: { name: 'Vendor One' }, invoiceNumber: 'INV-1',
        date: new Date('2026-10-01T00:00:00.000Z'), dueDate: null, amount: new Prisma.Decimal('100.00'),
        status: 'PENDING', _count: { lineItems: 0 }, createdAt: new Date('2026-10-01T00:00:00.000Z'), updatedAt: new Date('2026-10-04T00:00:00.000Z'),
      }),
    },
    journalEntry: { findFirst: vi.fn().mockResolvedValue(null) },
  } as unknown as PrismaClient
  return prisma
}

describe('requestPayableChanges', () => {
  it('returns an approved invoice to pending with a compound tenant-scoped update', async () => {
    const prisma = setup()
    const result = await requestPayableChanges(prisma, 'tenant_1', 'payable_1')
    expect(result.status).toBe('PENDING')
    expect(prisma.payableInvoice.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id_tenantId: { id: 'payable_1', tenantId: 'tenant_1' } },
      data: { status: 'PENDING', approvedById: null, approvedAt: null },
    }))
  })

  it('only allows change requests for approved or scheduled invoices', async () => {
    const prisma = setup('PENDING')
    await expect(requestPayableChanges(prisma, 'tenant_1', 'payable_1')).rejects.toThrow('only be requested')
    expect(prisma.payableInvoice.update).not.toHaveBeenCalled()
  })

  it('does not expose invoices outside the tenant', async () => {
    const prisma = setup(null)
    await expect(requestPayableChanges(prisma, 'tenant_1', 'payable_other')).rejects.toThrow('Invoice not found')
    expect(prisma.payableInvoice.update).not.toHaveBeenCalled()
  })
})
