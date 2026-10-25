import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { importCrmDeals, validateCrmDealImport } from '../src/modules/settings/crmDealMigration.service.js'

const tenantId = 'tenant_1'
const projectId = 'c00000000000000000000001'
const ownerId = 'user_1'
const validDeal = { sourceId: 'legacy-deal-1', name: 'Northstar renewal', stage: 'CLOSED_WON', value: '1250.50', companySourceId: 'legacy-company-1', ownerEmail: 'rep@example.com', actualCloseDate: '2025-06-30', closeDate: '' }

async function setup() {
  let state: any = {
    projects: [{ id: projectId, tenantId, status: 'PLANNING', modules: ['CRM'] }],
    jobs: [], links: [{ id: 'company-link', tenantId, projectId, sourceEntity: 'CRM_COMPANIES', sourceId: 'legacy-company-1', targetEntity: 'CRM_COMPANIES', targetId: 'asas-company-1' }],
    employees: [{ id: 'employee-1', tenantId, email: 'rep@example.com' }],
    deals: [], histories: [], audits: [],
  }
  const delegate = () => ({
    dataMigrationProject: {
      findFirst: vi.fn(async ({ where }: any) => state.projects.find((p: any) => p.id === where.id && p.tenantId === where.tenantId) ?? null),
      update: vi.fn(async ({ where, data }: any) => Object.assign(state.projects.find((p: any) => p.id === where.id), data)),
    },
    dataMigrationImportJob: {
      findUnique: vi.fn(async ({ where }: any) => {
        const key = where.tenantId_projectId_entity_idempotencyKey
        return state.jobs.find((job: any) => job.tenantId === key.tenantId && job.projectId === key.projectId && job.entity === key.entity && job.idempotencyKey === key.idempotencyKey) ?? null
      }),
      create: vi.fn(async ({ data }: any) => { const now = new Date('2026-10-24T12:00:00.000Z'); const job = { id: 'job-1', createdAt: now, completedAt: now, ...data }; state.jobs.push(job); return job }),
    },
    dataMigrationRecordLink: {
      findMany: vi.fn(async ({ where }: any) => state.links.filter((link: any) => link.tenantId === where.tenantId && link.projectId === where.projectId && link.sourceEntity === where.sourceEntity && link.targetEntity === (where.targetEntity ?? link.targetEntity) && where.sourceId.in.includes(link.sourceId))),
      create: vi.fn(async ({ data }: any) => { const link = { id: `deal-link-${state.links.length}`, ...data }; state.links.push(link); return link }),
    },
    employee: { findMany: vi.fn(async ({ where }: any) => state.employees.filter((employee: any) => employee.tenantId === where.tenantId && where.email.in.some((email: string) => email.toLowerCase() === employee.email.toLowerCase()))) },
    tenant: { findUnique: vi.fn(async () => ({ currency: 'USD' })), findUniqueOrThrow: vi.fn(async () => ({ currency: 'USD' })) },
    deal: { create: vi.fn(async ({ data }: any) => { const deal = { id: `deal-${state.deals.length + 1}`, ...data }; state.deals.push(deal); return deal }) },
    dealStageHistory: { create: vi.fn(async ({ data }: any) => { state.histories.push(data); return data }) },
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

describe('CRM deal migration', () => {
  it('validates dependencies and business semantics without writing', async () => {
    const { prisma, state } = await setup()
    const result = await validateCrmDealImport(prisma, tenantId, projectId, [
      { ...validDeal, sourceId: '', actualCloseDate: '' },
      { ...validDeal, sourceId: 'legacy-2', companySourceId: 'missing', ownerEmail: 'missing@example.com', stage: 'CLOSED_WON', actualCloseDate: '' },
    ])
    expect(result.validRows).toBe(0)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowNumber: 2, field: 'sourceId' }),
      expect.objectContaining({ rowNumber: 2, field: 'actualCloseDate' }),
      expect.objectContaining({ rowNumber: 3, field: 'companySourceId' }),
      expect.objectContaining({ rowNumber: 3, field: 'ownerEmail' }),
    ]))
    expect(state().deals).toHaveLength(0)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('commits linked deals, actual close dates, baseline stage history, crosswalks, and audit atomically; exact retries replay', async () => {
    const { prisma, state } = await setup()
    const first = await importCrmDeals(prisma, tenantId, projectId, [validDeal], ownerId)
    const replay = await importCrmDeals(prisma, tenantId, projectId, [validDeal], ownerId)
    expect(first).toMatchObject({ imported: 1, replayed: false, job: { entity: 'CRM_DEALS' } })
    expect(replay).toMatchObject({ imported: 1, replayed: true, job: { id: first.job.id } })
    expect(state().deals).toHaveLength(1)
    expect(state().deals[0]).toMatchObject({ companyId: 'asas-company-1', ownerEmployeeId: 'employee-1', closedAt: new Date('2025-06-30T00:00:00.000Z') })
    expect(state().histories).toMatchObject([{ fromStage: null, toStage: 'CLOSED_WON', isBaseline: true, occurredAt: new Date('2025-06-30T00:00:00.000Z') }])
    expect(state().links.at(-1)).toMatchObject({ sourceEntity: 'CRM_DEALS', sourceId: 'legacy-deal-1', targetEntity: 'CRM_DEALS', targetId: 'deal-1' })
    expect(state().jobs).toHaveLength(1)
    expect(state().audits).toHaveLength(1)
  })

  it('rejects closed deals without actual close dates and missing CRM scope', async () => {
    const { prisma, state } = await setup()
    const missingDate = await validateCrmDealImport(prisma, tenantId, projectId, [{ ...validDeal, actualCloseDate: '' }])
    expect(missingDate.issues).toContainEqual(expect.objectContaining({ field: 'actualCloseDate' }))
    state().projects[0].modules = ['HR']
    await expect(importCrmDeals(prisma, tenantId, projectId, [validDeal], ownerId)).rejects.toMatchObject({ statusCode: 409 })
    expect(state().deals).toHaveLength(0)
  })
})
