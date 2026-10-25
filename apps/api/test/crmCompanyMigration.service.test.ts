import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { importCrmCompanies, validateCrmCompanyImport } from '../src/modules/settings/crmCompanyMigration.service.js'

const tenantId = 'tenant_1'
const projectId = 'c00000000000000000000001'
const actorId = 'user_1'

async function setup() {
  let state: any = {
    projects: [{ id: projectId, tenantId, status: 'PLANNING', modules: ['CRM'] }],
    companies: [],
    jobs: [],
    links: [],
    audits: [],
  }
  const delegate = () => ({
    dataMigrationProject: {
      findFirst: vi.fn(async ({ where }: any) => state.projects.find((project: any) => project.id === where.id && project.tenantId === where.tenantId) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const project = state.projects.find((item: any) => item.id === where.id)
        Object.assign(project, data)
        return project
      }),
    },
    dataMigrationImportJob: {
      findUnique: vi.fn(async ({ where }: any) => state.jobs.find((job: any) => {
        const key = where.tenantId_projectId_entity_idempotencyKey
        return job.tenantId === key.tenantId && job.projectId === key.projectId && job.entity === key.entity && job.idempotencyKey === key.idempotencyKey
      }) ?? null),
      create: vi.fn(async ({ data }: any) => {
        const now = new Date('2026-10-23T10:00:00.000Z')
        const job = { id: `c${String(state.jobs.length + 2).padStart(23, '0')}`, status: 'COMPLETED', createdAt: now, completedAt: now, ...data }
        state.jobs.push(job)
        return job
      }),
    },
    dataMigrationRecordLink: {
      findMany: vi.fn(async ({ where }: any) => state.links.filter((link: any) => link.tenantId === where.tenantId && link.projectId === where.projectId && link.sourceEntity === where.sourceEntity && where.sourceId.in.includes(link.sourceId))),
      create: vi.fn(async ({ data }: any) => {
        const link = { id: `clink${state.links.length + 1}`, createdAt: new Date('2026-10-23T10:00:00.000Z'), ...data }
        state.links.push(link)
        return link
      }),
    },
    company: {
      create: vi.fn(async ({ data }: any) => {
        const company = { id: `ccompany${state.companies.length + 1}`, ...data }
        state.companies.push(company)
        return company
      }),
    },
    auditLog: { create: vi.fn(async ({ data }: any) => { state.audits.push(data); return {} }) },
  })
  const prismaModel = delegate()
  const txModel = delegate()
  const prisma = {
    ...prismaModel,
    $transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>, options: unknown) => {
      const before = structuredClone(state)
      try {
        return await callback(txModel)
      } catch (error) {
        state = before
        throw error
      }
    }),
  } as unknown as PrismaClient
  return { prisma, state: () => state, txModel }
}

const rows = [
  { sourceId: 'erp-company-01', name: 'Northstar Manufacturing', tier: 'Enterprise' },
  { sourceId: 'erp-company-02', name: 'Harbor Logistics' },
]

describe('CRM company migration', () => {
  it('validates source IDs and row data without writing anything', async () => {
    const { prisma, state } = await setup()
    const result = await validateCrmCompanyImport(prisma, tenantId, projectId, [
      { sourceId: 'duplicate', name: 'First Company' },
      { sourceId: 'duplicate', name: 'Second Company' },
      { sourceId: '', name: 'X' },
    ])

    expect(result).toMatchObject({ totalRows: 3, validRows: 0, alreadyImported: false })
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowNumber: 2, field: 'sourceId' }),
      expect.objectContaining({ rowNumber: 3, field: 'sourceId' }),
      expect.objectContaining({ rowNumber: 4, field: 'name' }),
    ]))
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(state().companies).toHaveLength(0)
    expect(state().links).toHaveLength(0)
  })

  it('commits companies and stable source crosswalks atomically and safely replays the same batch', async () => {
    const { prisma, state, txModel } = await setup()
    const first = await importCrmCompanies(prisma, tenantId, projectId, rows, actorId)
    expect(state().projects[0].status).toBe('IN_PROGRESS')
    state().projects[0].status = 'COMPLETED'
    const replayValidation = await validateCrmCompanyImport(prisma, tenantId, projectId, rows)
    const replay = await importCrmCompanies(prisma, tenantId, projectId, rows, actorId)

    expect(first.imported).toBe(2)
    expect(first.replayed).toBe(false)
    expect(first.job.entity).toBe('CRM_COMPANIES')
    expect(replayValidation).toMatchObject({ totalRows: 2, validRows: 2, alreadyImported: true, issues: [] })
    expect(replay).toMatchObject({ imported: 2, replayed: true, job: { id: first.job.id } })
    expect(state().companies).toHaveLength(2)
    expect(state().links).toMatchObject([
      { sourceEntity: 'CRM_COMPANIES', sourceId: 'erp-company-01', targetEntity: 'CRM_COMPANIES', targetId: state().companies[0].id },
      { sourceEntity: 'CRM_COMPANIES', sourceId: 'erp-company-02', targetEntity: 'CRM_COMPANIES', targetId: state().companies[1].id },
    ])
    expect(state().jobs).toHaveLength(1)
    expect(state().projects[0].status).toBe('COMPLETED')
    expect(state().audits).toHaveLength(1)
    expect(txModel.dataMigrationImportJob.create).toHaveBeenCalledOnce()
  })

  it('rejects source IDs already linked by a prior batch instead of silently duplicating or updating', async () => {
    const { prisma, state } = await setup()
    await importCrmCompanies(prisma, tenantId, projectId, rows, actorId)
    const validation = await validateCrmCompanyImport(prisma, tenantId, projectId, [{ sourceId: 'erp-company-01', name: 'Renamed Company' }])

    expect(validation.validRows).toBe(0)
    expect(validation.issues[0]).toMatchObject({ rowNumber: 2, field: 'sourceId' })
    await expect(importCrmCompanies(prisma, tenantId, projectId, [{ sourceId: 'erp-company-01', name: 'Renamed Company' }], actorId))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(state().companies).toHaveLength(2)
    expect(state().jobs).toHaveLength(1)
  })

  it('rejects foreign projects and projects without CRM in scope', async () => {
    const { prisma, state } = await setup()
    await expect(validateCrmCompanyImport(prisma, tenantId, 'c00000000000000000000002', rows)).rejects.toMatchObject({ statusCode: 404 })
    state().projects[0].modules = ['HR']
    await expect(importCrmCompanies(prisma, tenantId, projectId, rows, actorId)).rejects.toMatchObject({ statusCode: 409 })
    expect(state().companies).toHaveLength(0)
  })
})
