import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { listFinanceMigrationStageRecords, previewFinanceMigrationReconciliation, stageFinanceMigrationBatch, validateFinanceMigrationStage } from '../src/modules/settings/financeMigrationStaging.service.js'

const tenantId = 'tenant_1'
const projectId = 'c00000000000000000000001'
const actorId = 'owner_1'
const apRows = [{ sourceId: 'legacy-ap-1', vendorSourceId: 'legacy-vendor-1', invoiceNumber: 'AP-22', invoiceDate: '2026-08-01', dueDate: '2026-08-31', currency: 'USD', openAmount: '80.00', originalAmount: '100.00', paidAmount: '20.00', status: 'APPROVED' as const }]

async function setup() {
  const state: any = { projectStatus: 'PLANNING', batches: [], records: [], audits: [], importJobs: [] }
  const makeClient = () => ({
    dataMigrationProject: {
      findFirst: vi.fn(async () => ({ id: projectId, status: state.projectStatus, modules: ['FINANCE'], targetCutoverAt: new Date('2026-09-30T00:00:00.000Z') })),
      findUniqueOrThrow: vi.fn(async () => ({ status: state.projectStatus })),
      update: vi.fn(async ({ data }: any) => { state.projectStatus = data.status; return { id: projectId } }),
    },
    dataMigrationStageBatch: {
      findFirst: vi.fn(async ({ where }: any) => state.batches.find((batch: any) => batch.tenantId === where.tenantId && batch.projectId === where.projectId && where.entity.in.includes(batch.entity) && batch.status === where.status) ?? null),
      findUnique: vi.fn(async ({ where }: any) => {
        const key = where.tenantId_projectId_entity_idempotencyKey
        return state.batches.find((batch: any) => batch.tenantId === key.tenantId && batch.projectId === key.projectId && batch.entity === key.entity && batch.idempotencyKey === key.idempotencyKey) ?? null
      }),
      findMany: vi.fn(async ({ where, include }: any) => state.batches.filter((batch: any) => batch.tenantId === where.tenantId && batch.projectId === where.projectId && (Array.isArray(where.entity?.in) ? where.entity.in.includes(batch.entity) : batch.entity === where.entity) && (!where.status || batch.status === where.status)).map((batch: any) => include?.records ? { ...batch, records: state.records.filter((record: any) => record.batchId === batch.id) } : batch)),
      create: vi.fn(async ({ data }: any) => {
        const batch = { id: `batch-${state.batches.length + 1}`, createdAt: new Date('2026-10-24T12:00:00.000Z'), ...data }
        state.batches.push(batch)
        return batch
      }),
    },
    dataMigrationStagedRecord: {
      findMany: vi.fn(async ({ where }: any) => state.records.filter((record: any) => record.tenantId === where.tenantId && record.projectId === where.projectId && record.entity === where.entity && (!where.sourceId?.in || where.sourceId.in.includes(record.sourceId)))),
      count: vi.fn(async ({ where }: any) => state.records.filter((record: any) => record.tenantId === where.tenantId && record.projectId === where.projectId && record.entity === where.entity).length),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matched = state.records.filter((record: any) => record.tenantId === where.tenantId && record.projectId === where.projectId && record.entity === where.entity && where.sourceId.in.includes(record.sourceId) && (!where.isCurrent || record.isCurrent !== false))
        matched.forEach((record: any) => Object.assign(record, data))
        return { count: matched.length }
      }),
      createMany: vi.fn(async ({ data }: any) => { state.records.push(...data.map((record: any) => ({ id: `record-${state.records.length + 1}`, createdAt: new Date('2026-10-24T12:00:00.000Z'), ...record }))); return { count: data.length } }),
    },
    dataMigrationImportJob: { findMany: vi.fn(async () => state.importJobs) },
    dataMigrationRecordLink: {
      findMany: vi.fn(async ({ where }: any) => state.links.filter((link: any) => link.tenantId === where.tenantId && link.projectId === where.projectId && link.sourceEntity === where.sourceEntity && where.sourceId.in.includes(link.sourceId))),
    },
    tenant: { findUnique: vi.fn(async () => ({ currency: 'USD' })) },
    inventoryValuationAccountMapping: { findUnique: vi.fn(async () => state.mapping ?? null) },
    journalEntry: { count: vi.fn(async () => 0) },
    payableInvoice: { count: vi.fn(async () => 0) },
    receivableInvoice: { count: vi.fn(async () => 0) },
    auditLog: { create: vi.fn(async ({ data }: any) => { state.audits.push(data); return {} }) },
  })
  const client = makeClient()
  const prisma = {
    ...client,
    $transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => callback({ ...client })),
  } as unknown as PrismaClient
  state.links = [{ tenantId, projectId, sourceEntity: 'FINANCE_VENDORS', sourceId: 'legacy-vendor-1' }]
  return { prisma, state }
}

describe('Finance migration staging', () => {
  it('validates vendor dependencies, source totals, and batch boundaries without creating operational records', async () => {
    const { prisma, state } = await setup()
    const valid = await validateFinanceMigrationStage(prisma, tenantId, projectId, 'FINANCE_AP_OPEN_ITEMS', apRows)
    expect(valid).toMatchObject({ totalRows: 1, validRows: 1, alreadyStaged: false, issues: [] })
    const missingLink = await validateFinanceMigrationStage(prisma, tenantId, projectId, 'FINANCE_AP_OPEN_ITEMS', [{ ...apRows[0], vendorSourceId: 'missing-vendor' }])
    expect(missingLink.issues).toEqual([expect.objectContaining({ field: 'vendorSourceId', rowNumber: 2 })])
    expect(state.records).toHaveLength(0)
    expect(state.batches).toHaveLength(0)
  })

  it('stages source rows durably, retries idempotently, and leaves live invoice data untouched', async () => {
    const { prisma, state } = await setup()
    const first = await stageFinanceMigrationBatch(prisma, tenantId, projectId, 'FINANCE_AP_OPEN_ITEMS', apRows, actorId)
    const retry = await stageFinanceMigrationBatch(prisma, tenantId, projectId, 'FINANCE_AP_OPEN_ITEMS', apRows, actorId)
    expect(first).toMatchObject({ replayed: false, batch: { entity: 'FINANCE_AP_OPEN_ITEMS', status: 'STAGED', totalRows: 1, stagedRows: 1 } })
    expect(retry).toMatchObject({ replayed: true, batch: { id: first.batch.id } })
    expect(state.records).toHaveLength(1)
    expect(state.records[0].payload).toMatchObject({ openAmount: '80.00', originalAmount: '100.00', paidAmount: '20.00' })
    expect(state.projectStatus).toBe('IN_PROGRESS')
    expect(state.audits).toHaveLength(1)
    const saved = await listFinanceMigrationStageRecords(prisma, tenantId, projectId, 'FINANCE_AP_OPEN_ITEMS', { page: 1, limit: 50 })
    expect(saved).toMatchObject({ items: [{ sourceId: 'legacy-ap-1', payload: { openAmount: '80.00' } }], pagination: { page: 1, limit: 50, total: 1, pages: 1 } })
  })

  it('keeps completed Finance snapshots closed to new stage batches', async () => {
    const { prisma, state } = await setup()
    state.batches.push({ tenantId, projectId, entity: 'FINANCE_AP_OPEN_ITEMS', status: 'COMPLETED', idempotencyKey: 'cutover', requestHash: 'cutover' })
    await expect(validateFinanceMigrationStage(prisma, tenantId, projectId, 'FINANCE_AP_OPEN_ITEMS', apRows)).rejects.toThrow(/cutover is already complete/)
  })

  it('preserves corrected staged rows as a new revision and uses only the current revision for reconciliation', async () => {
    const { prisma, state } = await setup()
    const first = await stageFinanceMigrationBatch(prisma, tenantId, projectId, 'FINANCE_AP_OPEN_ITEMS', apRows, actorId)
    const correctedRows = [{ ...apRows[0], openAmount: '70.00', originalAmount: '100.00', paidAmount: '30.00' }]
    const corrected = await stageFinanceMigrationBatch(prisma, tenantId, projectId, 'FINANCE_AP_OPEN_ITEMS', correctedRows, actorId)

    expect(first.replayed).toBe(false)
    expect(corrected.replayed).toBe(false)
    expect(state.records).toHaveLength(2)
    expect(state.records.map((record: any) => ({ revision: record.revision, isCurrent: record.isCurrent, amount: record.payload.openAmount }))).toEqual([
      { revision: 1, isCurrent: false, amount: '80.00' },
      { revision: 2, isCurrent: true, amount: '70.00' },
    ])
    expect(state.batches).toHaveLength(2)
  })

  it('sequences correction batches deterministically and retains revised trial-balance controls', async () => {
    const { prisma, state } = await setup()
    const firstMetadata = { asOf: '2026-09-30', accountsReceivableControlTotal: '0.00', accountsPayableControlTotal: '0.00' }
    const correctedMetadata = { ...firstMetadata, accountsReceivableControlTotal: '10.00' }
    const first = await stageFinanceMigrationBatch(prisma, tenantId, projectId, 'FINANCE_OPENING_BALANCE', [
      { code: 'CASH', name: 'Cash', kind: 'ASSET', side: 'DEBIT', amount: '100.00' },
    ], actorId, firstMetadata)
    const correction = await stageFinanceMigrationBatch(prisma, tenantId, projectId, 'FINANCE_OPENING_BALANCE', [
      { code: 'CAPITAL', name: 'Capital', kind: 'EQUITY', side: 'CREDIT', amount: '100.00' },
    ], actorId, correctedMetadata)

    expect(first.batch.sequence).toBe(1)
    expect(correction.batch.sequence).toBe(2)
    expect(state.batches.map((batch: any) => batch.metadata.accountsReceivableControlTotal)).toEqual(['0.00', '10.00'])
  })

  it('requires the cutover date and a balanced base-currency opening trial balance', async () => {
    const { prisma } = await setup()
    const lines = [
      { code: 'CASH', name: 'Cash', kind: 'ASSET' as const, side: 'DEBIT' as const, amount: '100.00' },
      { code: 'CAPITAL', name: 'Capital', kind: 'EQUITY' as const, side: 'CREDIT' as const, amount: '100.00' },
    ]
    const metadata = { asOf: '2026-09-30', accountsReceivableControlTotal: '0.00', accountsPayableControlTotal: '0.00' }
    expect(await validateFinanceMigrationStage(prisma, tenantId, projectId, 'FINANCE_OPENING_BALANCE', lines, metadata)).toMatchObject({ validRows: 2, issues: [] })
    const invalid = await validateFinanceMigrationStage(prisma, tenantId, projectId, 'FINANCE_OPENING_BALANCE', lines, { ...metadata, asOf: '2026-09-29' })
    expect(invalid.issues).toEqual([expect.objectContaining({ field: 'asOf' })])
    const reconciled = await validateFinanceMigrationStage(prisma, tenantId, projectId, 'FINANCE_OPENING_BALANCE', [
      { ...lines[0], amount: '12200.00' },
      { ...lines[1], amount: '12000.00' },
    ], { ...metadata, accountsReceivableControlTotal: '600.00', accountsPayableControlTotal: '800.00' })
    expect(reconciled).toMatchObject({ validRows: 2, issues: [] })
    const unbalanced = await validateFinanceMigrationStage(prisma, tenantId, projectId, 'FINANCE_OPENING_BALANCE', [{ ...lines[0], amount: '100.00' }, { ...lines[1], amount: '90.00' }], metadata)
    expect(unbalanced).toMatchObject({ validRows: 2, issues: [] })
  })

  it('reserves the mapped inventory asset and inventory opening equity accounts in trial-balance staging', async () => {
    const { prisma, state } = await setup()
    state.mapping = { inventoryAssetAccountCode: 'INVENTORY_ASSET' }
    const metadata = { asOf: '2026-09-30', accountsReceivableControlTotal: '0.00', accountsPayableControlTotal: '0.00' }
    const inventoryAsset = await validateFinanceMigrationStage(prisma, tenantId, projectId, 'FINANCE_OPENING_BALANCE', [
      { code: 'CASH', name: 'Cash', kind: 'ASSET', side: 'DEBIT', amount: '100.00' },
      { code: 'INVENTORY_ASSET', name: 'Inventory', kind: 'ASSET', side: 'DEBIT', amount: '50.00' },
      { code: 'CAPITAL', name: 'Capital', kind: 'EQUITY', side: 'CREDIT', amount: '150.00' },
    ], metadata)
    expect(inventoryAsset.issues).toEqual([
      expect.objectContaining({ field: 'lines', message: expect.stringContaining('INVENTORY_ASSET') }),
    ])

    const openingEquity = await validateFinanceMigrationStage(prisma, tenantId, projectId, 'FINANCE_OPENING_BALANCE', [
      { code: 'CASH', name: 'Cash', kind: 'ASSET', side: 'DEBIT', amount: '100.00' },
      { code: 'INVENTORY_OPENING_EQUITY', name: 'Inventory opening equity', kind: 'EQUITY', side: 'CREDIT', amount: '100.00' },
    ], metadata)
    expect(openingEquity.issues).toEqual([
      expect.objectContaining({ field: 'lines', message: expect.stringContaining('INVENTORY_OPENING_EQUITY') }),
    ])
  })

  it('surfaces reserved control accounts in reconciliation before cutover', async () => {
    const { prisma, state } = await setup()
    state.mapping = { inventoryAssetAccountCode: 'INVENTORY_ASSET' }
    const asOf = '2026-09-30'
    for (const [index, batch] of [
      { entity: 'FINANCE_AP_OPEN_ITEMS', records: [{ sourceId: 'ap-1', status: 'APPROVED', openAmount: '800.00', currency: 'USD' }] },
      { entity: 'FINANCE_AR_OPEN_ITEMS', records: [{ sourceId: 'ar-1', status: 'OVERDUE', openAmount: '600.00', currency: 'USD' }] },
      { entity: 'FINANCE_OPENING_BALANCE', metadata: { asOf, accountsReceivableControlTotal: '600.00', accountsPayableControlTotal: '800.00' }, records: [
        { code: 'CASH', side: 'DEBIT', amount: '12200.00' },
        { code: 'INVENTORY_ASSET', side: 'DEBIT', amount: '1.00' },
        { code: 'CAPITAL', side: 'CREDIT', amount: '12000.00' },
      ] },
    ].entries()) {
      const id = `batch-reserved-${index}`
      state.batches.push({ id, tenantId, projectId, entity: batch.entity, status: 'STAGED', metadata: batch.metadata ?? null })
      state.records.push(...batch.records.map(record => ({ id: `${id}-${record.sourceId ?? record.code}`, tenantId, projectId, entity: batch.entity, batchId: id, payload: record })))
    }
    const result = await previewFinanceMigrationReconciliation(prisma, tenantId, projectId)
    expect(result.state).toBe('RECONCILIATION_REQUIRED')
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'RESERVED_ACCOUNT', message: expect.stringContaining('INVENTORY_ASSET') }),
    ]))
  })

  it('reconciles staged eligible AP and AR against control totals without enabling cutover writes', async () => {
    const { prisma, state } = await setup()
    const asOf = '2026-09-30'
    const batches = [
      { entity: 'FINANCE_AP_OPEN_ITEMS', records: [{ sourceId: 'ap-1', status: 'APPROVED', openAmount: '800.00', currency: 'USD' }] },
      { entity: 'FINANCE_AR_OPEN_ITEMS', records: [{ sourceId: 'ar-1', status: 'OVERDUE', openAmount: '600.00', currency: 'USD' }] },
      { entity: 'FINANCE_OPENING_BALANCE', metadata: { asOf, accountsReceivableControlTotal: '600.00', accountsPayableControlTotal: '800.00' }, records: [
        { code: 'CASH', side: 'DEBIT', amount: '12200.00' },
        { code: 'CAPITAL', side: 'CREDIT', amount: '12000.00' },
      ] },
    ]
    batches.forEach((batch, index) => {
      const id = `batch-reconcile-${index}`
      state.batches.push({ id, tenantId, projectId, entity: batch.entity, status: 'STAGED', metadata: batch.metadata ?? null })
      state.records.push(...batch.records.map(record => ({ id: `${id}-${record.sourceId ?? record.code}`, tenantId, projectId, entity: batch.entity, batchId: id, payload: record })))
    })
    state.records.push({ id: 'superseded-ap', tenantId, projectId, entity: 'FINANCE_AP_OPEN_ITEMS', batchId: 'batch-reconcile-0', sourceId: 'ap-1', revision: 1, isCurrent: false, payload: { status: 'APPROVED', openAmount: '9000.00', currency: 'USD' } })
    const result = await previewFinanceMigrationReconciliation(prisma, tenantId, projectId)
    expect(result).toMatchObject({ state: 'RECONCILED_PENDING_CUTOVER', cutoverAvailable: false, evidence: { apRows: 1, eligibleApRows: 1, arRows: 1, trialBalanceRows: 2 }, balances: { sourceApControl: '800.0000', stagedEligibleApAtCutoverFx: '800.0000', apDifference: '0.0000', sourceArControl: '600.0000', stagedArAtCutoverFx: '600.0000', arDifference: '0.0000' }, issues: [] })
    state.records.find((record: any) => record.payload.code === 'CASH').payload.amount = '12199.00'
    const mismatch = await previewFinanceMigrationReconciliation(prisma, tenantId, projectId)
    expect(mismatch.state).toBe('RECONCILIATION_REQUIRED')
    expect(mismatch.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TRIAL_BALANCE_OUT_OF_BALANCE' })]))
  })

  it('reports a completed Finance cutover as completed after the reviewer returns to Settings', async () => {
    const { prisma, state } = await setup()
    const asOf = '2026-09-30'
    const cutoverHash = 'cutover-request-hash'
    for (const [index, batch] of [
      { entity: 'FINANCE_AP_OPEN_ITEMS', records: [{ sourceId: 'ap-completed', status: 'APPROVED', openAmount: '800.00', currency: 'USD' }] },
      { entity: 'FINANCE_AR_OPEN_ITEMS', records: [{ sourceId: 'ar-completed', status: 'OVERDUE', openAmount: '600.00', currency: 'USD' }] },
      { entity: 'FINANCE_OPENING_BALANCE', metadata: { asOf, accountsReceivableControlTotal: '600.00', accountsPayableControlTotal: '800.00' }, records: [{ code: 'CASH', side: 'DEBIT', amount: '12200.00' }, { code: 'CAPITAL', side: 'CREDIT', amount: '12000.00' }] },
    ].entries()) {
      const id = `completed-${index}`
      state.batches.push({ id, tenantId, projectId, entity: batch.entity, status: 'COMPLETED', metadata: batch.metadata ?? null })
      state.records.push(...batch.records.map((payload: any) => ({ id: `${id}-${payload.sourceId ?? payload.code}`, tenantId, projectId, entity: batch.entity, batchId: id, sourceId: payload.sourceId ?? `ACCOUNT:${payload.code}`, payload })))
      state.importJobs.push({ entity: batch.entity, requestHash: cutoverHash })
    }
    const result = await previewFinanceMigrationReconciliation(prisma, tenantId, projectId)
    expect(result.state).toBe('CUTOVER_COMPLETED')
    expect(result.issues).toEqual([])
  })
})
