import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { importInventoryProductSuppliers, importInventorySuppliers, validateInventoryProductSupplierImport, validateInventorySupplierImport } from '../src/modules/settings/inventorySupplierMigration.service.js'

const tenantId = 'tenant_1'
const projectId = 'c00000000000000000000001'
const actorId = 'user_1'
const suppliers = [
  { sourceId: 'legacy-supplier-1', name: 'Northstar Industrial', sourceCreatedAt: '2025-04-12' },
  { sourceId: 'legacy-supplier-2', name: 'Northstar Industrial' },
]
const relationships = [
  { sourceProductId: 'legacy-product-1', sourceSupplierId: 'legacy-supplier-1' },
  { sourceProductId: 'legacy-product-1', sourceSupplierId: 'legacy-supplier-2' },
]

async function setup() {
  let state: any = {
    projects: [{ id: projectId, tenantId, status: 'PLANNING', modules: ['INVENTORY'] }],
    suppliers: [], products: [{ id: 'product-1', tenantId, sku: 'SKU-1', archivedAt: null }],
    jobs: [], links: [{ id: 'product-link', tenantId, projectId, sourceEntity: 'INVENTORY_PRODUCTS', sourceId: 'legacy-product-1', targetEntity: 'INVENTORY_PRODUCTS', targetId: 'product-1' }],
    productSuppliers: [], audits: [],
  }
  const delegate = () => ({
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
    supplier: {
      create: vi.fn(async ({ data }: any) => { const supplier = { id: `supplier-${state.suppliers.length + 1}`, ...data }; state.suppliers.push(supplier); return supplier }),
      findMany: vi.fn(async ({ where }: any) => state.suppliers.filter((supplier: any) => supplier.tenantId === where.tenantId && where.id.in.includes(supplier.id))),
    },
    product: {
      findMany: vi.fn(async ({ where }: any) => state.products.filter((product: any) => product.tenantId === where.tenantId && where.id.in.includes(product.id))),
    },
    productSupplier: {
      upsert: vi.fn(async ({ where, create }: any) => {
        let association = state.productSuppliers.find((item: any) => item.productId === where.productId_supplierId.productId && item.supplierId === where.productId_supplierId.supplierId)
        if (!association) { association = { id: `association-${state.productSuppliers.length + 1}`, ...create }; state.productSuppliers.push(association) }
        return { id: association.id }
      }),
    },
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

describe('Inventory supplier migration', () => {
  it('preserves distinct suppliers by source ID and atomically replays catalog batches', async () => {
    const { prisma, state } = await setup()
    const first = await importInventorySuppliers(prisma, tenantId, projectId, suppliers, actorId)
    const replay = await importInventorySuppliers(prisma, tenantId, projectId, suppliers, actorId)
    expect(first).toMatchObject({ imported: 2, replayed: false, job: { entity: 'INVENTORY_SUPPLIERS' } })
    expect(replay).toMatchObject({ imported: 2, replayed: true, job: { id: first.job.id } })
    expect(state().suppliers).toHaveLength(2)
    expect(state().suppliers[0]).toMatchObject({ name: 'Northstar Industrial', createdAt: new Date('2025-04-12T00:00:00.000Z') })
    expect(state().links.slice(-2)).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceEntity: 'INVENTORY_SUPPLIERS', sourceId: 'legacy-supplier-1', targetEntity: 'INVENTORY_SUPPLIERS', targetId: 'supplier-1' }),
      expect.objectContaining({ sourceEntity: 'INVENTORY_SUPPLIERS', sourceId: 'legacy-supplier-2', targetEntity: 'INVENTORY_SUPPLIERS', targetId: 'supplier-2' }),
    ]))
    expect(state().audits).toHaveLength(1)
  })

  it('rejects duplicate and malformed source records without writes', async () => {
    const { prisma, state } = await setup()
    const result = await validateInventorySupplierImport(prisma, tenantId, projectId, [suppliers[0], { ...suppliers[0], name: '' }, { sourceId: 'supplier-3', name: 'Supplier', sourceCreatedAt: '2025-02-30' }])
    expect(result.validRows).toBe(0)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowNumber: 2, field: 'sourceId' }),
      expect.objectContaining({ rowNumber: 3, field: 'sourceId' }),
      expect.objectContaining({ rowNumber: 3, field: 'name' }),
      expect.objectContaining({ rowNumber: 4, field: 'sourceCreatedAt' }),
    ]))
    expect(state().suppliers).toHaveLength(0)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('imports product-supplier links through both source crosswalks and replays safely', async () => {
    const { prisma, state } = await setup()
    await importInventorySuppliers(prisma, tenantId, projectId, suppliers, actorId)
    const first = await importInventoryProductSuppliers(prisma, tenantId, projectId, relationships, actorId)
    const replay = await importInventoryProductSuppliers(prisma, tenantId, projectId, relationships, actorId)
    expect(first).toMatchObject({ imported: 2, replayed: false, job: { entity: 'INVENTORY_PRODUCT_SUPPLIERS' } })
    expect(replay).toMatchObject({ imported: 2, replayed: true, job: { id: first.job.id } })
    expect(state().productSuppliers).toEqual([
      { id: 'association-1', productId: 'product-1', supplierId: 'supplier-1' },
      { id: 'association-2', productId: 'product-1', supplierId: 'supplier-2' },
    ])
    expect(state().links.slice(-2)).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceEntity: 'INVENTORY_PRODUCT_SUPPLIERS', targetEntity: 'INVENTORY_PRODUCT_SUPPLIERS', targetId: 'association-1' }),
      expect.objectContaining({ sourceEntity: 'INVENTORY_PRODUCT_SUPPLIERS', targetEntity: 'INVENTORY_PRODUCT_SUPPLIERS', targetId: 'association-2' }),
    ]))
    expect(state().audits).toHaveLength(2)
  })

  it('requires imported product and supplier dependencies and rejects repeated pairs', async () => {
    const { prisma, state } = await setup()
    const missing = await validateInventoryProductSupplierImport(prisma, tenantId, projectId, [relationships[0]])
    expect(missing.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowNumber: 2, field: 'sourceSupplierId', message: expect.stringContaining('Import Inventory suppliers first') }),
    ]))
    const result = await validateInventoryProductSupplierImport(prisma, tenantId, projectId, [relationships[0], relationships[0]])
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowNumber: 2, message: expect.stringContaining('appears again') }),
      expect.objectContaining({ rowNumber: 3, message: expect.stringContaining('already included') }),
    ]))
    expect(state().productSuppliers).toHaveLength(0)
  })
})
