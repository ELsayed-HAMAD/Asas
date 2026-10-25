import { createHash } from 'node:crypto'
import { Prisma, type DataMigrationEntity, type PrismaClient } from '@prisma/client'
import type { CrmCompanyImportRow } from '@asas/contracts'
import { recordAuditLog } from '../../services/auditLog.js'
import { AppError } from '../../utils/errors.js'

type MigrationReader = Pick<PrismaClient, 'dataMigrationProject' | 'dataMigrationImportJob' | 'dataMigrationRecordLink'>
type NormalizedCompany = { sourceId: string; name: string; tier: string | null }

function normalizeRows(rows: CrmCompanyImportRow[]): NormalizedCompany[] {
  return rows.map(row => ({ sourceId: row.sourceId.trim(), name: row.name.trim(), tier: row.tier?.trim() || null }))
}

function hashRows(rows: NormalizedCompany[]): string {
  const canonical = [...rows].sort((a, b) => a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0)
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

async function getProject(reader: MigrationReader, tenantId: string, projectId: string) {
  const project = await reader.dataMigrationProject.findFirst({
    where: { id: projectId, tenantId },
    select: { id: true, status: true, modules: true },
  })
  if (!project) throw new AppError(404, 'Migration project not found')
  return project
}

function assertProjectAcceptsImport(project: { modules: string[]; status: string }) {
  if (!project.modules.includes('CRM')) throw new AppError(409, 'Add CRM to this migration project before importing companies')
  if (project.status !== 'PLANNING' && project.status !== 'IN_PROGRESS') throw new AppError(409, 'This migration project is not accepting imports')
}

async function findReplay(reader: MigrationReader, tenantId: string, projectId: string, requestHash: string) {
  const job = await reader.dataMigrationImportJob.findUnique({
    where: { tenantId_projectId_entity_idempotencyKey: {
      tenantId,
      projectId,
      entity: 'CRM_COMPANIES',
      idempotencyKey: requestHash,
    } },
  })
  if (job && job.requestHash !== requestHash) throw new AppError(409, 'The import retry key was already used with different data')
  return job
}

async function validateRows(
  reader: MigrationReader,
  tenantId: string,
  projectId: string,
  rows: NormalizedCompany[],
  requestHash: string,
) {
  const project = await getProject(reader, tenantId, projectId)
  const replay = await findReplay(reader, tenantId, projectId, requestHash)
  if (replay) return { totalRows: rows.length, validRows: rows.length, alreadyImported: true, issues: [] as { rowNumber: number; field: string; message: string }[] }
  assertProjectAcceptsImport(project)

  const issues: { rowNumber: number; field: string; message: string }[] = []
  const invalidRows = new Set<number>()
  const firstSeenIds = new Map<string, number>()
  const sourceIds: string[] = []

  rows.forEach((row, index) => {
    const rowNumber = index + 2
    if (!row.sourceId) {
      issues.push({ rowNumber, field: 'sourceId', message: 'A stable source record ID is required to link future imports.' })
      invalidRows.add(rowNumber)
    } else if (row.sourceId.length > 120) {
      issues.push({ rowNumber, field: 'sourceId', message: 'Source record IDs must be 120 characters or fewer.' })
      invalidRows.add(rowNumber)
    } else {
      sourceIds.push(row.sourceId)
      const previousRow = firstSeenIds.get(row.sourceId)
      if (previousRow) {
        issues.push({ rowNumber: previousRow, field: 'sourceId', message: `Source record ID is duplicated again on row ${rowNumber}.` })
        issues.push({ rowNumber, field: 'sourceId', message: `Source record ID was already used on row ${previousRow}.` })
        invalidRows.add(previousRow)
        invalidRows.add(rowNumber)
      } else {
        firstSeenIds.set(row.sourceId, rowNumber)
      }
    }
    if (row.name.length < 2) {
      issues.push({ rowNumber, field: 'name', message: 'Company name must contain at least 2 characters.' })
      invalidRows.add(rowNumber)
    } else if (row.name.length > 200) {
      issues.push({ rowNumber, field: 'name', message: 'Company names must be 200 characters or fewer.' })
      invalidRows.add(rowNumber)
    }
    if (row.tier && row.tier.length > 80) {
      issues.push({ rowNumber, field: 'tier', message: 'Company tiers must be 80 characters or fewer.' })
      invalidRows.add(rowNumber)
    }
  })

  const uniqueSourceIds = [...new Set(sourceIds)]
  if (uniqueSourceIds.length) {
    const existingLinks = await reader.dataMigrationRecordLink.findMany({
      where: { tenantId, projectId, sourceEntity: 'CRM_COMPANIES', sourceId: { in: uniqueSourceIds } },
      select: { sourceId: true },
    })
    const alreadyImported = new Set(existingLinks.map(link => link.sourceId))
    rows.forEach((row, index) => {
      if (!row.sourceId || !alreadyImported.has(row.sourceId)) return
      const rowNumber = index + 2
      issues.push({ rowNumber, field: 'sourceId', message: 'This source record is already linked to an Asas company in this migration project.' })
      invalidRows.add(rowNumber)
    })
  }

  return { totalRows: rows.length, validRows: rows.length - invalidRows.size, alreadyImported: false, issues }
}

function toJobDto(job: {
  id: string
  entity: DataMigrationEntity
  status: 'COMPLETED'
  totalRows: number
  importedRows: number
  createdAt: Date
  completedAt: Date
}) {
  return {
    id: job.id,
    entity: job.entity,
    status: job.status,
    totalRows: job.totalRows,
    importedRows: job.importedRows,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt.toISOString(),
  }
}

export async function validateCrmCompanyImport(
  prisma: PrismaClient,
  tenantId: string,
  projectId: string,
  rows: CrmCompanyImportRow[],
) {
  const normalized = normalizeRows(rows)
  return validateRows(prisma, tenantId, projectId, normalized, hashRows(normalized))
}

export async function importCrmCompanies(
  prisma: PrismaClient,
  tenantId: string,
  projectId: string,
  rows: CrmCompanyImportRow[],
  actorId: string,
) {
  const normalized = normalizeRows(rows)
  const requestHash = hashRows(normalized)
  const uniqueWhere = {
    tenantId_projectId_entity_idempotencyKey: {
      tenantId,
      projectId,
      entity: 'CRM_COMPANIES' as const,
      idempotencyKey: requestHash,
    },
  }

  const run = () => prisma.$transaction(async tx => {
    const project = await getProject(tx, tenantId, projectId)
    const prior = await tx.dataMigrationImportJob.findUnique({ where: uniqueWhere })
    if (prior) {
      if (prior.requestHash !== requestHash) throw new AppError(409, 'The import retry key was already used with different data')
      return { imported: prior.importedRows, replayed: true, job: toJobDto(prior) }
    }
    assertProjectAcceptsImport(project)

    const validation = await validateRows(tx, tenantId, projectId, normalized, requestHash)
    if (validation.issues.length) throw new AppError(409, 'Resolve the company import issues before committing', validation.issues)

    const job = await tx.dataMigrationImportJob.create({
      data: {
        tenantId,
        projectId,
        entity: 'CRM_COMPANIES',
        status: 'COMPLETED',
        idempotencyKey: requestHash,
        requestHash,
        totalRows: normalized.length,
        importedRows: normalized.length,
        createdBy: actorId,
      },
    })
    for (const row of normalized) {
      const company = await tx.company.create({ data: { tenantId, name: row.name, tier: row.tier } })
      await tx.dataMigrationRecordLink.create({
        data: {
          tenantId,
          projectId,
          importJobId: job.id,
          sourceEntity: 'CRM_COMPANIES',
          sourceId: row.sourceId,
          targetEntity: 'CRM_COMPANIES',
          targetId: company.id,
        },
      })
    }
    await tx.dataMigrationProject.update({ where: { id: project.id }, data: { status: 'IN_PROGRESS' } })
    await recordAuditLog(tx, {
      tenantId,
      actorId,
      action: 'dataMigration.crmCompanies.import',
      targetType: 'DataMigrationImportJob',
      targetId: job.id,
      metadata: { projectId, imported: normalized.length, requestHash },
    })
    return { imported: normalized.length, replayed: false, job: toJobDto(job) }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 })

  try {
    return await run()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const prior = await prisma.dataMigrationImportJob.findUnique({ where: uniqueWhere })
      if (prior?.requestHash === requestHash) return { imported: prior.importedRows, replayed: true, job: toJobDto(prior) }
      throw new AppError(409, 'One or more source record IDs were imported concurrently. Reload the project and validate again.')
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      throw new AppError(409, 'Another migration batch changed this project during import. Validate again and retry.')
    }
    throw error
  }
}
