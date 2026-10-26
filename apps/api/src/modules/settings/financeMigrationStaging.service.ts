import { createHash } from 'node:crypto'
import { Prisma, type DataMigrationEntity, type PrismaClient } from '@prisma/client'
import { getCurrency, Money } from '@asas/domain'
import { buildPaginationMeta, toPrismaPage } from '@asas/contracts'
import type { FinanceApOpenItemRow, FinanceArOpenItemRow, FinanceOpeningBalanceLine } from '@asas/contracts'
import { migrationInvoiceBaseAmount } from '../finance/ledger.service.js'
import { recordAuditLog } from '../../services/auditLog.js'
import { AppError } from '../../utils/errors.js'
import { reservedFinanceOpeningCodes, reservedOpeningMessage } from '../../services/openingBalanceAccounts.js'

type FinanceEntity = 'FINANCE_AP_OPEN_ITEMS' | 'FINANCE_AR_OPEN_ITEMS' | 'FINANCE_OPENING_BALANCE'
type FinanceRow = FinanceApOpenItemRow | FinanceArOpenItemRow | FinanceOpeningBalanceLine
type StageMetadata = { asOf?: string; accountsReceivableControlTotal?: string; accountsPayableControlTotal?: string }
type Reader = Pick<PrismaClient, 'dataMigrationProject' | 'dataMigrationImportJob' | 'dataMigrationRecordLink' | 'dataMigrationStageBatch' | 'dataMigrationStagedRecord' | 'tenant' | 'exchangeRate' | 'inventoryValuationAccountMapping'>
type Issue = { rowNumber: number; field: string; message: string }

function normalizeRows(entity: FinanceEntity, input: FinanceRow[]): FinanceRow[] {
  return input.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])) as FinanceRow)
}

function hashBatch(entity: FinanceEntity, rows: FinanceRow[], metadata?: StageMetadata) {
  const sorted = [...rows].sort((a, b) => {
    const left = 'sourceId' in a ? a.sourceId : `${a.code}:${a.side}`
    const right = 'sourceId' in b ? b.sourceId : `${b.code}:${b.side}`
    return left < right ? -1 : left > right ? 1 : 0
  })
  return createHash('sha256').update(JSON.stringify({ entity, metadata: metadata ?? null, rows: sorted })).digest('hex')
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function parseMoney(value: string, currency: string) {
  return Money.fromDecimal(value, currency)
}

async function getProject(reader: Reader, tenantId: string, projectId: string) {
  const project = await reader.dataMigrationProject.findFirst({
    where: { id: projectId, tenantId },
    select: { id: true, status: true, modules: true, targetCutoverAt: true },
  })
  if (!project) throw new AppError(404, 'Migration project not found')
  if (!project.modules.includes('FINANCE')) throw new AppError(409, 'Add Finance to this migration project before staging financial data')
  if (!['PLANNING', 'IN_PROGRESS'].includes(project.status)) throw new AppError(409, 'This migration project is not accepting staged data')
  return project
}

function rowSourceId(entity: FinanceEntity, row: FinanceRow) {
  return 'sourceId' in row ? row.sourceId : `ACCOUNT:${row.code}`
}

function validateRowAmounts(entity: FinanceEntity, row: FinanceRow, rowNumber: number, issues: Issue[]) {
  if (entity === 'FINANCE_OPENING_BALANCE') return
  const item = row as FinanceApOpenItemRow | FinanceArOpenItemRow
  let open: Money
  try {
    const currency = getCurrency(item.currency).code
    open = parseMoney(item.openAmount, currency)
    if (!open.isPositive()) issues.push({ rowNumber, field: 'openAmount', message: 'Open balance must be greater than zero.' })
    if (item.originalAmount !== undefined) {
      const original = parseMoney(item.originalAmount, currency)
      if (!original.isPositive() || original.lessThan(open)) issues.push({ rowNumber, field: 'originalAmount', message: 'Original amount must be positive and at least the open balance.' })
      const expectedPaid = original.subtract(open)
      if (item.paidAmount !== undefined) {
        const paid = parseMoney(item.paidAmount, currency)
        if (paid.isNegative() || !paid.equals(expectedPaid)) issues.push({ rowNumber, field: 'paidAmount', message: 'Paid amount must equal original amount minus open balance.' })
      }
    } else if (item.paidAmount !== undefined) {
      const paid = parseMoney(item.paidAmount, currency)
      if (paid.isNegative()) issues.push({ rowNumber, field: 'paidAmount', message: 'Paid amount cannot be negative.' })
    }
    if (item.dueDate && validDate(item.invoiceDate) && validDate(item.dueDate) && item.dueDate < item.invoiceDate) {
      issues.push({ rowNumber, field: 'dueDate', message: 'Due date cannot be earlier than the invoice date.' })
    }
  } catch {
    issues.push({ rowNumber, field: 'amount/currency', message: 'Enter an exact amount and a currency supported by Asas.' })
  }
}

async function validateRows(reader: Reader, tenantId: string, projectId: string, entity: FinanceEntity, rows: FinanceRow[], metadata: StageMetadata | undefined, hash: string) {
  const project = await getProject(reader, tenantId, projectId)
  const prior = await reader.dataMigrationStageBatch.findUnique({ where: { tenantId_projectId_entity_idempotencyKey: { tenantId, projectId, entity, idempotencyKey: hash } } })
  if (prior) return { totalRows: rows.length, validRows: rows.length, alreadyStaged: true, issues: [] as Issue[] }
  const completedCutoverBatch = await reader.dataMigrationStageBatch.findFirst({ where: { tenantId, projectId, entity: { in: ['FINANCE_AP_OPEN_ITEMS', 'FINANCE_AR_OPEN_ITEMS', 'FINANCE_OPENING_BALANCE'] }, status: 'COMPLETED' }, select: { id: true } })
  if (completedCutoverBatch) throw new AppError(409, 'Finance cutover is already complete for this migration project. Start a new company migration project to stage a different Finance snapshot.')
  const issues: Issue[] = []
  const asOf = metadata?.asOf
  const workspace = entity === 'FINANCE_OPENING_BALANCE'
    ? await reader.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
    : null
  const ids = new Map<string, number>()
  rows.forEach((row, index) => {
    const rowNumber = index + 2
    const sourceId = rowSourceId(entity, row)
    if (!sourceId || sourceId.length > 120) issues.push({ rowNumber, field: 'sourceId/code', message: 'Source IDs and account codes must contain 1 to 120 characters.' })
    const previous = ids.get(sourceId)
    if (previous) {
      issues.push({ rowNumber: previous, field: 'sourceId/code', message: `Duplicate source record; also present on row ${rowNumber}.` })
      issues.push({ rowNumber, field: 'sourceId/code', message: `Duplicate source record; first present on row ${previous}.` })
    } else ids.set(sourceId, rowNumber)
    if (entity === 'FINANCE_OPENING_BALANCE') {
      const line = row as FinanceOpeningBalanceLine
      if (!line.code || !line.name) issues.push({ rowNumber, field: 'account', message: 'Account code and name are required.' })
      try {
        if (!workspace) throw new Error('missing tenant')
        const amount = parseMoney(line.amount, workspace.currency)
        if (!amount.isPositive()) issues.push({ rowNumber, field: 'amount', message: 'Opening amount must be greater than zero.' })
      } catch { issues.push({ rowNumber, field: 'amount', message: 'Enter a positive amount exact in the workspace currency.' }) }
    } else {
      const item = row as FinanceApOpenItemRow | FinanceArOpenItemRow
      if (!validDate(item.invoiceDate)) issues.push({ rowNumber, field: 'invoiceDate', message: 'Enter a real calendar date in YYYY-MM-DD format.' })
      if (item.dueDate && !validDate(item.dueDate)) issues.push({ rowNumber, field: 'dueDate', message: 'Enter a real calendar date in YYYY-MM-DD format.' })
      validateRowAmounts(entity, row, rowNumber, issues)
    }
  })

  if (entity === 'FINANCE_OPENING_BALANCE') {
    if (!asOf || !validDate(asOf)) issues.push({ rowNumber: 1, field: 'asOf', message: 'Opening balances require a valid as-of date.' })
    else if (project.targetCutoverAt && project.targetCutoverAt.toISOString().slice(0, 10) !== asOf) issues.push({ rowNumber: 1, field: 'asOf', message: 'As-of date must match the migration project cutover date.' })
    const reservedCodes = await reservedFinanceOpeningCodes(reader, tenantId, workspace?.currency ?? '')
    const receivableControl = metadata?.accountsReceivableControlTotal
    const payableControl = metadata?.accountsPayableControlTotal
    try {
      if (!workspace || receivableControl === undefined || payableControl === undefined) throw new Error('control totals required')
      const ar = parseMoney(receivableControl, workspace.currency)
      const ap = parseMoney(payableControl, workspace.currency)
      if (ar.isNegative() || ap.isNegative()) throw new Error('control totals cannot be negative')
    } catch {
      issues.push({ rowNumber: 1, field: 'controlTotals', message: 'Enter non-negative, exact workspace-currency AR and AP control-account totals from the source trial balance.' })
    }
    const priorBatches = await reader.dataMigrationStageBatch.findMany({ where: { tenantId, projectId, entity, status: 'STAGED' }, select: { metadata: true } })
    for (const batch of priorBatches) {
      const priorMetadata = batch.metadata as StageMetadata | null
      if (priorMetadata && priorMetadata.asOf !== metadata?.asOf) {
        issues.push({ rowNumber: 1, field: 'asOf', message: 'Trial-balance correction batches must use the same migration cutover date.' })
        break
      }
    }
    if (rows.some(row => reservedCodes.has((row as FinanceOpeningBalanceLine).code))) {
      issues.push({ rowNumber: 1, field: 'lines', message: reservedOpeningMessage(reservedCodes) })
    }
  } else {
    const items = rows as Array<FinanceApOpenItemRow | FinanceArOpenItemRow>
    const sourceEntity = entity === 'FINANCE_AP_OPEN_ITEMS' ? 'FINANCE_VENDORS' : 'FINANCE_CUSTOMERS'
    const sourceIds = [...new Set(items.map(item => entity === 'FINANCE_AP_OPEN_ITEMS' ? (item as FinanceApOpenItemRow).vendorSourceId : (item as FinanceArOpenItemRow).customerSourceId))]
    const links = sourceIds.length ? await reader.dataMigrationRecordLink.findMany({ where: { tenantId, projectId, sourceEntity, sourceId: { in: sourceIds } }, select: { sourceId: true } }) : []
    const linked = new Set(links.map(link => link.sourceId))
    items.forEach((item, index) => {
      const counterparty = entity === 'FINANCE_AP_OPEN_ITEMS' ? (item as FinanceApOpenItemRow).vendorSourceId : (item as FinanceArOpenItemRow).customerSourceId
      if (!linked.has(counterparty)) issues.push({ rowNumber: index + 2, field: entity === 'FINANCE_AP_OPEN_ITEMS' ? 'vendorSourceId' : 'customerSourceId', message: `Import the matching Finance ${entity === 'FINANCE_AP_OPEN_ITEMS' ? 'vendor' : 'customer'} first.` })
    })
  }

  const validRows = rows.length - new Set(issues.filter(issue => issue.rowNumber > 1).map(issue => issue.rowNumber)).size
  return { totalRows: rows.length, validRows, alreadyStaged: false, issues }
}

function toBatch(batch: { id: string; entity: DataMigrationEntity; sequence: number; status: 'STAGED' | 'COMPLETED'; totalRows: number; stagedRows: number; createdAt: Date }) {
  return { id: batch.id, entity: batch.entity, status: batch.status, sequence: batch.sequence, totalRows: batch.totalRows, stagedRows: batch.stagedRows, createdAt: batch.createdAt.toISOString() }
}

export async function validateFinanceMigrationStage(prisma: PrismaClient, tenantId: string, projectId: string, entity: FinanceEntity, input: FinanceRow[], metadata?: StageMetadata) {
  const rows = normalizeRows(entity, input)
  return validateRows(prisma, tenantId, projectId, entity, rows, metadata, hashBatch(entity, rows, metadata))
}

export async function stageFinanceMigrationBatch(prisma: PrismaClient, tenantId: string, projectId: string, entity: FinanceEntity, input: FinanceRow[], actorId: string, metadata?: StageMetadata) {
  const rows = normalizeRows(entity, input)
  const hash = hashBatch(entity, rows, metadata)
  const where = { tenantId_projectId_entity_idempotencyKey: { tenantId, projectId, entity, idempotencyKey: hash } }
  try {
    return await prisma.$transaction(async tx => {
      await getProject(tx, tenantId, projectId)
      const prior = await tx.dataMigrationStageBatch.findUnique({ where })
      if (prior) return { batch: toBatch(prior), replayed: true }
      const validation = await validateRows(tx, tenantId, projectId, entity, rows, metadata, hash)
      if (validation.issues.length) throw new AppError(409, 'Resolve the Finance staging issues before saving this batch', validation.issues)
      const sourceIds = rows.map(row => rowSourceId(entity, row))
      const previousRecords = sourceIds.length ? await tx.dataMigrationStagedRecord.findMany({
        where: { tenantId, projectId, entity, sourceId: { in: sourceIds } },
        orderBy: { revision: 'desc' },
        select: { sourceId: true, revision: true, isCurrent: true },
      }) : []
      const previousBySource = new Map<string, number>()
      for (const record of previousRecords) if (!previousBySource.has(record.sourceId)) previousBySource.set(record.sourceId, record.revision ?? 1)
      const previousBatches = await tx.dataMigrationStageBatch.findMany({ where: { tenantId, projectId, entity }, orderBy: { sequence: 'desc' }, take: 1, select: { sequence: true } })
      const sequence = (previousBatches[0]?.sequence ?? 0) + 1
      const batch = await tx.dataMigrationStageBatch.create({ data: { tenantId, projectId, entity, sequence, status: 'STAGED', idempotencyKey: hash, requestHash: hash, totalRows: rows.length, stagedRows: rows.length, metadata: metadata as Prisma.InputJsonValue ?? Prisma.JsonNull, createdBy: actorId } })
      if (sourceIds.length) await tx.dataMigrationStagedRecord.updateMany({ where: { tenantId, projectId, entity, sourceId: { in: sourceIds }, isCurrent: true }, data: { isCurrent: false } })
      await tx.dataMigrationStagedRecord.createMany({ data: rows.map(row => {
        const sourceId = rowSourceId(entity, row)
        return { tenantId, projectId, batchId: batch.id, entity, sourceId, revision: (previousBySource.get(sourceId) ?? 0) + 1, isCurrent: true, payload: row as Prisma.InputJsonValue }
      }) })
      if ((await tx.dataMigrationProject.findUniqueOrThrow({ where: { id: projectId }, select: { status: true } })).status === 'PLANNING') {
        await tx.dataMigrationProject.update({ where: { id: projectId }, data: { status: 'IN_PROGRESS' } })
      }
      await recordAuditLog(tx, { tenantId, actorId, action: `dataMigration.${entity.toLocaleLowerCase('en-US')}.stage`, targetType: 'DataMigrationStageBatch', targetId: batch.id, metadata: { projectId, rows: rows.length, requestHash: hash, ...metadata } })
      return { batch: toBatch(batch), replayed: false }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const prior = await prisma.dataMigrationStageBatch.findUnique({ where })
      if (prior?.requestHash === hash) return { batch: toBatch(prior), replayed: true }
      throw new AppError(409, 'A Finance source record was staged concurrently. Validate again before retrying.')
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new AppError(409, 'Another migration batch changed this project. Validate again and retry.')
    throw error
  }
}

/** Read-only Finance cutover preview. This reports reconciliation evidence but never enables writes. */
export async function previewFinanceMigrationReconciliation(prisma: PrismaClient, tenantId: string, projectId: string) {
  return prisma.$transaction(async tx => {
    const project = await tx.dataMigrationProject.findFirst({ where: { id: projectId, tenantId }, select: { id: true, status: true, modules: true, targetCutoverAt: true } })
    if (!project) throw new AppError(404, 'Migration project not found')
    if (!project.modules.includes('FINANCE')) throw new AppError(409, 'Finance is not included in this migration project')
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
    if (!tenant) throw new AppError(404, 'Workspace not found')
    const reservedCodes = await reservedFinanceOpeningCodes(tx, tenantId, tenant.currency)
    const cutoverDate = project.targetCutoverAt?.toISOString().slice(0, 10) ?? null
    const issues: Array<{ code: string; message: string }> = []
    if (!project.targetCutoverAt) issues.push({ code: 'CUTOVER_DATE_REQUIRED', message: 'Set the company migration cutover date before reconciling Finance.' })
    if (project.targetCutoverAt && project.targetCutoverAt.getTime() > Date.now() + 86_400_000) issues.push({ code: 'CUTOVER_DATE_IN_FUTURE', message: 'The cutover date is in the future. Run the final reconciliation on or after the date before committing Finance.' })

    const [batches, activeJournalCount, existingPayableInvoiceCount, existingReceivableInvoiceCount, cutoverJobs] = await Promise.all([
      tx.dataMigrationStageBatch.findMany({ where: { tenantId, projectId, entity: { in: ['FINANCE_AP_OPEN_ITEMS', 'FINANCE_AR_OPEN_ITEMS', 'FINANCE_OPENING_BALANCE'] } }, include: { records: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      tx.journalEntry.count({ where: { tenantId } }),
      tx.payableInvoice.count({ where: { tenantId } }),
      tx.receivableInvoice.count({ where: { tenantId } }),
      tx.dataMigrationImportJob.findMany({ where: { tenantId, projectId, entity: { in: ['FINANCE_AP_OPEN_ITEMS', 'FINANCE_AR_OPEN_ITEMS', 'FINANCE_OPENING_BALANCE'] } }, select: { entity: true, requestHash: true } }),
    ])
    const cutoverHashByEntity = new Map(cutoverJobs.map(job => [job.entity, job.requestHash]))
    const cutoverCompleted = batches.length > 0 && batches.every(batch => batch.status === 'COMPLETED')
      && ['FINANCE_AP_OPEN_ITEMS', 'FINANCE_AR_OPEN_ITEMS', 'FINANCE_OPENING_BALANCE'].every(entity => !!cutoverHashByEntity.get(entity as DataMigrationEntity))
      && new Set(['FINANCE_AP_OPEN_ITEMS', 'FINANCE_AR_OPEN_ITEMS', 'FINANCE_OPENING_BALANCE'].map(entity => cutoverHashByEntity.get(entity as DataMigrationEntity))).size === 1
    if (!cutoverCompleted && activeJournalCount) issues.push({ code: 'EXISTING_LEDGER_JOURNALS', message: `${activeJournalCount} ledger journal(s) already exist. The current opening-balance workflow only allows cutover before the first journal.` })
    if (!cutoverCompleted && (existingPayableInvoiceCount || existingReceivableInvoiceCount)) issues.push({ code: 'EXISTING_OPEN_ITEMS', message: `Existing Finance documents found (${existingPayableInvoiceCount} payables, ${existingReceivableInvoiceCount} receivables); review them to avoid duplicates before cutover.` })

    const apBatches = batches.filter(batch => batch.entity === 'FINANCE_AP_OPEN_ITEMS')
    const arBatches = batches.filter(batch => batch.entity === 'FINANCE_AR_OPEN_ITEMS')
    const trialBatches = batches.filter(batch => batch.entity === 'FINANCE_OPENING_BALANCE')
    const current = <T extends { isCurrent?: boolean }>(records: T[]) => records.filter(record => record.isCurrent !== false)
    const apRows = apBatches.flatMap(batch => current(batch.records).map(record => record.payload as unknown as FinanceApOpenItemRow))
    const arRows = arBatches.flatMap(batch => current(batch.records).map(record => record.payload as unknown as FinanceArOpenItemRow))
    const trialRows = trialBatches.flatMap(batch => current(batch.records).map(record => record.payload as unknown as FinanceOpeningBalanceLine))
    if (trialRows.some(row => reservedCodes.has(row.code))) issues.push({ code: 'RESERVED_ACCOUNT', message: reservedOpeningMessage(reservedCodes) })
    if (!apRows.length) issues.push({ code: 'AP_BATCH_REQUIRED', message: 'Stage the source AP open-item population before Finance reconciliation.' })
    if (!arRows.length) issues.push({ code: 'AR_BATCH_REQUIRED', message: 'Stage the source AR open-item population before Finance reconciliation.' })
    if (!trialRows.length || !trialBatches.length) issues.push({ code: 'OPENING_TRIAL_BALANCE_REQUIRED', message: 'Stage the source opening trial balance before Finance reconciliation.' })

    const metadata = [...trialBatches].sort((a, b) => a.sequence - b.sequence).at(-1)?.metadata as StageMetadata | null | undefined
    if (metadata?.asOf && cutoverDate && metadata.asOf !== cutoverDate) issues.push({ code: 'TRIAL_BALANCE_DATE_MISMATCH', message: 'The staged trial-balance date does not match the migration cutover date.' })

    const decimal = (value: string | undefined) => {
      try { return value === undefined ? null : new Prisma.Decimal(Money.fromDecimal(value, tenant.currency).toDecimalString()) }
      catch { return null }
    }
    const sourceAp = decimal(metadata?.accountsPayableControlTotal)
    const sourceAr = decimal(metadata?.accountsReceivableControlTotal)
    const sum = (rows: FinanceOpeningBalanceLine[], side: 'DEBIT' | 'CREDIT') => rows.filter(row => row.side === side).reduce((total, row) => {
      const amount = decimal(row.amount)
      return amount ? total.plus(amount) : total
    }, new Prisma.Decimal(0))
    const residualDebit = trialRows.length ? sum(trialRows, 'DEBIT') : null
    const residualCredit = trialRows.length ? sum(trialRows, 'CREDIT') : null
    if (residualDebit && residualCredit && sourceAp && sourceAr && !residualCredit.minus(residualDebit).eq(sourceAr.minus(sourceAp))) {
      issues.push({ code: 'TRIAL_BALANCE_OUT_OF_BALANCE', message: 'Residual trial-balance lines plus source AP/AR controls do not balance.' })
    }

    let eligibleAp = new Prisma.Decimal(0)
    let stagedAr = new Prisma.Decimal(0)
    const pendingApRows = apRows.filter(row => row.status === 'PENDING').length
    let fxComplete = true
    if (project.targetCutoverAt) {
      for (const row of apRows) {
        if (row.status === 'PENDING') continue
        try {
          const base = await migrationInvoiceBaseAmount(tx, { tenantId, amount: row.openAmount, currency: row.currency, workspaceCurrency: tenant.currency, asOf: project.targetCutoverAt })
          eligibleAp = eligibleAp.plus(base)
        } catch (error) {
          fxComplete = false
          const message = error instanceof Error ? error.message : 'Could not value this AP item at cutover.'
          issues.push({ code: 'AP_FX_UNAVAILABLE', message })
        }
      }
      for (const row of arRows) {
        try {
          const base = await migrationInvoiceBaseAmount(tx, { tenantId, amount: row.openAmount, currency: row.currency, workspaceCurrency: tenant.currency, asOf: project.targetCutoverAt })
          stagedAr = stagedAr.plus(base)
        } catch (error) {
          fxComplete = false
          const message = error instanceof Error ? error.message : 'Could not value this AR item at cutover.'
          issues.push({ code: 'AR_FX_UNAVAILABLE', message })
        }
      }
    } else fxComplete = false

    const apDifference = sourceAp && fxComplete ? eligibleAp.minus(sourceAp) : null
    const arDifference = sourceAr && fxComplete ? stagedAr.minus(sourceAr) : null
    if (apDifference && !apDifference.isZero()) issues.push({ code: 'AP_CONTROL_MISMATCH', message: `FX-valued eligible AP differs from the source AP control balance by ${apDifference.toFixed(tenant.currency === 'JPY' ? 0 : 2)} ${tenant.currency}.` })
    if (arDifference && !arDifference.isZero()) issues.push({ code: 'AR_CONTROL_MISMATCH', message: `FX-valued open AR differs from the source AR control balance by ${arDifference.toFixed(tenant.currency === 'JPY' ? 0 : 2)} ${tenant.currency}.` })

    const reconciled = !!project.targetCutoverAt && !!apRows.length && !!arRows.length && !!trialRows.length && !!sourceAp && !!sourceAr
      && fxComplete && apDifference?.isZero() && arDifference?.isZero() && !issues.length
    return {
      targetCutoverAt: cutoverDate,
      workspaceCurrency: tenant.currency,
      state: cutoverCompleted ? 'CUTOVER_COMPLETED' as const : !apRows.length || !arRows.length || !trialRows.length || !metadata ? 'INCOMPLETE' as const : reconciled ? 'RECONCILED_PENDING_CUTOVER' as const : 'RECONCILIATION_REQUIRED' as const,
      cutoverAvailable: false as const,
      evidence: {
        apRows: apRows.length, eligibleApRows: apRows.length - pendingApRows, pendingApRows,
        arRows: arRows.length, trialBalanceRows: trialRows.length,
        activeJournalCount, existingPayableInvoiceCount, existingReceivableInvoiceCount,
      },
      balances: {
        sourceApControl: sourceAp?.toFixed(4) ?? null,
        stagedEligibleApAtCutoverFx: project.targetCutoverAt && fxComplete ? eligibleAp.toFixed(4) : null,
        apDifference: apDifference?.toFixed(4) ?? null,
        sourceArControl: sourceAr?.toFixed(4) ?? null,
        stagedArAtCutoverFx: project.targetCutoverAt && fxComplete ? stagedAr.toFixed(4) : null,
        arDifference: arDifference?.toFixed(4) ?? null,
        residualDebit: residualDebit?.toFixed(4) ?? null,
        residualCredit: residualCredit?.toFixed(4) ?? null,
      },
      issues: issues.map(issue => ({ ...issue, message: issue.message })),
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 })
}

export async function listFinanceMigrationStageRecords(prisma: PrismaClient, tenantId: string, projectId: string, entity: FinanceEntity, query: { page: number; limit: number }) {
  const project = await prisma.dataMigrationProject.findFirst({ where: { id: projectId, tenantId }, select: { id: true, modules: true } })
  if (!project) throw new AppError(404, 'Migration project not found')
  if (!project.modules.includes('FINANCE')) throw new AppError(409, 'Finance is not included in this migration project')
  const where = { tenantId, projectId, entity }
  const [rows, total] = await Promise.all([
    prisma.dataMigrationStagedRecord.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], ...toPrismaPage(query) }),
    prisma.dataMigrationStagedRecord.count({ where }),
  ])
  return {
    items: rows.map(row => ({ id: row.id, entity: row.entity as FinanceEntity, sourceId: row.sourceId, revision: row.revision, isCurrent: row.isCurrent, payload: row.payload as Record<string, unknown>, createdAt: row.createdAt.toISOString() })),
    pagination: buildPaginationMeta(query, total),
  }
}

