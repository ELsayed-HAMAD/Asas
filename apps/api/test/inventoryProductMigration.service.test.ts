import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { importInventoryProducts, validateInventoryProductImport } from '../src/modules/settings/inventoryProductMigration.service.js'

const tenantId = 'tenant_1'
const projectId = 'c00000000000000000000001'
const ownerId = 'user_1'
const rows = [
  { sourceId: 'legacy-item-1', sku: 'SKU-1001', name: 'Industrial filter', salePrice: '49.95', minThreshold: '12', avgMonthlyUsage: '25', leadTimeDays: '14', warehouse: 'Main', aisle: 'A-04', bin: 'BIN-12', sourceCreatedAt: '2025-02-01' },
  { sourceId: 'legacy-item-2', sku: 'SKU-1002', name: 'Valve kit', salePrice: '0' },
]

async function setup() {
  let state: any = {
    projects: [{ id: projectId, tenantId, status: 'PLANNING', modules: ['INVENTORY'] }],
    products: [], jobs: [], links: [], audits: [],
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
    product: {
      findMany: vi.fn(async ({ where }: any) => state.products.filter((product: any) => product.tenantId === where.tenantId && where.sku.in.some((sku: string) => sku.toLowerCase() === product.sku.toLowerCase()))),
      create: vi.fn(async ({ data }: any) => { const product = { id: `product-${state.products.length + 1}`, ...data }; state.products.push(product); return product }),
    },
    auditLog: { create: vi.fn(async ({ data }: any) => { state.audits.push(data); return {} }) },
  })
  const root = delegate()
  const tx = delegate()
  const prisma = { ...root, $transaction: vi.fn(async (callback: (client: any) => Promise<unknown>) => {
    const before = Object.fromEntries(Object.entries(state).map(([key, value]) => [key, Array.isArray(value) ? value.map((row: any) => ({ ...row })) : value]))
    try { return await callback(tx) } catch (error) { state = before; throw error }
  }) } as unknown as PrismaClient
  return { prisma, state: () => state }
}

describe('Inventory product migration', () => {
  it('validates SKU/source duplicates and prior products without writes', async () => {
    const { prisma, state } = await setup()
    state().products.push({ tenantId, sku: 'SKU-1002', id: 'existing-product' })
    const result = await validateInventoryProductImport(prisma, tenantId, projectId, [rows[0], { ...rows[1], sourceId: rows[0].sourceId }])
    expect(result.validRows).toBe(0)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowNumber: 2, field: 'sourceId' }),
      expect.objectContaining({ rowNumber: 3, field: 'sourceId' }),
      expect.objectContaining({ rowNumber: 3, field: 'sku' }),
    ]))
    expect(state().products).toHaveLength(1)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('imports catalog fields and source links atomically with zero on-hand stock; exact retries replay', async () => {
    const { prisma, state } = await setup()
    const first = await importInventoryProducts(prisma, tenantId, projectId, rows, ownerId)
    const replay = await importInventoryProducts(prisma, tenantId, projectId, rows, ownerId)
    expect(first).toMatchObject({ imported: 2, replayed: false, job: { entity: 'INVENTORY_PRODUCTS' } })
    expect(replay).toMatchObject({ imported: 2, replayed: true, job: { id: first.job.id } })
    expect(state().products).toHaveLength(2)
    expect(state().products[0]).toMatchObject({ sku: 'SKU-1001', name: 'Industrial filter', stock: 0, minThreshold: 12, leadTimeDays: 14, warehouse: 'Main' })
    expect(state().products[0].price.toString()).toBe('49.95')
    expect(state().products[0].createdAt).toEqual(new Date('2025-02-01T00:00:00.000Z'))
    expect(state().links.at(-1)).toMatchObject({ sourceEntity: 'INVENTORY_PRODUCTS', sourceId: 'legacy-item-2', targetEntity: 'INVENTORY_PRODUCTS', targetId: 'product-2' })
    expect(state().jobs).toHaveLength(1)
    expect(state().audits).toHaveLength(1)
  })

  it('rejects unsupported project scope and unsafe precision before any products are committed', async () => {
    const { prisma, state } = await setup()
    const precision = await validateInventoryProductImport(prisma, tenantId, projectId, [{ ...rows[0], salePrice: '1.12345' }])
    expect(precision.issues).toContainEqual(expect.objectContaining({ rowNumber: 2, field: 'salePrice' }))
    state().projects[0].modules = ['CRM']
    await expect(importInventoryProducts(prisma, tenantId, projectId, rows, ownerId)).rejects.toMatchObject({ statusCode: 409 })
    expect(state().products).toHaveLength(0)
  })
})
