import { createHash } from 'node:crypto'
import { Prisma, type DataMigrationEntity, type PrismaClient } from '@prisma/client'
import { Money } from '@asas/domain'
import { DealStageValues, type CrmDealImportRow } from '@asas/contracts'
import { recordAuditLog } from '../../services/auditLog.js'
import { AppError } from '../../utils/errors.js'

type Reader = Pick<PrismaClient, 'dataMigrationProject' | 'dataMigrationImportJob' | 'dataMigrationRecordLink' | 'employee' | 'tenant'>
type NormalizedDeal = {
  sourceId: string; name: string; stage: string; value: string; companySourceId: string | null; ownerEmail: string | null
  winProbability: string | null; closeDate: string | null; actualCloseDate: string | null; sourceCreatedAt: string | null; productLine: string | null; forecastBucket: string | null
}
type Issue = { rowNumber: number; field: string; message: string }
const CLOSED_STAGES = new Set(['CLOSED_WON', 'CLOSED_LOST'])

function normalizeRows(rows: CrmDealImportRow[]): NormalizedDeal[] {
  return rows.map(row => ({
    sourceId: row.sourceId.trim(), name: row.name.trim(), stage: row.stage.trim().toUpperCase(), value: row.value?.trim() || '0',
    companySourceId: row.companySourceId?.trim() || null, ownerEmail: row.ownerEmail?.trim().toLowerCase() || null,
    winProbability: row.winProbability?.trim() || null, closeDate: row.closeDate?.trim() || null,
    actualCloseDate: row.actualCloseDate?.trim() || null, sourceCreatedAt: row.sourceCreatedAt?.trim() || null, productLine: row.productLine?.trim() || null,
    forecastBucket: row.forecastBucket?.trim() || null,
  }))
}

function hashRows(rows: NormalizedDeal[]): string {
  return createHash('sha256').update(JSON.stringify([...rows].sort((a, b) => a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0))).digest('hex')
}

async function getProject(reader: Reader, tenantId: string, projectId: string) {
  const project = await reader.dataMigrationProject.findFirst({ where: { id: projectId, tenantId }, select: { id: true, status: true, modules: true } })
  if (!project) throw new AppError(404, 'Migration project not found')
  return project
}

function assertProject(project: { modules: string[]; status: string }) {
  if (!project.modules.includes('CRM')) throw new AppError(409, 'Add CRM to this migration project before importing deals')
  if (!['PLANNING', 'IN_PROGRESS'].includes(project.status)) throw new AppError(409, 'This migration project is not accepting imports')
}

async function findJob(reader: Reader, tenantId: string, projectId: string, hash: string) {
  return reader.dataMigrationImportJob.findUnique({ where: { tenantId_projectId_entity_idempotencyKey: {
    tenantId, projectId, entity: 'CRM_DEALS', idempotencyKey: hash,
  } } })
}

function validDate(value: string | null): boolean {
  if (!value) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function validatePrimitive(row: NormalizedDeal, rowNumber: number, currency: string, issues: Issue[]) {
  const issue = (field: string, message: string) => issues.push({ rowNumber, field, message })
  if (!row.sourceId) issue('sourceId', 'A stable source record ID is required for safe retries and record linking.')
  else if (row.sourceId.length > 120) issue('sourceId', 'Source record IDs must be 120 characters or fewer.')
  if (row.name.length < 2 || row.name.length > 200) issue('name', 'Deal names must contain 2 to 200 characters.')
  if (!DealStageValues.includes(row.stage as typeof DealStageValues[number])) issue('stage', `Stage must be one of ${DealStageValues.join(', ')}.`)
  if (!row.value || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(row.value)) issue('value', 'Enter a non-negative decimal amount; use 0 when the source value is zero.')
  else try { Money.fromDecimal(row.value, currency) } catch { issue('value', `Enter a valid amount in the workspace currency (${currency}).`) }
  if (row.winProbability !== null && (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(row.winProbability) || Number(row.winProbability) < 0 || Number(row.winProbability) > 100)) issue('winProbability', 'Win probability must be a number from 0 to 100.')
  if (!validDate(row.closeDate)) issue('closeDate', 'Expected close date must be a valid YYYY-MM-DD date.')
  if (!validDate(row.actualCloseDate)) issue('actualCloseDate', 'Actual close date must be a valid YYYY-MM-DD date.')
  if (row.sourceCreatedAt && (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(row.sourceCreatedAt) || Number.isNaN(new Date(row.sourceCreatedAt).valueOf()))) issue('sourceCreatedAt', 'Source creation date must be a valid ISO date or timestamp with timezone.')
  if (CLOSED_STAGES.has(row.stage) && !row.actualCloseDate) issue('actualCloseDate', 'Closed deals require the actual close date so they are not recorded as closing today.')
  if (!CLOSED_STAGES.has(row.stage) && row.actualCloseDate) issue('actualCloseDate', 'Only closed deals can have an actual close date.')
  if (row.productLine && row.productLine.length > 200) issue('productLine', 'Product line must be 200 characters or fewer.')
  if (row.forecastBucket && row.forecastBucket.length > 64) issue('forecastBucket', 'Forecast bucket must be 64 characters or fewer.')
  if (row.companySourceId && row.companySourceId.length > 120) issue('companySourceId', 'Company source IDs must be 120 characters or fewer.')
  if (row.ownerEmail && (row.ownerEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.ownerEmail))) issue('ownerEmail', 'Owner must be identified by a valid employee email.')
}

async function validateRows(reader: Reader, tenantId: string, projectId: string, rows: NormalizedDeal[], hash: string) {
  const project = await getProject(reader, tenantId, projectId)
  const prior = await findJob(reader, tenantId, projectId, hash)
  if (prior) return { totalRows: rows.length, validRows: rows.length, alreadyImported: true, issues: [] as Issue[] }
  assertProject(project)
  const tenant = await reader.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')
  const issues: Issue[] = []
  const seen = new Map<string, number>()
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2
    validatePrimitive(row, rowNumber, tenant.currency, issues)
    if (row.sourceId) {
      const previous = seen.get(row.sourceId)
      if (previous) {
        issues.push({ rowNumber: previous, field: 'sourceId', message: `Source record ID is duplicated again on row ${rowNumber}.` })
        issues.push({ rowNumber, field: 'sourceId', message: `Source record ID was already used on row ${previous}.` })
      } else seen.set(row.sourceId, rowNumber)
    }
  }
  const issueRows = new Set(issues.map(item => item.rowNumber))
  const ids = rows.map(row => row.sourceId).filter(Boolean)
  const links = ids.length ? await reader.dataMigrationRecordLink.findMany({
    where: { tenantId, projectId, sourceEntity: 'CRM_DEALS', sourceId: { in: [...new Set(ids)] } }, select: { sourceId: true },
  }) : []
  const linked = new Set(links.map(link => link.sourceId))
  rows.forEach((row, index) => { if (row.sourceId && linked.has(row.sourceId)) {
    issues.push({ rowNumber: index + 2, field: 'sourceId', message: 'This deal source ID is already linked in this migration project.' })
    issueRows.add(index + 2)
  } })

  const companyIds = [...new Set(rows.map(row => row.companySourceId).filter((id): id is string => Boolean(id)))]
  if (companyIds.length) {
    const companies = await reader.dataMigrationRecordLink.findMany({ where: { tenantId, projectId, sourceEntity: 'CRM_COMPANIES', targetEntity: 'CRM_COMPANIES', sourceId: { in: companyIds } }, select: { sourceId: true } })
    const known = new Set(companies.map(link => link.sourceId))
    rows.forEach((row, index) => { if (row.companySourceId && !known.has(row.companySourceId)) {
      issues.push({ rowNumber: index + 2, field: 'companySourceId', message: 'No imported CRM company has this source ID. Import and validate CRM companies first.' })
      issueRows.add(index + 2)
    } })
  }
  const ownerEmails = [...new Set(rows.map(row => row.ownerEmail).filter((email): email is string => Boolean(email)))]
  if (ownerEmails.length) {
    const employees = await reader.employee.findMany({ where: { tenantId, email: { in: ownerEmails, mode: 'insensitive' } }, select: { id: true, email: true } })
    const counts = new Map<string, number>()
    const owners = new Map<string, string>()
    for (const employee of employees) if (employee.email) {
      const email = employee.email.toLowerCase()
      counts.set(email, (counts.get(email) ?? 0) + 1)
      owners.set(email, employee.id)
    }
    rows.forEach((row, index) => { if (row.ownerEmail && counts.get(row.ownerEmail) !== 1) {
      issues.push({ rowNumber: index + 2, field: 'ownerEmail', message: counts.has(row.ownerEmail) ? 'This email matches multiple employees; resolve the duplicate before importing.' : 'No employee in this workspace has this email. Import employees first or leave the owner blank.' })
      issueRows.add(index + 2)
    } })
  }
  return { totalRows: rows.length, validRows: rows.length - issueRows.size, alreadyImported: false, issues }
}

function jobDto(job: { id: string; entity: DataMigrationEntity; status: 'COMPLETED'; totalRows: number; importedRows: number; createdAt: Date; completedAt: Date }) {
  return { id: job.id, entity: job.entity, status: job.status, totalRows: job.totalRows, importedRows: job.importedRows, createdAt: job.createdAt.toISOString(), completedAt: job.completedAt.toISOString() }
}

export async function validateCrmDealImport(prisma: PrismaClient, tenantId: string, projectId: string, input: CrmDealImportRow[]) {
  const rows = normalizeRows(input)
  return validateRows(prisma, tenantId, projectId, rows, hashRows(rows))
}

export async function importCrmDeals(prisma: PrismaClient, tenantId: string, projectId: string, input: CrmDealImportRow[], actorId: string) {
  const rows = normalizeRows(input)
  const requestHash = hashRows(rows)
  const uniqueWhere = { tenantId_projectId_entity_idempotencyKey: { tenantId, projectId, entity: 'CRM_DEALS' as const, idempotencyKey: requestHash } }
  try {
    return await prisma.$transaction(async tx => {
      const project = await getProject(tx, tenantId, projectId)
      const prior = await tx.dataMigrationImportJob.findUnique({ where: uniqueWhere })
      if (prior) return { imported: prior.importedRows, replayed: true, job: jobDto(prior) }
      assertProject(project)
      const validation = await validateRows(tx, tenantId, projectId, rows, requestHash)
      if (validation.issues.length) throw new AppError(409, 'Resolve the deal import issues before committing', validation.issues)
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { currency: true } })
      const companySourceIds = [...new Set(rows.map(row => row.companySourceId).filter((id): id is string => Boolean(id)))]
      const companyLinks = companySourceIds.length ? await tx.dataMigrationRecordLink.findMany({ where: { tenantId, projectId, sourceEntity: 'CRM_COMPANIES', targetEntity: 'CRM_COMPANIES', sourceId: { in: companySourceIds } }, select: { sourceId: true, targetId: true } }) : []
      const companyIdBySource = new Map(companyLinks.map(link => [link.sourceId, link.targetId]))
      const ownerEmails = [...new Set(rows.map(row => row.ownerEmail).filter((email): email is string => Boolean(email)))]
      const employees = ownerEmails.length ? await tx.employee.findMany({ where: { tenantId, email: { in: ownerEmails, mode: 'insensitive' } }, select: { id: true, email: true } }) : []
      const employeeIdByEmail = new Map(employees.filter(employee => employee.email).map(employee => [employee.email!.toLowerCase(), employee.id]))
      const job = await tx.dataMigrationImportJob.create({ data: { tenantId, projectId, entity: 'CRM_DEALS', status: 'COMPLETED', idempotencyKey: requestHash, requestHash, totalRows: rows.length, importedRows: rows.length, createdBy: actorId } })
      for (const row of rows) {
        const closed = CLOSED_STAGES.has(row.stage)
        const importedAt = new Date()
        const closedAt = closed ? new Date(`${row.actualCloseDate}T00:00:00.000Z`) : null
        const sourceCreatedAt = row.sourceCreatedAt ? new Date(row.sourceCreatedAt.length === 10 ? `${row.sourceCreatedAt}T00:00:00.000Z` : row.sourceCreatedAt) : importedAt
        const deal = await tx.deal.create({ data: {
          tenantId, currency: tenant.currency, name: row.name, stage: row.stage as typeof DealStageValues[number],
          value: new Prisma.Decimal(Money.fromDecimal(row.value, tenant.currency).toDecimalString()),
          companyId: row.companySourceId ? companyIdBySource.get(row.companySourceId)! : null,
          ownerEmployeeId: row.ownerEmail ? employeeIdByEmail.get(row.ownerEmail)! : null,
          winProbability: row.winProbability === null ? null : Number(row.winProbability),
          closeDate: row.closeDate ? new Date(`${row.closeDate}T00:00:00.000Z`) : null,
          closedAt, productLine: row.productLine, forecastBucket: row.forecastBucket, createdAt: sourceCreatedAt,
        } })
        await tx.dealStageHistory.create({ data: {
          tenantId, dealId: deal.id, fromStage: null, toStage: deal.stage,
          occurredAt: closedAt ?? importedAt, actorId, ownerEmployeeId: deal.ownerEmployeeId, value: deal.value, isBaseline: true,
        } })
        await tx.dataMigrationRecordLink.create({ data: { tenantId, projectId, importJobId: job.id, sourceEntity: 'CRM_DEALS', sourceId: row.sourceId, targetEntity: 'CRM_DEALS', targetId: deal.id } })
      }
      await tx.dataMigrationProject.update({ where: { id: project.id }, data: { status: 'IN_PROGRESS' } })
      await recordAuditLog(tx, { tenantId, actorId, action: 'dataMigration.crmDeals.import', targetType: 'DataMigrationImportJob', targetId: job.id, metadata: { projectId, imported: rows.length, requestHash } })
      return { imported: rows.length, replayed: false, job: jobDto(job) }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const prior = await prisma.dataMigrationImportJob.findUnique({ where: uniqueWhere })
      if (prior?.requestHash === requestHash) return { imported: prior.importedRows, replayed: true, job: jobDto(prior) }
      throw new AppError(409, 'A source deal ID was imported concurrently. Validate again before retrying.')
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new AppError(409, 'Another migration batch changed this project during import. Validate again and retry.')
    throw error
  }
}
