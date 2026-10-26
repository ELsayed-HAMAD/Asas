import type { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ledger = vi.hoisted(() => ({
  postOpeningBalance: vi.fn(),
  recordMigrationInvoiceOpeningRecognition: vi.fn(),
  migrationInvoiceBaseAmount: vi.fn(),
}))
vi.mock('../src/modules/finance/ledger.service.js', async importOriginal => ({
  ...await importOriginal<typeof import('../src/modules/finance/ledger.service.js')>(),
  ...ledger,
}))

import { cutoverFinanceMigration } from '../src/modules/settings/financeMigrationCutover.service.js'

const tenantId = 'tenant-1'
const projectId = 'project-1'
const actorId = 'owner-1'

function setup() {
  const state: any = {
    batches: [
      { id: 'batch-ap', tenantId, projectId, entity: 'FINANCE_AP_OPEN_ITEMS', status: 'STAGED', requestHash: 'ap-hash', metadata: null, records: [{ id: 'record-ap', tenantId, projectId, entity: 'FINANCE_AP_OPEN_ITEMS', batchId: 'batch-ap', sourceId: 'source-ap-1', payload: { sourceId: 'source-ap-1', vendorSourceId: 'vendor-source-1', invoiceNumber: 'AP-10', invoiceDate: '2026-09-01', dueDate: '2026-09-30', currency: 'USD', openAmount: '80.00', originalAmount: '100.00', paidAmount: '20.00', status: 'APPROVED' } }] },
      { id: 'batch-ar', tenantId, projectId, entity: 'FINANCE_AR_OPEN_ITEMS', status: 'STAGED', requestHash: 'ar-hash', metadata: null, records: [{ id: 'record-ar', tenantId, projectId, entity: 'FINANCE_AR_OPEN_ITEMS', batchId: 'batch-ar', sourceId: 'source-ar-1', payload: { sourceId: 'source-ar-1', customerSourceId: 'customer-source-1', invoiceNumber: 'AR-20', invoiceDate: '2026-09-05', dueDate: '2026-09-25', currency: 'USD', openAmount: '60.00', originalAmount: '75.00', paidAmount: '15.00', status: 'OVERDUE' } }] },
      { id: 'batch-tb', tenantId, projectId, entity: 'FINANCE_OPENING_BALANCE', status: 'STAGED', requestHash: 'tb-hash', metadata: { asOf: '2026-09-30', accountsReceivableControlTotal: '60.00', accountsPayableControlTotal: '80.00' }, records: [
        { id: 'record-cash', tenantId, projectId, entity: 'FINANCE_OPENING_BALANCE', batchId: 'batch-tb', sourceId: 'ACCOUNT:CASH', payload: { code: 'CASH', name: 'Cash', kind: 'ASSET', side: 'DEBIT', amount: '12220.00' } },
        { id: 'record-capital', tenantId, projectId, entity: 'FINANCE_OPENING_BALANCE', batchId: 'batch-tb', sourceId: 'ACCOUNT:CAPITAL', payload: { code: 'CAPITAL', name: 'Capital', kind: 'EQUITY', side: 'CREDIT', amount: '12200.00' } },
      ] },
    ],
    jobs: [], links: [
      { tenantId, projectId, sourceEntity: 'FINANCE_VENDORS', sourceId: 'vendor-source-1', targetEntity: 'FINANCE_VENDORS', targetId: 'vendor-1' },
      { tenantId, projectId, sourceEntity: 'FINANCE_CUSTOMERS', sourceId: 'customer-source-1', targetEntity: 'FINANCE_CUSTOMERS', targetId: 'customer-1' },
    ],
    createdLinks: [], invoices: [], audits: [], openingLines: [], recognitions: [],
  }
  const tx: any = {
    dataMigrationProject: { findFirst: vi.fn(async () => ({ id: projectId, name: 'Legacy migration', sourceSystem: 'Legacy ERP', modules: ['FINANCE'], status: 'IN_PROGRESS', targetCutoverAt: new Date('2026-09-30T00:00:00.000Z') })) },
    tenant: { findFirst: vi.fn(async () => ({ currency: 'USD' })) },
    inventoryValuationAccountMapping: { findUnique: vi.fn(async () => state.inventoryMapping ?? null) },
    dataMigrationStageBatch: {
      findMany: vi.fn(async () => state.batches.map((batch: any) => ({ ...batch, records: [...batch.records] }))),
      updateMany: vi.fn(async ({ where, data }: any) => { for (const batch of state.batches) if (where.id.in.includes(batch.id)) Object.assign(batch, data); return { count: where.id.in.length } }),
    },
    dataMigrationImportJob: {
      findFirst: vi.fn(async ({ where }: any) => state.jobs.find((job: any) => job.tenantId === where.tenantId && job.projectId === where.projectId && job.entity === where.entity && (!where.requestHash || job.requestHash === where.requestHash)) ?? null),
      findUnique: vi.fn(async ({ where }: any) => { const key = where.tenantId_projectId_entity_idempotencyKey; return state.jobs.find((job: any) => job.tenantId === key.tenantId && job.projectId === key.projectId && job.entity === key.entity && job.idempotencyKey === key.idempotencyKey) ?? null }),
      create: vi.fn(async ({ data }: any) => { const job = { id: `job-${state.jobs.length + 1}`, createdAt: new Date('2026-10-24T00:00:00.000Z'), completedAt: new Date('2026-10-24T00:00:00.000Z'), ...data }; state.jobs.push(job); return job }),
    },
    dataMigrationRecordLink: {
      findMany: vi.fn(async ({ where }: any) => state.links.filter((link: any) => link.tenantId === where.tenantId && link.projectId === where.projectId && where.sourceEntity.in.includes(link.sourceEntity) && where.sourceId.in.includes(link.sourceId))),
      findFirst: vi.fn(async ({ where }: any) => state.createdLinks.find((link: any) => link.tenantId === where.tenantId && link.projectId === where.projectId && link.importJobId === where.importJobId && link.sourceEntity === where.sourceEntity && link.sourceId === where.sourceId) ?? null),
      create: vi.fn(async ({ data }: any) => { state.createdLinks.push(data); return data }),
    },
    vendor: { findFirst: vi.fn(async ({ where }: any) => where.id === 'vendor-1' ? { id: 'vendor-1' } : null) },
    customer: { findFirst: vi.fn(async ({ where }: any) => where.id === 'customer-1' ? { id: 'customer-1' } : null) },
    journalEntry: { count: vi.fn(async () => 0) },
    payableInvoice: { count: vi.fn(async () => 0), create: vi.fn(async ({ data }: any) => { const invoice = { id: `payable-${state.invoices.length + 1}`, ...data }; state.invoices.push(invoice); return invoice }) },
    receivableInvoice: { count: vi.fn(async () => 0), create: vi.fn(async ({ data }: any) => { const invoice = { id: `receivable-${state.invoices.length + 1}`, ...data }; state.invoices.push(invoice); return invoice }) },
    auditLog: { create: vi.fn(async ({ data }: any) => { state.audits.push(data); return data }) },
  }
  const prisma = { ...tx, $transaction: vi.fn(async (callback: (client: any) => Promise<unknown>) => callback(tx)) } as unknown as PrismaClient
  return { prisma, state, tx }
}

describe('Finance migration atomic cutover', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ledger.migrationInvoiceBaseAmount.mockImplementation(async (_tx: unknown, input: { amount: string }) => input.amount)
    ledger.postOpeningBalance.mockImplementation(async (_tx: unknown, _tenant: string, _actor: string, input: { lines: unknown[] }) => { const state = (globalThis as any).__cutoverTestState; state.openingLines = input.lines; return { id: 'opening-journal-1' } })
    ledger.recordMigrationInvoiceOpeningRecognition.mockImplementation(async (_tx: unknown, input: unknown) => { const state = (globalThis as any).__cutoverTestState; state.recognitions.push(input); return { journalId: `recognition-${state.recognitions.length}`, baseAmount: '1.00' } })
  })

  it('commits opening balances, linked AP/AR invoices, source totals, recognition, audit, and replay marker together', async () => {
    const { prisma, state } = setup()
    const payableRecords = state.batches.find((batch: any) => batch.entity === 'FINANCE_AP_OPEN_ITEMS').records
    payableRecords[0].isCurrent = false
    payableRecords[0].revision = 1
    payableRecords.push({ ...payableRecords[0], id: 'record-ap-current', revision: 2, isCurrent: true, payload: { ...payableRecords[0].payload, openAmount: '80.00' } })
    payableRecords[0].payload.openAmount = '9000.00'
    ;(globalThis as any).__cutoverTestState = state
    const result = await cutoverFinanceMigration(prisma, tenantId, projectId, actorId)

    expect(result).toMatchObject({ replayed: false, cutoverAt: '2026-09-30', importedPayables: 1, importedReceivables: 1, pendingPayablesNotRecognized: 0, openingJournalId: 'opening-journal-1' })
    expect(state.openingLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CASH', amount: '12220.00' }),
      expect.objectContaining({ code: 'CAPITAL', amount: '12200.00' }),
      expect.objectContaining({ code: 'MIGRATION_OPENING_EQUITY', side: 'CREDIT', amount: '20.0000' }),
    ]))
    expect(state.invoices).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'payable-1', vendorId: 'vendor-1', amount: '80.00', sourceOriginalAmount: '100.00', sourcePaidAmount: '20.00', status: 'APPROVED', date: new Date('2026-09-01T00:00:00.000Z') }),
      expect.objectContaining({ id: 'receivable-2', customerId: 'customer-1', amount: '60.00', sourceOriginalAmount: '75.00', sourcePaidAmount: '15.00', status: 'OVERDUE', date: new Date('2026-09-05T00:00:00.000Z') }),
    ]))
    expect(state.recognitions).toHaveLength(2)
    expect(state.jobs).toHaveLength(3)
    expect(state.createdLinks).toHaveLength(3)
    const tbJob = state.jobs.find((job: any) => job.entity === 'FINANCE_OPENING_BALANCE')
    expect(state.createdLinks).toContainEqual(expect.objectContaining({ importJobId: tbJob.id, sourceEntity: 'FINANCE_OPENING_BALANCE', sourceId: `__FINANCE_CUTOVER__:${tbJob.idempotencyKey}`, targetId: 'opening-journal-1' }))
    expect(state.batches.every((batch: any) => batch.status === 'COMPLETED')).toBe(true)
    expect(state.audits).toHaveLength(1)

    const replay = await cutoverFinanceMigration(prisma, tenantId, projectId, actorId)
    expect(replay).toMatchObject({ ...result, replayed: true })
    expect(state.invoices).toHaveLength(2)
    expect(state.jobs).toHaveLength(3)
  })

  it('refuses cutover when a source control total is inconsistent with the staged documents', async () => {
    const { prisma, state } = setup()
    ;(globalThis as any).__cutoverTestState = state
    state.batches.find((batch: any) => batch.entity === 'FINANCE_OPENING_BALANCE').metadata.accountsPayableControlTotal = '81.00'
    await expect(cutoverFinanceMigration(prisma, tenantId, projectId, actorId)).rejects.toThrow(/Eligible AP at cutover FX/)
    expect(ledger.postOpeningBalance).not.toHaveBeenCalled()
    expect(state.invoices).toHaveLength(0)
    expect(state.batches.every((batch: any) => batch.status === 'STAGED')).toBe(true)
  })

  it('blocks cutover if another Finance journal already exists', async () => {
    const { prisma, state, tx } = setup()
    ;(globalThis as any).__cutoverTestState = state
    tx.journalEntry.count.mockResolvedValue(1)
    await expect(cutoverFinanceMigration(prisma, tenantId, projectId, actorId)).rejects.toThrow(/unused Finance ledger/)
    expect(ledger.postOpeningBalance).not.toHaveBeenCalled()
    expect(state.invoices).toHaveLength(0)
  })

  it('blocks a mapped inventory asset control account in the residual trial balance', async () => {
    const { prisma, state } = setup()
    state.inventoryMapping = { inventoryAssetAccountCode: 'INVENTORY_ASSET' }
    state.batches.find((batch: any) => batch.entity === 'FINANCE_OPENING_BALANCE').records.push({
      id: 'record-inventory', tenantId, projectId, entity: 'FINANCE_OPENING_BALANCE', batchId: 'batch-tb',
      sourceId: 'ACCOUNT:INVENTORY_ASSET', payload: { code: 'INVENTORY_ASSET', name: 'Inventory', kind: 'ASSET', side: 'DEBIT', amount: '1.00' },
    })
    ;(globalThis as any).__cutoverTestState = state

    await expect(cutoverFinanceMigration(prisma, tenantId, projectId, actorId))
      .rejects.toThrow(/Reserved control accounts .*INVENTORY_ASSET/)
    expect(ledger.postOpeningBalance).not.toHaveBeenCalled()
    expect(state.invoices).toHaveLength(0)
    expect(state.batches.every((batch: any) => batch.status === 'STAGED')).toBe(true)
  })
})
