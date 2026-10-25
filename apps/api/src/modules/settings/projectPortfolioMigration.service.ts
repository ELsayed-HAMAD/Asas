import { createHash } from 'node:crypto'
import { Prisma, type DataMigrationEntity, type PrismaClient } from '@prisma/client'
import { Money, type CurrencyCode } from '@asas/domain'
import { ProjectStatusValues, type ProjectPortfolioImportRow } from '@asas/contracts'
import { recordAuditLog } from '../../services/auditLog.js'
import { AppError } from '../../utils/errors.js'

type Reader = Pick<PrismaClient, 'dataMigrationProject' | 'dataMigrationImportJob' | 'dataMigrationRecordLink' | 'tenant'>
  & Pick<PrismaClient, 'project'>
type ProjectRow = { sourceId: string; name: string; status: string; budget: string | null; currency: string | null; timeline: string | null; sourceCreatedAt: string | null }
type Issue = { rowNumber: number; field: string; message: string }

function normalize(input: ProjectPortfolioImportRow[]): ProjectRow[] {
  return input.map(row => ({
    sourceId: row.sourceId.trim(), name: row.name.trim(), status: row.status.trim().toUpperCase(),
    budget: row.budget?.trim() || null, currency: row.currency?.trim().toUpperCase() || null,
    timeline: row.timeline?.trim() || null, sourceCreatedAt: row.sourceCreatedAt?.trim() || null,
  }))
}

function contentHash(rows: ProjectRow[]) {
  return createHash('sha256').update(JSON.stringify([...rows].sort((a, b) => a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0))).digest('hex')
}

async function getProject(reader: Reader, tenantId: string, projectId: string) {
  const project = await reader.dataMigrationProject.findFirst({ where: { id: projectId, tenantId }, select: { id: true, status: true, modules: true } })
  if (!project) throw new AppError(404, 'Migration project not found')
  return project
}

function assertProject(project: { modules: string[]; status: string }) {
  if (!project.modules.includes('PROJECTS')) throw new AppError(409, 'Add Projects to this migration project before importing projects')
  if (!['PLANNING', 'IN_PROGRESS'].includes(project.status)) throw new AppError(409, 'This migration project is not accepting imports')
}

async function findJob(reader: Reader, tenantId: string, projectId: string, hash: string) {
  return reader.dataMigrationImportJob.findUnique({ where: { tenantId_projectId_entity_idempotencyKey: { tenantId, projectId, entity: 'PROJECTS_PROJECTS', idempotencyKey: hash } } })
}

function validDate(value: string | null) {
  if (!value) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function validatePrimitive(row: ProjectRow, rowNumber: number, workspaceCurrency: string, issues: Issue[]) {
  const add = (field: string, message: string) => issues.push({ rowNumber, field, message })
  if (!row.sourceId) add('sourceId', 'A stable source record ID is required for safe retries and record linking.')
  else if (row.sourceId.length > 120) add('sourceId', 'Source IDs must be 120 characters or fewer.')
  if (row.name.length < 2 || row.name.length > 200) add('name', 'Project names must contain 2 to 200 characters.')
  if (!ProjectStatusValues.includes(row.status as typeof ProjectStatusValues[number])) add('status', `Status must be one of ${ProjectStatusValues.join(', ')}.`)
  if (row.budget !== null) {
    if (!/^(?:\d{1,15})(?:\.\d{1,4})?$/.test(row.budget)) add('budget', 'Budget must be a non-negative decimal with at most 4 decimal places.')
    else if (!row.currency) add('currency', 'Select the source budget currency explicitly.')
    else if (row.currency !== workspaceCurrency) add('currency', `Source budget currency must equal the workspace currency (${workspaceCurrency}); convert it before import.`)
    else {
      try { Money.fromDecimal(row.budget, workspaceCurrency as CurrencyCode) }
      catch { add('budget', `Budget must be an exact amount in ${workspaceCurrency}.`) }
    }
  } else if (row.currency && row.currency !== workspaceCurrency) add('currency', `Source currency must equal the workspace currency (${workspaceCurrency}).`)
  if (!validDate(row.timeline)) add('timeline', 'Timeline must be a valid YYYY-MM-DD calendar date.')
  if (!validDate(row.sourceCreatedAt)) add('sourceCreatedAt', 'Source creation date must be a valid YYYY-MM-DD calendar date.')
}

async function validateRows(reader: Reader, tenantId: string, projectId: string, rows: ProjectRow[], hash: string) {
  const project = await getProject(reader, tenantId, projectId)
  if (await findJob(reader, tenantId, projectId, hash)) return { totalRows: rows.length, validRows: rows.length, alreadyImported: true, issues: [] as Issue[] }
  assertProject(project)
  const tenant = await reader.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')
  const issues: Issue[] = []
  const sourceIds = new Map<string, number>()
  rows.forEach((row, index) => {
    const rowNumber = index + 2
    validatePrimitive(row, rowNumber, tenant.currency, issues)
    if (row.sourceId) {
      const previous = sourceIds.get(row.sourceId)
      if (previous) {
        issues.push({ rowNumber: previous, field: 'sourceId', message: `Source ID appears again on row ${rowNumber}.` })
        issues.push({ rowNumber, field: 'sourceId', message: `Source ID was already used on row ${previous}.` })
      } else sourceIds.set(row.sourceId, rowNumber)
    }
  })
  const ids = [...new Set(rows.map(row => row.sourceId).filter(Boolean))]
  if (ids.length) {
    const links = await reader.dataMigrationRecordLink.findMany({ where: { tenantId, projectId, sourceEntity: 'PROJECTS_PROJECTS', sourceId: { in: ids } }, select: { sourceId: true } })
    const linkedIds = new Set(links.map(link => link.sourceId))
    rows.forEach((row, index) => { if (row.sourceId && linkedIds.has(row.sourceId)) issues.push({ rowNumber: index + 2, field: 'sourceId', message: 'This project source ID is already linked in the migration project.' }) })
  }
  return { totalRows: rows.length, validRows: rows.length - new Set(issues.map(issue => issue.rowNumber)).size, alreadyImported: false, issues }
}

function toJob(job: { id: string; entity: DataMigrationEntity; status: 'COMPLETED'; totalRows: number; importedRows: number; createdAt: Date; completedAt: Date }) {
  return { id: job.id, entity: job.entity, status: job.status, totalRows: job.totalRows, importedRows: job.importedRows, createdAt: job.createdAt.toISOString(), completedAt: job.completedAt.toISOString() }
}

export async function validateProjectPortfolioImport(prisma: PrismaClient, tenantId: string, migrationProjectId: string, input: ProjectPortfolioImportRow[]) {
  const rows = normalize(input)
  return validateRows(prisma, tenantId, migrationProjectId, rows, contentHash(rows))
}

export async function importProjectPortfolio(prisma: PrismaClient, tenantId: string, migrationProjectId: string, input: ProjectPortfolioImportRow[], actorId: string) {
  const rows = normalize(input)
  const hash = contentHash(rows)
  const where = { tenantId_projectId_entity_idempotencyKey: { tenantId, projectId: migrationProjectId, entity: 'PROJECTS_PROJECTS' as const, idempotencyKey: hash } }
  try {
    return await prisma.$transaction(async tx => {
      const migrationProject = await getProject(tx, tenantId, migrationProjectId)
      const prior = await tx.dataMigrationImportJob.findUnique({ where })
      if (prior) return { imported: prior.importedRows, replayed: true, job: toJob(prior) }
      assertProject(migrationProject)
      const validation = await validateRows(tx, tenantId, migrationProjectId, rows, hash)
      if (validation.issues.length) throw new AppError(409, 'Resolve project portfolio import issues before committing', validation.issues)
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { currency: true } })
      const job = await tx.dataMigrationImportJob.create({ data: { tenantId, projectId: migrationProjectId, entity: 'PROJECTS_PROJECTS', status: 'COMPLETED', idempotencyKey: hash, requestHash: hash, totalRows: rows.length, importedRows: rows.length, createdBy: actorId } })
      for (const row of rows) {
        const record = await tx.project.create({ data: {
          tenantId, currency: tenant.currency, name: row.name, status: row.status as typeof ProjectStatusValues[number],
          budget: row.budget === null ? null : new Prisma.Decimal(Money.fromDecimal(row.budget, tenant.currency as CurrencyCode).toDecimalString()),
          spent: new Prisma.Decimal(0), timeline: row.timeline ? new Date(`${row.timeline}T00:00:00.000Z`) : null,
          ...(row.sourceCreatedAt ? { createdAt: new Date(`${row.sourceCreatedAt}T00:00:00.000Z`) } : {}),
        } })
        await tx.dataMigrationRecordLink.create({ data: { tenantId, projectId: migrationProjectId, importJobId: job.id, sourceEntity: 'PROJECTS_PROJECTS', sourceId: row.sourceId, targetEntity: 'PROJECTS_PROJECTS', targetId: record.id } })
      }
      await tx.dataMigrationProject.update({ where: { id: migrationProject.id }, data: { status: 'IN_PROGRESS' } })
      await recordAuditLog(tx, { tenantId, actorId, action: 'dataMigration.projectPortfolio.import', targetType: 'DataMigrationImportJob', targetId: job.id, metadata: { migrationProjectId, imported: rows.length, requestHash: hash } })
      return { imported: rows.length, replayed: false, job: toJob(job) }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const prior = await prisma.dataMigrationImportJob.findUnique({ where })
      if (prior?.requestHash === hash) return { imported: prior.importedRows, replayed: true, job: toJob(prior) }
      throw new AppError(409, 'A project source ID was imported concurrently. Validate again before retrying.')
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new AppError(409, 'Another migration batch changed this project during import. Validate again and retry.')
    throw error
  }
}
