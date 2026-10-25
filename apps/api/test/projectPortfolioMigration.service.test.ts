import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { importProjectPortfolio, validateProjectPortfolioImport } from '../src/modules/settings/projectPortfolioMigration.service.js'

const tenantId = 'tenant_1'
const migrationProjectId = 'c00000000000000000000001'
const actorId = 'user_1'
const rows = [
  { sourceId: 'legacy-project-1', name: 'Warehouse modernization', status: 'ON_TRACK', budget: '250000.00', currency: 'USD', timeline: '2027-03-31', sourceCreatedAt: '2025-01-15' },
  { sourceId: 'legacy-project-2', name: 'Regional expansion', status: 'PLANNING', budget: '', currency: '' },
]

async function setup() {
  let state: any = {
    migrationProjects: [{ id: migrationProjectId, tenantId, status: 'PLANNING', modules: ['PROJECTS'] }],
    projects: [], jobs: [], links: [], audits: [],
  }
  const delegate = () => ({
    dataMigrationProject: {
      findFirst: vi.fn(async ({ where }: any) => state.migrationProjects.find((project: any) => project.id === where.id && project.tenantId === where.tenantId) ?? null),
      update: vi.fn(async ({ where, data }: any) => Object.assign(state.migrationProjects.find((project: any) => project.id === where.id), data)),
    },
    dataMigrationImportJob: {
      findUnique: vi.fn(async ({ where }: any) => { const key = where.tenantId_projectId_entity_idempotencyKey; return state.jobs.find((job: any) => job.tenantId === key.tenantId && job.projectId === key.projectId && job.entity === key.entity && job.idempotencyKey === key.idempotencyKey) ?? null }),
      create: vi.fn(async ({ data }: any) => { const now = new Date('2026-10-24T12:00:00.000Z'); const job = { id: `job-${state.jobs.length + 1}`, createdAt: now, completedAt: now, ...data }; state.jobs.push(job); return job }),
    },
    dataMigrationRecordLink: {
      findMany: vi.fn(async ({ where }: any) => state.links.filter((link: any) => link.tenantId === where.tenantId && link.projectId === where.projectId && link.sourceEntity === where.sourceEntity && where.sourceId.in.includes(link.sourceId))),
      create: vi.fn(async ({ data }: any) => { const link = { id: `link-${state.links.length + 1}`, ...data }; state.links.push(link); return link }),
    },
    tenant: { findUnique: vi.fn(async () => ({ currency: 'USD' })), findUniqueOrThrow: vi.fn(async () => ({ currency: 'USD' })) },
    project: { create: vi.fn(async ({ data }: any) => { const project = { id: `project-${state.projects.length + 1}`, ...data }; state.projects.push(project); return project }) },
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

describe('Project portfolio migration', () => {
  it('validates project status, workspace currency, and dates without writing', async () => {
    const { prisma, state } = await setup()
    const result = await validateProjectPortfolioImport(prisma, tenantId, migrationProjectId, [
      { ...rows[0], sourceId: '', status: 'ACTIVE', currency: 'EUR' },
      { ...rows[1], sourceId: 'second', timeline: '2026-02-30' },
    ])
    expect(result.validRows).toBe(0)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowNumber: 2, field: 'sourceId' }),
      expect.objectContaining({ rowNumber: 2, field: 'status' }),
      expect.objectContaining({ rowNumber: 2, field: 'currency' }),
      expect.objectContaining({ rowNumber: 3, field: 'timeline' }),
    ]))
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(state().projects).toHaveLength(0)
  })

  it('imports budgets in workspace currency, preserves source dates and status, and safely replays', async () => {
    const { prisma, state } = await setup()
    const first = await importProjectPortfolio(prisma, tenantId, migrationProjectId, rows, actorId)
    const replay = await importProjectPortfolio(prisma, tenantId, migrationProjectId, rows, actorId)
    expect(first).toMatchObject({ imported: 2, replayed: false, job: { entity: 'PROJECTS_PROJECTS' } })
    expect(replay).toMatchObject({ imported: 2, replayed: true, job: { id: first.job.id } })
    expect(state().projects).toHaveLength(2)
    expect(state().projects[0]).toMatchObject({ name: 'Warehouse modernization', status: 'ON_TRACK' })
    expect(state().projects[0].spent.toString()).toBe('0')
    expect(state().projects[0].budget.toString()).toBe('250000')
    expect(state().projects[0].createdAt).toEqual(new Date('2025-01-15T00:00:00.000Z'))
    expect(state().projects[1].budget).toBeNull()
    expect(state().links).toHaveLength(2)
    expect(state().jobs).toHaveLength(1)
    expect(state().audits).toHaveLength(1)
  })

  it('rejects a project source ID already linked and a project scope mismatch', async () => {
    const { prisma, state } = await setup()
    await importProjectPortfolio(prisma, tenantId, migrationProjectId, [rows[0]], actorId)
    const repeated = await validateProjectPortfolioImport(prisma, tenantId, migrationProjectId, [{ ...rows[0], name: 'Renamed project' }])
    expect(repeated.alreadyImported).toBe(false)
    expect(repeated.issues).toContainEqual(expect.objectContaining({ rowNumber: 2, field: 'sourceId' }))
    state().migrationProjects[0].modules = ['FINANCE']
    await expect(importProjectPortfolio(prisma, tenantId, migrationProjectId, [rows[1]], actorId)).rejects.toMatchObject({ statusCode: 409 })
  })
})
