import type { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { importInventoryOpeningStock, validateInventoryOpeningStockImport } from '../src/modules/settings/inventoryOpeningStockMigration.service.js'
import { ensureInventoryOpeningEquity, postValuedReceipt } from '../src/modules/inventory/inventoryValuation.service.js'

vi.mock('../src/modules/inventory/inventoryValuation.service.js', () => ({
  ensureInventoryOpeningEquity: vi.fn(async () => 'acct_equity'),
  postValuedReceipt: vi.fn(async () => ({ eventId: 'event_1', journalEntryId: 'journal_1', value: '3000.00' })),
}))

const tenantId = 'tenant_1'
const projectId = 'c00000000000000000000001'
const ownerId = 'user_1'
const rows = [
  { sourceProductId: 'legacy-item-1', quantity: '240', asOf: '2026-09-30' },
  { sourceProductId: 'legacy-item-2', quantity: '0', asOf: '2026-09-30' },
]

async function setup() {
  let state: any = {
    projects: [{ id: projectId, tenantId, name: 'Company migration', status: 'PLANNING', modules: ['INVENTORY'] }],
    products: [
      { id: 'product-1', tenantId, sku: 'SKU-1001', currency: 'USD', stock: 0, _count: { movements: 0 } },
      { id: 'product-2', tenantId, sku: 'SKU-1002', currency: 'USD', stock: 0, _count: { movements: 0 } },
    ],
    valuationConfig: null,
    mappings: [],
    financeOpenings: 0,
    jobs: [], links: [
      { id: 'catalog-link-1', tenantId, projectId, sourceEntity: 'INVENTORY_PRODUCTS', sourceId: 'legacy-item-1', targetEntity: 'INVENTORY_PRODUCTS', targetId: 'product-1' },
      { id: 'catalog-link-2', tenantId, projectId, sourceEntity: 'INVENTORY_PRODUCTS', sourceId: 'legacy-item-2', targetEntity: 'INVENTORY_PRODUCTS', targetId: 'product-2' },
    ], movements: [], audits: [],
  }
  const delegate = () => ({
    tenant: {
      findUnique: vi.fn(async ({ where }: any) => where.id === tenantId ? { currency: 'USD' } : null),
    },
    inventoryValuationConfig: {
      findUnique: vi.fn(async () => state.valuationConfig),
    },
    inventoryValuationAccountMapping: {
      findMany: vi.fn(async ({ where }: any) => state.mappings.filter((mapping: any) => where.currency.in.includes(mapping.currency))),
    },
    journalEntry: {
      count: vi.fn(async ({ where }: any) => where.sourceType === 'OPENING_BALANCE' ? state.financeOpenings : 0),
    },
    dataMigrationProject: {
      findFirst: vi.fn(async ({ where }: any) => state.projects.find((project: any) => project.id === where.id && project.tenantId === where.tenantId) ?? null),
      update: vi.fn(async ({ where, data }: any) => Object.assign(state.projects.find((project: any) => project.id === where.id), data)),
    },
    dataMigrationImportJob: {
      findUnique: vi.fn(async ({ where }: any) => {
        const key = where.tenantId_projectId_entity_idempotencyKey
        return state.jobs.find((job: any) => job.tenantId === key.tenantId && job.projectId === key.projectId && job.entity === key.entity && job.idempotencyKey === key.idempotencyKey) ?? null
      }),
      create: vi.fn(async ({ data }: any) => { const now = new Date('2026-10-24T12:00:00.000Z'); const job = { id: `job-${state.jobs.length + 1}`, createdAt: now, completedAt: now, ...data }; state.jobs.push(job); return job }),
    },
    dataMigrationRecordLink: {
      findMany: vi.fn(async ({ where }: any) => state.links.filter((link: any) => link.tenantId === where.tenantId && link.projectId === where.projectId && link.sourceEntity === where.sourceEntity && where.sourceId.in.includes(link.sourceId))),
      create: vi.fn(async ({ data }: any) => { const link = { id: `link-${state.links.length + 1}`, ...data }; state.links.push(link); return link }),
    },
    product: {
      findMany: vi.fn(async ({ where }: any) => state.products.filter((product: any) => product.tenantId === where.tenantId && where.id.in.includes(product.id))),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const product = state.products.find((item: any) => item.id === where.id && item.tenantId === where.tenantId && item.stock === where.stock && item._count.movements === 0)
        if (!product) return { count: 0 }
        product.stock += data.stock.increment
        return { count: 1 }
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: any) => state.products.find((product: any) => product.id === where.id)),
    },
    stockMovement: { create: vi.fn(async ({ data }: any) => { const movement = { id: `movement-${state.movements.length + 1}`, ...data }; state.movements.push(movement); const product = state.products.find((item: any) => item.id === data.productId); if (product) product._count.movements += 1; return movement }) },
    auditLog: { create: vi.fn(async ({ data }: any) => { state.audits.push(data); return {} }) },
  })
  const root = delegate()
  const tx = delegate()
  const prisma = { ...root, $transaction: vi.fn(async (callback: (client: any) => Promise<unknown>) => {
    const before = structuredClone(state)
    try { return await callback(tx) } catch (error) { state = before; throw error }
  }) } as unknown as PrismaClient
  return { prisma, state: () => state }
}

describe('Inventory opening stock migration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('validates dependencies, unique products, source links, and existing stock without writes', async () => {
    const { prisma, state } = await setup()
    state().products[0].stock = 4
    const result = await validateInventoryOpeningStockImport(prisma, tenantId, projectId, [rows[0], { ...rows[0] }, { sourceProductId: 'unknown', quantity: '-1', asOf: '2026-02-30' }])
    expect(result.validRows).toBe(0)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowNumber: 2, field: 'sourceProductId', message: expect.stringContaining('already has stock') }),
      expect.objectContaining({ rowNumber: 2, field: 'sourceProductId', message: expect.stringContaining('repeated') }),
      expect.objectContaining({ rowNumber: 4, field: 'sourceProductId', message: expect.stringContaining('Import the product catalog first') }),
      expect.objectContaining({ rowNumber: 4, field: 'quantity' }),
      expect.objectContaining({ rowNumber: 4, field: 'asOf' }),
    ]))
    expect(state().movements).toHaveLength(0)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('records dated positive movements and zero snapshots with replay protection in one transaction', async () => {
    const { prisma, state } = await setup()
    const first = await importInventoryOpeningStock(prisma, tenantId, projectId, rows, ownerId)
    const replay = await importInventoryOpeningStock(prisma, tenantId, projectId, rows, ownerId)
    expect(first).toMatchObject({ imported: 2, replayed: false, job: { entity: 'INVENTORY_OPENING_STOCK' } })
    expect(replay).toMatchObject({ imported: 2, replayed: true, job: { id: first.job.id } })
    expect(state().products.map((product: any) => product.stock)).toEqual([240, 0])
    expect(state().movements).toEqual([expect.objectContaining({ productId: 'product-1', delta: 240, createdAt: new Date('2026-09-30T00:00:00.000Z') })])
    expect(state().links.slice(-2)).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceEntity: 'INVENTORY_OPENING_STOCK', sourceId: 'legacy-item-1', targetEntity: 'INVENTORY_PRODUCTS', targetId: 'product-1' }),
      expect.objectContaining({ sourceEntity: 'INVENTORY_OPENING_STOCK', sourceId: 'legacy-item-2', targetEntity: 'INVENTORY_PRODUCTS', targetId: 'product-2' }),
    ]))
    expect(state().jobs).toHaveLength(1)
    expect(state().audits).toHaveLength(1)
  })

  it('requires an exact source cost when valuation is configured and blocks opening stock after Finance opening', async () => {
    const { prisma, state } = await setup()
    state().valuationConfig = { costingMethod: 'FIFO' }
    state().mappings = []
    state().financeOpenings = 1
    const result = await validateInventoryOpeningStockImport(prisma, tenantId, projectId, [
      { sourceProductId: 'legacy-item-1', quantity: '240', asOf: '2026-09-30' },
      { sourceProductId: 'legacy-item-2', quantity: '1', unitCost: '12.505', asOf: '2026-09-30' },
    ])
    expect(result.validRows).toBe(0)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowNumber: 2, field: 'quantity', message: expect.stringContaining('Finance opening balance') }),
      expect.objectContaining({ rowNumber: 2, field: 'unitCost', message: expect.stringContaining('requires a positive source unit cost') }),
      expect.objectContaining({ rowNumber: 3, field: 'quantity', message: expect.stringContaining('Finance opening balance') }),
      expect.objectContaining({ rowNumber: 3, field: 'unitCost', message: expect.stringContaining('exact amount in USD') }),
      expect.objectContaining({ rowNumber: 3, field: 'unitCost', message: expect.stringContaining('No inventory valuation ledger mapping exists for USD') }),
    ]))
    expect(state().movements).toHaveLength(0)

    state().valuationConfig = null
    state().financeOpenings = 0
    const costWithoutValuation = await validateInventoryOpeningStockImport(prisma, tenantId, projectId, [
      { sourceProductId: 'legacy-item-2', quantity: '1', unitCost: '10.00', asOf: '2026-09-30' },
    ])
    expect(costWithoutValuation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowNumber: 2, field: 'unitCost', message: expect.stringContaining('Inventory valuation is not configured') }),
    ]))

    state().financeOpenings = 1
    const quantityOnlyAfterFinance = await validateInventoryOpeningStockImport(prisma, tenantId, projectId, [
      { sourceProductId: 'legacy-item-2', quantity: '1', asOf: '2026-09-30' },
    ])
    expect(quantityOnlyAfterFinance.validRows).toBe(0)
    expect(quantityOnlyAfterFinance.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowNumber: 2, field: 'quantity', message: expect.stringContaining('Finance opening balance') }),
    ]))
  })

  it('posts valued opening stock against opening equity and preserves source cost evidence', async () => {
    const { prisma, state } = await setup()
    state().valuationConfig = { costingMethod: 'FIFO' }
    state().mappings = [{ currency: 'USD' }]
    const batch = [
      { sourceProductId: 'legacy-item-1', quantity: '240', unitCost: '12.50', asOf: '2026-09-30' },
      { sourceProductId: 'legacy-item-2', quantity: '0', asOf: '2026-09-30' },
    ]
    const first = await importInventoryOpeningStock(prisma, tenantId, projectId, batch, ownerId)
    expect(first).toMatchObject({ imported: 2, replayed: false })
    expect(ensureInventoryOpeningEquity).toHaveBeenCalledTimes(1)
    expect(ensureInventoryOpeningEquity).toHaveBeenCalledWith(expect.anything(), tenantId, 'USD')
    expect(postValuedReceipt).toHaveBeenCalledTimes(1)
    expect(postValuedReceipt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      tenantId,
      productId: 'product-1',
      stockMovementId: 'movement-1',
      quantity: 240,
      unitCost: '12.50',
      reason: 'OPENING_BALANCE',
      offsetAccountId: 'acct_equity',
      postedAt: new Date('2026-09-30T00:00:00.000Z'),
      actorId: ownerId,
    }))
    expect(state().movements[0].note).toContain('source unit cost 12.50 USD')
    expect(JSON.parse(state().audits[0].metadata)).toMatchObject({ valuedRows: 1, unvaluedPositiveRows: 0 })
    const replay = await importInventoryOpeningStock(prisma, tenantId, projectId, batch, ownerId)
    expect(replay).toMatchObject({ replayed: true, job: { id: first.job.id } })
    expect(postValuedReceipt).toHaveBeenCalledTimes(1)
  })

  it('refuses a quantity-only opening row while valuation is configured', async () => {
    const { prisma, state } = await setup()
    state().valuationConfig = { costingMethod: 'FIFO' }
    state().mappings = [{ currency: 'USD' }]
    await expect(importInventoryOpeningStock(prisma, tenantId, projectId, rows, ownerId))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(state().movements).toHaveLength(0)
    expect(postValuedReceipt).not.toHaveBeenCalled()
  })

  it('rejects missing dependencies and an inventory-excluded project', async () => {
    const { prisma, state } = await setup()
    await expect(importInventoryOpeningStock(prisma, tenantId, projectId, [{ ...rows[0], sourceProductId: 'missing' }], ownerId)).rejects.toMatchObject({ statusCode: 409 })
    state().projects[0].modules = ['CRM']
    await expect(importInventoryOpeningStock(prisma, tenantId, projectId, rows, ownerId)).rejects.toMatchObject({ statusCode: 409 })
    expect(state().movements).toHaveLength(0)
  })
})
