import { createHash } from 'node:crypto'
import { Prisma, type DataMigrationEntity, type PrismaClient } from '@prisma/client'
import type { FinanceCustomerImportRow, FinanceVendorImportRow } from '@asas/contracts'
import { recordAuditLog } from '../../services/auditLog.js'
import { AppError } from '../../utils/errors.js'

type Entity = 'FINANCE_CUSTOMERS' | 'FINANCE_VENDORS'
type InputRow = FinanceCustomerImportRow | FinanceVendorImportRow
type Row = { sourceId: string; name: string; email: string | null }
type Issue = { rowNumber: number; field: string; message: string }
type Reader = Pick<PrismaClient, 'dataMigrationProject' | 'dataMigrationImportJob' | 'dataMigrationRecordLink' | 'customer' | 'vendor'>

function normalize(rows: InputRow[]): Row[] {
  return rows.map(row => ({ sourceId: row.sourceId.trim(), name: row.name.trim(), email: 'email' in row ? row.email?.trim().toLowerCase() || null : null }))
}

function batchHash(entity: Entity, rows: Row[]) {
  const sorted = [...rows].sort((a, b) => a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0)
  return createHash('sha256').update(JSON.stringify({ entity, rows: sorted })).digest('hex')
}

async function getProject(reader: Reader, tenantId: string, projectId: string) {
  const project = await reader.dataMigrationProject.findFirst({ where: { id: projectId, tenantId }, select: { id: true, status: true, modules: true } })
  if (!project) throw new AppError(404, 'Migration project not found')
  return project
}

function assertProject(project: { modules: string[]; status: string }) {
  if (!project.modules.includes('FINANCE')) throw new AppError(409, 'Add Finance to this migration project before importing counterparties')
  if (!['PLANNING', 'IN_PROGRESS'].includes(project.status)) throw new AppError(409, 'This migration project is not accepting imports')
}

async function findJob(reader: Reader, tenantId: string, projectId: string, entity: Entity, hash: string) {
  return reader.dataMigrationImportJob.findUnique({ where: { tenantId_projectId_entity_idempotencyKey: { tenantId, projectId, entity, idempotencyKey: hash } } })
}

async function validateRows(reader: Reader, tenantId: string, projectId: string, entity: Entity, rows: Row[], hash: string) {
  const project = await getProject(reader, tenantId, projectId)
  if (await findJob(reader, tenantId, projectId, entity, hash)) return { totalRows: rows.length, validRows: rows.length, alreadyImported: true, issues: [] as Issue[] }
  assertProject(project)
  const issues: Issue[] = []
  const sourceIds = new Map<string, number>()
  const names = new Map<string, number>()
  rows.forEach((row, index) => {
    const rowNumber = index + 2
    if (!row.sourceId) issues.push({ rowNumber, field: 'sourceId', message: 'A stable source record ID is required for safe retries and record linking.' })
    else if (row.sourceId.length > 120) issues.push({ rowNumber, field: 'sourceId', message: 'Source IDs must be 120 characters or fewer.' })
    if (row.name.length < 2 || row.name.length > 200) issues.push({ rowNumber, field: 'name', message: 'Names must contain 2 to 200 characters.' })
    if (entity === 'FINANCE_CUSTOMERS' && row.email && (row.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))) issues.push({ rowNumber, field: 'email', message: 'Enter a valid customer email or leave it blank.' })
    if (row.sourceId) {
      const previous = sourceIds.get(row.sourceId)
      if (previous) {
        issues.push({ rowNumber: previous, field: 'sourceId', message: `Source record ID appears again on row ${rowNumber}.` })
        issues.push({ rowNumber, field: 'sourceId', message: `Source record ID was already used on row ${previous}.` })
      } else sourceIds.set(row.sourceId, rowNumber)
    }
    if (row.name) {
      const key = row.name.toLocaleLowerCase('en-US')
      const previous = names.get(key)
      if (previous) {
        issues.push({ rowNumber: previous, field: 'name', message: `Name appears again on row ${rowNumber}; review possible duplicates.` })
        issues.push({ rowNumber, field: 'name', message: `Name was already used on row ${previous}; review possible duplicates.` })
      } else names.set(key, rowNumber)
    }
  })
  const ids = [...new Set(rows.map(row => row.sourceId).filter(Boolean))]
  if (ids.length) {
    const linked = await reader.dataMigrationRecordLink.findMany({ where: { tenantId, projectId, sourceEntity: entity, sourceId: { in: ids } }, select: { sourceId: true } })
    const linkedIds = new Set(linked.map(link => link.sourceId))
    rows.forEach((row, index) => { if (row.sourceId && linkedIds.has(row.sourceId)) issues.push({ rowNumber: index + 2, field: 'sourceId', message: 'This source ID is already linked in this migration project.' }) })
  }
  const uniqueNames = [...new Set(rows.map(row => row.name).filter(Boolean))]
  if (uniqueNames.length) {
    const existing = entity === 'FINANCE_CUSTOMERS'
      ? await reader.customer.findMany({ where: { tenantId, name: { in: uniqueNames, mode: 'insensitive' } }, select: { name: true } })
      : await reader.vendor.findMany({ where: { tenantId, name: { in: uniqueNames, mode: 'insensitive' } }, select: { name: true } })
    const existingNames = new Set(existing.map(record => record.name.toLocaleLowerCase('en-US')))
    rows.forEach((row, index) => { if (row.name && existingNames.has(row.name.toLocaleLowerCase('en-US'))) issues.push({ rowNumber: index + 2, field: 'name', message: 'This name already exists in the Finance workspace. Existing records are not overwritten.' }) })
  }
  return { totalRows: rows.length, validRows: rows.length - new Set(issues.map(issue => issue.rowNumber)).size, alreadyImported: false, issues }
}

function toJob(job: { id: string; entity: DataMigrationEntity; status: 'COMPLETED'; totalRows: number; importedRows: number; createdAt: Date; completedAt: Date }) {
  return { id: job.id, entity: job.entity, status: job.status, totalRows: job.totalRows, importedRows: job.importedRows, createdAt: job.createdAt.toISOString(), completedAt: job.completedAt.toISOString() }
}

export async function validateFinanceCounterpartyImport(prisma: PrismaClient, tenantId: string, projectId: string, entity: Entity, input: InputRow[]) {
  const rows = normalize(input)
  return validateRows(prisma, tenantId, projectId, entity, rows, batchHash(entity, rows))
}

export async function importFinanceCounterparties(prisma: PrismaClient, tenantId: string, projectId: string, entity: Entity, input: InputRow[], actorId: string) {
  const rows = normalize(input)
  const hash = batchHash(entity, rows)
  const uniqueWhere = { tenantId_projectId_entity_idempotencyKey: { tenantId, projectId, entity, idempotencyKey: hash } }
  try {
    return await prisma.$transaction(async tx => {
      const project = await getProject(tx, tenantId, projectId)
      const prior = await tx.dataMigrationImportJob.findUnique({ where: uniqueWhere })
      if (prior) return { imported: prior.importedRows, replayed: true, job: toJob(prior) }
      assertProject(project)
      const validation = await validateRows(tx, tenantId, projectId, entity, rows, hash)
      if (validation.issues.length) throw new AppError(409, 'Resolve the Finance master-data import issues before committing', validation.issues)
      const job = await tx.dataMigrationImportJob.create({ data: { tenantId, projectId, entity, status: 'COMPLETED', idempotencyKey: hash, requestHash: hash, totalRows: rows.length, importedRows: rows.length, createdBy: actorId } })
      for (const row of rows) {
        const target = entity === 'FINANCE_CUSTOMERS'
          ? await tx.customer.create({ data: { tenantId, name: row.name, email: row.email } })
          : await tx.vendor.create({ data: { tenantId, name: row.name } })
        await tx.dataMigrationRecordLink.create({ data: { tenantId, projectId, importJobId: job.id, sourceEntity: entity, sourceId: row.sourceId, targetEntity: entity, targetId: target.id } })
      }
      await tx.dataMigrationProject.update({ where: { id: project.id }, data: { status: 'IN_PROGRESS' } })
      await recordAuditLog(tx, { tenantId, actorId, action: `dataMigration.${entity === 'FINANCE_CUSTOMERS' ? 'financeCustomers' : 'financeVendors'}.import`, targetType: 'DataMigrationImportJob', targetId: job.id, metadata: { projectId, imported: rows.length, requestHash: hash } })
      return { imported: rows.length, replayed: false, job: toJob(job) }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const prior = await prisma.dataMigrationImportJob.findUnique({ where: uniqueWhere })
      if (prior?.requestHash === hash) return { imported: prior.importedRows, replayed: true, job: toJob(prior) }
      throw new AppError(409, 'A Finance counterparty source record was imported concurrently. Validate again before retrying.')
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new AppError(409, 'Another migration batch changed this project during import. Validate again and retry.')
    throw error
  }
}
