import { createHash } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { Money } from '@asas/domain'
import { financeApOpenItemRowSchema, financeArOpenItemRowSchema, financeOpeningBalanceLineSchema, type FinanceApOpenItemRow, type FinanceArOpenItemRow, type FinanceOpeningBalanceLine } from '@asas/contracts'
import { postOpeningBalance, recordMigrationInvoiceOpeningRecognition, migrationInvoiceBaseAmount } from '../finance/ledger.service.js'
import { recordAuditLog } from '../../services/auditLog.js'
import { AppError } from '../../utils/errors.js'
import { reservedFinanceOpeningCodes, reservedOpeningMessage } from '../../services/openingBalanceAccounts.js'

type StageEntity = 'FINANCE_AP_OPEN_ITEMS' | 'FINANCE_AR_OPEN_ITEMS' | 'FINANCE_OPENING_BALANCE'
type StageMetadata = { asOf?: string; accountsReceivableControlTotal?: string; accountsPayableControlTotal?: string }

function asDate(value: string) { return new Date(`${value}T00:00:00.000Z`) }
function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = asDate(value)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
function cutoverKey(projectId: string, batches: Array<{ id: string; requestHash: string }>) {
  return createHash('sha256').update(JSON.stringify({ version: 1, projectId, batches: batches.map(batch => [batch.id, batch.requestHash]).sort(([a], [b]) => String(a).localeCompare(String(b))) })).digest('hex')
}
function fail(message: string): never { throw new AppError(409, message) }

/**
 * Converts the staged Finance source snapshot into operational invoices and ledger entries.
 * Everything is revalidated and committed in one serializable transaction; a failure leaves
 * the original staged data intact and creates no partially imported financial records.
 */
export async function cutoverFinanceMigration(prisma: PrismaClient, tenantId: string, projectId: string, actorId: string) {
  try {
    return await prisma.$transaction(async tx => {
      const project = await tx.dataMigrationProject.findFirst({ where: { id: projectId, tenantId }, select: { id: true, name: true, sourceSystem: true, modules: true, status: true, targetCutoverAt: true } })
      if (!project) throw new AppError(404, 'Migration project not found')
      if (!project.modules.includes('FINANCE')) fail('Finance is not included in this migration project')
      if (!['PLANNING', 'IN_PROGRESS', 'READY_FOR_CUTOVER', 'RECONCILING'].includes(project.status)) fail('This migration project is not in a state that allows Finance cutover')
      if (!project.targetCutoverAt) fail('Set the company cutover date before committing Finance migration')
      const cutoverDate = new Date(Date.UTC(project.targetCutoverAt.getUTCFullYear(), project.targetCutoverAt.getUTCMonth(), project.targetCutoverAt.getUTCDate()))
      const dateText = cutoverDate.toISOString().slice(0, 10)
      const tenant = await tx.tenant.findFirst({ where: { id: tenantId }, select: { currency: true } })
      if (!tenant) throw new AppError(404, 'Workspace not found')

      const batches = await tx.dataMigrationStageBatch.findMany({
        where: { tenantId, projectId, entity: { in: ['FINANCE_AP_OPEN_ITEMS', 'FINANCE_AR_OPEN_ITEMS', 'FINANCE_OPENING_BALANCE'] } },
        include: { records: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
      const staged = batches.filter(batch => batch.status === 'STAGED')
      const completed = batches.filter(batch => batch.status === 'COMPLETED')
      if (!staged.length && completed.length) {
        const prior = await tx.dataMigrationImportJob.findFirst({ where: { tenantId, projectId, entity: 'FINANCE_AP_OPEN_ITEMS' }, orderBy: { completedAt: 'desc' } })
        if (!prior) fail('Completed Finance batches have no cutover job record; contact an administrator before proceeding')
        const [arJob, tbJob] = await Promise.all([
          tx.dataMigrationImportJob.findFirst({ where: { tenantId, projectId, entity: 'FINANCE_AR_OPEN_ITEMS', requestHash: prior.requestHash } }),
          tx.dataMigrationImportJob.findFirst({ where: { tenantId, projectId, entity: 'FINANCE_OPENING_BALANCE', requestHash: prior.requestHash } }),
        ])
        if (!arJob || !tbJob) fail('Finance cutover history is incomplete; contact an administrator to review it')
        const marker = await tx.dataMigrationRecordLink.findFirst({ where: { tenantId, projectId, importJobId: tbJob.id, sourceEntity: 'FINANCE_OPENING_BALANCE', sourceId: `__FINANCE_CUTOVER__:${prior.idempotencyKey}` } })
        if (!marker) fail('Finance migration has already been processed, but its cutover journal marker is missing; contact an administrator')
        const completedAp = completed.filter(batch => batch.entity === 'FINANCE_AP_OPEN_ITEMS').flatMap(batch => batch.records).filter(record => record.isCurrent !== false)
        const pendingPayablesNotRecognized = completedAp.filter(record => (record.payload as unknown as FinanceApOpenItemRow).status === 'PENDING').length
        return { replayed: true, cutoverAt: dateText, openingJournalId: marker.targetId, importedPayables: prior.importedRows, importedReceivables: arJob.importedRows, pendingPayablesNotRecognized }
      }
      const apBatches = staged.filter(batch => batch.entity === 'FINANCE_AP_OPEN_ITEMS')
      const arBatches = staged.filter(batch => batch.entity === 'FINANCE_AR_OPEN_ITEMS')
      const tbBatches = staged.filter(batch => batch.entity === 'FINANCE_OPENING_BALANCE')
      const apRows: Array<{ sourceId: string; row: FinanceApOpenItemRow }> = []
      const arRows: Array<{ sourceId: string; row: FinanceArOpenItemRow }> = []
      const trialRows: Array<{ sourceId: string; row: FinanceOpeningBalanceLine }> = []
      for (const batch of apBatches) for (const record of batch.records.filter(record => record.isCurrent !== false)) {
        const parsed = financeApOpenItemRowSchema.safeParse(record.payload)
        if (!parsed.success) fail(`Staged AP source ${record.sourceId} is no longer valid; review the saved row before cutover`)
        apRows.push({ sourceId: record.sourceId, row: parsed.data })
      }
      for (const batch of arBatches) for (const record of batch.records.filter(record => record.isCurrent !== false)) {
        const parsed = financeArOpenItemRowSchema.safeParse(record.payload)
        if (!parsed.success) fail(`Staged AR source ${record.sourceId} is no longer valid; review the saved row before cutover`)
        arRows.push({ sourceId: record.sourceId, row: parsed.data })
      }
      for (const batch of tbBatches) for (const record of batch.records.filter(record => record.isCurrent !== false)) {
        const parsed = financeOpeningBalanceLineSchema.safeParse(record.payload)
        if (!parsed.success) fail(`Staged trial-balance source ${record.sourceId} is no longer valid; review the saved row before cutover`)
        trialRows.push({ sourceId: record.sourceId, row: parsed.data })
      }

      const metadata = [...tbBatches].sort((a, b) => a.sequence - b.sequence).at(-1)?.metadata as StageMetadata | null | undefined
      if (!apRows.length || !arRows.length || !trialRows.length || !metadata) fail('Stage AP, AR, and the residual opening trial balance before cutover')
      if (metadata.asOf !== dateText) fail('The staged trial-balance date must match the project cutover date')
      if (cutoverDate.getTime() > Date.now() + 86_400_000) fail('The cutover date cannot be in the future')

      const expectedAp = Money.fromDecimal(metadata.accountsPayableControlTotal!, tenant.currency)
      const expectedAr = Money.fromDecimal(metadata.accountsReceivableControlTotal!, tenant.currency)
      if (expectedAp.isNegative() || expectedAr.isNegative()) fail('Source AP and AR control totals cannot be negative')
      let valuedAp = new Prisma.Decimal(0)
      let valuedAr = new Prisma.Decimal(0)
      for (const { row } of apRows) {
        if (!validCalendarDate(row.invoiceDate) || row.invoiceDate > dateText) fail('An AP invoice date is invalid or after the cutover date')
        if (row.dueDate && (!validCalendarDate(row.dueDate) || row.dueDate < row.invoiceDate)) fail('An AP due date is invalid or before its invoice date')
        const open = Money.fromDecimal(row.openAmount, row.currency)
        if (!open.isPositive()) fail('Every AP source row must have a positive open amount')
        if (row.originalAmount !== undefined) {
          const original = Money.fromDecimal(row.originalAmount, row.currency)
          if (!original.isPositive() || original.lessThan(open)) fail('An AP original amount is less than its open balance')
          if (row.paidAmount !== undefined && !Money.fromDecimal(row.paidAmount, row.currency).equals(original.subtract(open))) fail('An AP paid amount does not reconcile to original minus open amount')
        } else if (row.paidAmount !== undefined && Money.fromDecimal(row.paidAmount, row.currency).isNegative()) fail('An AP paid amount cannot be negative')
        if (row.status !== 'PENDING') {
          const base = await migrationInvoiceBaseAmount(tx, { tenantId, amount: row.openAmount, currency: row.currency, workspaceCurrency: tenant.currency, asOf: cutoverDate })
          valuedAp = valuedAp.plus(base)
        }
      }
      for (const { row } of arRows) {
        if (!validCalendarDate(row.invoiceDate) || row.invoiceDate > dateText) fail('An AR invoice date is invalid or after the cutover date')
        if (row.dueDate && (!validCalendarDate(row.dueDate) || row.dueDate < row.invoiceDate)) fail('An AR due date is invalid or before its invoice date')
        const open = Money.fromDecimal(row.openAmount, row.currency)
        if (!open.isPositive()) fail('Every AR source row must have a positive open amount')
        if (row.originalAmount !== undefined) {
          const original = Money.fromDecimal(row.originalAmount, row.currency)
          if (!original.isPositive() || original.lessThan(open)) fail('An AR original amount is less than its open balance')
          if (row.paidAmount !== undefined && !Money.fromDecimal(row.paidAmount, row.currency).equals(original.subtract(open))) fail('An AR paid amount does not reconcile to original minus open amount')
        } else if (row.paidAmount !== undefined && Money.fromDecimal(row.paidAmount, row.currency).isNegative()) fail('An AR paid amount cannot be negative')
        const base = await migrationInvoiceBaseAmount(tx, { tenantId, amount: row.openAmount, currency: row.currency, workspaceCurrency: tenant.currency, asOf: cutoverDate })
        valuedAr = valuedAr.plus(base)
      }
      if (!valuedAp.eq(expectedAp.toDecimalString())) fail(`Eligible AP at cutover FX (${valuedAp.toFixed(4)}) does not match the staged source AP control (${expectedAp.toDecimalString()})`)
      if (!valuedAr.eq(expectedAr.toDecimalString())) fail(`AR at cutover FX (${valuedAr.toFixed(4)}) does not match the staged source AR control (${expectedAr.toDecimalString()})`)

      let debit = new Prisma.Decimal(0)
      let credit = new Prisma.Decimal(0)
      const codes = new Set<string>()
      const reservedCodes = await reservedFinanceOpeningCodes(tx, tenantId, tenant.currency)
      for (const { row } of trialRows) {
        if (reservedCodes.has(row.code)) fail(reservedOpeningMessage(reservedCodes))
        if (codes.has(row.code)) fail(`Trial-balance account ${row.code} appears more than once`)
        codes.add(row.code)
        const amount = Money.fromDecimal(row.amount, tenant.currency)
        if (!amount.isPositive()) fail(`Trial-balance account ${row.code} must have a positive amount`)
        if (row.side === 'DEBIT') debit = debit.plus(amount.toDecimalString())
        else credit = credit.plus(amount.toDecimalString())
      }
      if (!credit.minus(debit).eq(new Prisma.Decimal(expectedAr.toDecimalString()).minus(expectedAp.toDecimalString()))) fail('Residual trial-balance lines do not reconcile to the staged AP and AR source controls')

      const batchIds = new Set(staged.map(batch => batch.id))
      const stagedEntityCounts = new Map<StageEntity, number>([
        ['FINANCE_AP_OPEN_ITEMS', apRows.length], ['FINANCE_AR_OPEN_ITEMS', arRows.length], ['FINANCE_OPENING_BALANCE', trialRows.length],
      ])
      if (batches.some(batch => batch.status === 'COMPLETED') && staged.length) fail('Some Finance batches were already cut over while other batches remain staged; contact an administrator before proceeding')
      if (!staged.length) {
        fail('There are no staged Finance batches available to cut over')
      }

      const existingJournalCount = await tx.journalEntry.count({ where: { tenantId } })
      const existingPayables = await tx.payableInvoice.count({ where: { tenantId } })
      const existingReceivables = await tx.receivableInvoice.count({ where: { tenantId } })
      if (existingJournalCount || existingPayables || existingReceivables) fail(`Cutover requires an unused Finance ledger. Found ${existingJournalCount} journal(s), ${existingPayables} payable(s), and ${existingReceivables} receivable(s).`)

      const allCounterpartySourceIds = [
        ...apRows.map(({ row }) => row.vendorSourceId),
        ...arRows.map(({ row }) => row.customerSourceId),
      ]
      const counterpartyLinks = await tx.dataMigrationRecordLink.findMany({ where: { tenantId, projectId, sourceEntity: { in: ['FINANCE_VENDORS', 'FINANCE_CUSTOMERS'] }, sourceId: { in: allCounterpartySourceIds } } })
      const linkIndex = new Map(counterpartyLinks.map(link => [`${link.sourceEntity}:${link.sourceId}`, link]))
      for (const { row } of apRows) {
        const link = linkIndex.get(`FINANCE_VENDORS:${row.vendorSourceId}`)
        if (!link || link.targetEntity !== 'FINANCE_VENDORS' || !await tx.vendor.findFirst({ where: { id: link.targetId, tenantId }, select: { id: true } })) fail(`Import or repair the Finance vendor crosswalk for source ${row.vendorSourceId}`)
      }
      for (const { row } of arRows) {
        const link = linkIndex.get(`FINANCE_CUSTOMERS:${row.customerSourceId}`)
        if (!link || link.targetEntity !== 'FINANCE_CUSTOMERS' || !await tx.customer.findFirst({ where: { id: link.targetId, tenantId }, select: { id: true } })) fail(`Import or repair the Finance customer crosswalk for source ${row.customerSourceId}`)
      }

      const key = cutoverKey(projectId, staged.map(batch => ({ id: batch.id, requestHash: batch.requestHash })))
      const [apJob, arJob, tbJob] = await Promise.all([
        tx.dataMigrationImportJob.findUnique({ where: { tenantId_projectId_entity_idempotencyKey: { tenantId, projectId, entity: 'FINANCE_AP_OPEN_ITEMS', idempotencyKey: key } } }),
        tx.dataMigrationImportJob.findUnique({ where: { tenantId_projectId_entity_idempotencyKey: { tenantId, projectId, entity: 'FINANCE_AR_OPEN_ITEMS', idempotencyKey: key } } }),
        tx.dataMigrationImportJob.findUnique({ where: { tenantId_projectId_entity_idempotencyKey: { tenantId, projectId, entity: 'FINANCE_OPENING_BALANCE', idempotencyKey: key } } }),
      ])
      if (apJob || arJob || tbJob) fail('A partial Finance cutover marker exists. No new writes were made; contact an administrator to review this project.')

      const openingLines = trialRows.map(({ row }) => ({ code: row.code, name: row.name, kind: row.kind, side: row.side, amount: row.amount }))
      const netDebit = debit.minus(credit)
      if (!netDebit.isZero()) openingLines.push({
        code: 'MIGRATION_OPENING_EQUITY', name: 'Migration opening equity clearing', kind: 'EQUITY',
        side: netDebit.isPositive() ? 'CREDIT' : 'DEBIT', amount: netDebit.abs().toFixed(4),
      })
      const openingJournal = await postOpeningBalance(tx, tenantId, actorId, {
        asOf: dateText,
        description: `Finance migration opening balances · ${project.sourceSystem || project.name}`,
        lines: openingLines,
      })

      const jobs = await Promise.all([
        tx.dataMigrationImportJob.create({ data: { tenantId, projectId, entity: 'FINANCE_AP_OPEN_ITEMS', idempotencyKey: key, requestHash: key, totalRows: apRows.length, importedRows: apRows.length, createdBy: actorId } }),
        tx.dataMigrationImportJob.create({ data: { tenantId, projectId, entity: 'FINANCE_AR_OPEN_ITEMS', idempotencyKey: key, requestHash: key, totalRows: arRows.length, importedRows: arRows.length, createdBy: actorId } }),
        tx.dataMigrationImportJob.create({ data: { tenantId, projectId, entity: 'FINANCE_OPENING_BALANCE', idempotencyKey: key, requestHash: key, totalRows: trialRows.length, importedRows: trialRows.length, createdBy: actorId } }),
      ])
      const jobByEntity = new Map(jobs.map(job => [job.entity, job]))
      for (const { sourceId, row } of apRows) {
        const vendorId = linkIndex.get(`FINANCE_VENDORS:${row.vendorSourceId}`)!.targetId
        const amount = Money.fromDecimal(row.openAmount, row.currency).toDecimalString()
        const original = row.originalAmount ? Money.fromDecimal(row.originalAmount, row.currency).toDecimalString() : row.paidAmount ? Money.fromDecimal(row.openAmount, row.currency).add(Money.fromDecimal(row.paidAmount, row.currency)).toDecimalString() : null
        const paid = row.paidAmount ? Money.fromDecimal(row.paidAmount, row.currency).toDecimalString() : row.originalAmount ? Money.fromDecimal(row.originalAmount, row.currency).subtract(Money.fromDecimal(row.openAmount, row.currency)).toDecimalString() : null
        const invoice = await tx.payableInvoice.create({ data: {
          tenantId, vendorId, invoiceNumber: row.invoiceNumber ?? null, date: asDate(row.invoiceDate), dueDate: row.dueDate ? asDate(row.dueDate) : null,
          currency: row.currency, amount, sourceOriginalAmount: original, sourcePaidAmount: paid, status: row.status,
          ...(row.status !== 'PENDING' ? { approvedAt: cutoverDate } : {}), createdById: actorId,
        } })
        await tx.dataMigrationRecordLink.create({ data: { tenantId, projectId, importJobId: jobByEntity.get('FINANCE_AP_OPEN_ITEMS')!.id, sourceEntity: 'FINANCE_AP_OPEN_ITEMS', sourceId, targetEntity: 'FINANCE_AP_OPEN_ITEMS', targetId: invoice.id } })
        if (row.status !== 'PENDING') await recordMigrationInvoiceOpeningRecognition(tx, { tenantId, sourceId: invoice.id, kind: 'AP', amount, currency: row.currency, workspaceCurrency: tenant.currency, postedAt: cutoverDate, actorId, description: `Migrated payable opening balance: ${row.invoiceNumber || sourceId}` })
      }
      for (const { sourceId, row } of arRows) {
        const customerId = linkIndex.get(`FINANCE_CUSTOMERS:${row.customerSourceId}`)!.targetId
        const amount = Money.fromDecimal(row.openAmount, row.currency).toDecimalString()
        const original = row.originalAmount ? Money.fromDecimal(row.originalAmount, row.currency).toDecimalString() : row.paidAmount ? Money.fromDecimal(row.openAmount, row.currency).add(Money.fromDecimal(row.paidAmount, row.currency)).toDecimalString() : null
        const paid = row.paidAmount ? Money.fromDecimal(row.paidAmount, row.currency).toDecimalString() : row.originalAmount ? Money.fromDecimal(row.originalAmount, row.currency).subtract(Money.fromDecimal(row.openAmount, row.currency)).toDecimalString() : null
        const invoice = await tx.receivableInvoice.create({ data: {
          tenantId, customerId, number: row.invoiceNumber ?? null, date: asDate(row.invoiceDate), dueDate: row.dueDate ? asDate(row.dueDate) : null,
          currency: row.currency, amount, sourceOriginalAmount: original, sourcePaidAmount: paid, status: row.status,
        } })
        await tx.dataMigrationRecordLink.create({ data: { tenantId, projectId, importJobId: jobByEntity.get('FINANCE_AR_OPEN_ITEMS')!.id, sourceEntity: 'FINANCE_AR_OPEN_ITEMS', sourceId, targetEntity: 'FINANCE_AR_OPEN_ITEMS', targetId: invoice.id } })
        await recordMigrationInvoiceOpeningRecognition(tx, { tenantId, sourceId: invoice.id, kind: 'AR', amount, currency: row.currency, workspaceCurrency: tenant.currency, postedAt: cutoverDate, actorId, description: `Migrated receivable opening balance: ${row.invoiceNumber || sourceId}` })
      }
      await tx.dataMigrationRecordLink.create({ data: {
        tenantId, projectId, importJobId: jobByEntity.get('FINANCE_OPENING_BALANCE')!.id,
        sourceEntity: 'FINANCE_OPENING_BALANCE', sourceId: `__FINANCE_CUTOVER__:${key}`,
        targetEntity: 'FINANCE_OPENING_BALANCE', targetId: openingJournal.id,
      } })
      await tx.dataMigrationStageBatch.updateMany({ where: { tenantId, projectId, id: { in: [...batchIds] }, status: 'STAGED' }, data: { status: 'COMPLETED', completedAt: new Date() } })
      await recordAuditLog(tx, { tenantId, actorId, action: 'dataMigration.finance.cutover', targetType: 'DataMigrationProject', targetId: projectId, metadata: {
        cutoverAt: dateText, requestHash: key, openingJournalId: openingJournal.id,
        importedPayables: apRows.length, importedReceivables: arRows.length,
        pendingPayablesNotRecognized: apRows.filter(({ row }) => row.status === 'PENDING').length,
        importedTrialBalanceLines: trialRows.length,
      } })
      return {
        replayed: false, cutoverAt: dateText, openingJournalId: openingJournal.id,
        importedPayables: stagedEntityCounts.get('FINANCE_AP_OPEN_ITEMS')!, importedReceivables: stagedEntityCounts.get('FINANCE_AR_OPEN_ITEMS')!,
        pendingPayablesNotRecognized: apRows.filter(({ row }) => row.status === 'PENDING').length,
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'A Finance cutover record was created concurrently. Refresh migration status before retrying.')
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new AppError(409, 'Another transaction changed Finance during cutover. Refresh reconciliation and retry.')
    throw error
  }
}
