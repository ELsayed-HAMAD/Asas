import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { importFinanceCounterparties, validateFinanceCounterpartyImport } from '../src/modules/settings/financeCounterpartyMigration.service.js'

const tenantId = 'tenant_1'
const projectId = 'c00000000000000000000001'
const actorId = 'user_1'

async function setup() {
  let state: any = {
    projects: [{ id: projectId, tenantId, status: 'PLANNING', modules: ['FINANCE'] }],
    customers: [], vendors: [], jobs: [], links: [], audits: [],
  }
  const delegate = () => ({
    dataMigrationProject: {
      findFirst: vi.fn(async ({ where }: any) => state.projects.find((project: any) => project.id === where.id && project.tenantId === where.tenantId) ?? null),
      update: vi.fn(async ({ where, data }: any) => Object.assign(state.projects.find((project: any) => project.id === where.id), data)),
    },
    dataMigrationImportJob: {
      findUnique: vi.fn(async ({ where }: any) => { const key = where.tenantId_projectId_entity_idempotencyKey; return state.jobs.find((job: any) => job.tenantId === key.tenantId && job.projectId === key.projectId && job.entity === key.entity && job.idempotencyKey === key.idempotencyKey) ?? null }),
      create: vi.fn(async ({ data }: any) => { const now = new Date('2026-10-24T12:00:00.000Z'); const job = { id: `job-${state.jobs.length + 1}`, createdAt: now, completedAt: now, ...data }; state.jobs.push(job); return job }),
    },
    dataMigrationRecordLink: {
      findMany: vi.fn(async ({ where }: any) => state.links.filter((link: any) => link.tenantId === where.tenantId && link.projectId === where.projectId && link.sourceEntity === where.sourceEntity && where.sourceId.in.includes(link.sourceId))),
      create: vi.fn(async ({ data }: any) => { const link = { id: `link-${state.links.length + 1}`, ...data }; state.links.push(link); return link }),
    },
    customer: {
      findMany: vi.fn(async ({ where }: any) => state.customers.filter((item: any) => item.tenantId === where.tenantId && where.name.in.some((name: string) => name.toLowerCase() === item.name.toLowerCase()))),
      create: vi.fn(async ({ data }: any) => { const customer = { id: `customer-${state.customers.length + 1}`, ...data }; state.customers.push(customer); return customer }),
    },
    vendor: {
      findMany: vi.fn(async ({ where }: any) => state.vendors.filter((item: any) => item.tenantId === where.tenantId && where.name.in.some((name: string) => name.toLowerCase() === item.name.toLowerCase()))),
      create: vi.fn(async ({ data }: any) => { const vendor = { id: `vendor-${state.vendors.length + 1}`, ...data }; state.vendors.push(vendor); return vendor }),
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

describe('Finance counterparty migration', () => {
  it('imports customers with email and vendors as separate typed master data, safely replaying batches', async () => {
    const { prisma, state } = await setup()
    const customers = [{ sourceId: 'legacy-customer-1', name: 'Northstar Manufacturing', email: 'billing@example.com' }]
    const vendors = [{ sourceId: 'legacy-vendor-1', name: 'Industrial Supply Co.' }]
    const customerJob = await importFinanceCounterparties(prisma, tenantId, projectId, 'FINANCE_CUSTOMERS', customers, actorId)
    const vendorJob = await importFinanceCounterparties(prisma, tenantId, projectId, 'FINANCE_VENDORS', vendors, actorId)
    const replay = await importFinanceCounterparties(prisma, tenantId, projectId, 'FINANCE_CUSTOMERS', customers, actorId)
    expect(customerJob.job.entity).toBe('FINANCE_CUSTOMERS')
    expect(vendorJob.job.entity).toBe('FINANCE_VENDORS')
    expect(replay).toMatchObject({ imported: 1, replayed: true, job: { id: customerJob.job.id } })
    expect(state().customers).toEqual([{ id: 'customer-1', tenantId, name: 'Northstar Manufacturing', email: 'billing@example.com' }])
    expect(state().vendors).toEqual([{ id: 'vendor-1', tenantId, name: 'Industrial Supply Co.' }])
    expect(state().links).toHaveLength(2)
    expect(state().jobs).toHaveLength(2)
    expect(state().audits).toHaveLength(2)
  })

  it('validates source IDs, names, email format and existing records without writes', async () => {
    const { prisma, state } = await setup()
    state().customers.push({ tenantId, id: 'existing', name: 'Acme Customer' })
    const result = await validateFinanceCounterpartyImport(prisma, tenantId, projectId, 'FINANCE_CUSTOMERS', [
      { sourceId: 'dup', name: 'New Customer', email: 'bad-email' },
      { sourceId: 'dup', name: 'Acme Customer', email: '' },
    ])
    expect(result.validRows).toBe(0)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowNumber: 2, field: 'sourceId' }),
      expect.objectContaining({ rowNumber: 3, field: 'sourceId' }),
      expect.objectContaining({ rowNumber: 2, field: 'email' }),
      expect.objectContaining({ rowNumber: 3, field: 'name' }),
    ]))
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(state().jobs).toHaveLength(0)
  })

  it('requires Finance scope and preserves the boundary between customer and vendor masters', async () => {
    const { prisma, state } = await setup()
    state().projects[0].modules = ['INVENTORY']
    await expect(importFinanceCounterparties(prisma, tenantId, projectId, 'FINANCE_VENDORS', [{ sourceId: 'legacy-vendor-1', name: 'Industrial Supply Co.' }], actorId)).rejects.toMatchObject({ statusCode: 409 })
    expect(state().customers).toHaveLength(0)
    expect(state().vendors).toHaveLength(0)
  })
})
