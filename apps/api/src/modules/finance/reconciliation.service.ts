import { createHash } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import type { BankStatementImportRequest } from '@asas/contracts'
import { AppError } from '../../utils/errors.js'

type ReconciliationClient = PrismaClient | Prisma.TransactionClient
const cashSettlementTypes = ['AP_PAYMENT', 'AR_COLLECTION', 'PAYROLL_PAYMENT', 'EXPENSE_REIMBURSEMENT']
const MATCH_WINDOW_DAYS = 3
const DAY_MS = 86_400_000

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function calendarDaysApart(left: Date, right: Date): number {
  const utcDay = (value: Date) => Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  return Math.abs(Math.round((utcDay(left) - utcDay(right)) / DAY_MS))
}

function safeFileName(value: string): string {
  const name = value.replace(/\\/g, '/').split('/').pop()?.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!name) throw new AppError(400, 'A statement file name is required')
  return name.slice(0, 120)
}

function rowCanonical(row: BankStatementImportRequest['rows'][number]) {
  return {
    postedAt: row.postedAt,
    description: row.description.trim(),
    reference: row.reference?.trim() || null,
    currency: row.currency.toUpperCase(),
    amount: new Prisma.Decimal(row.amount).toFixed(4),
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Persist normalized statement rows only; the original CSV bytes are never stored. */
export async function importBankStatement(
  prisma: PrismaClient,
  tenantId: string,
  input: BankStatementImportRequest,
  onCreated?: (tx: Prisma.TransactionClient, importId: string) => Promise<void>,
): Promise<{ id: string; created: boolean }> {
  const fileName = safeFileName(input.fileName)
  const rows = input.rows.map(rowCanonical)
  const contentHash = sha256(JSON.stringify(rows))
  const prior = await prisma.bankStatementImport.findUnique({
    where: { tenantId_contentHash: { tenantId, contentHash } },
    select: { id: true },
  })
  if (prior) return { id: prior.id, created: false }

  try {
    const created = await prisma.$transaction(async tx => {
      const batch = await tx.bankStatementImport.create({ data: { tenantId, fileName, contentHash } })
      await tx.bankStatementLine.createMany({
        data: rows.map((row, index) => ({
          tenantId,
          importId: batch.id,
          fingerprint: sha256(`${index}:${JSON.stringify(row)}`),
          postedAt: utcDate(row.postedAt),
          description: row.description,
          reference: row.reference,
          currency: row.currency,
          amount: row.amount,
        })),
      })
      await onCreated?.(tx, batch.id)
      return batch.id
    }, { isolationLevel: 'Serializable' })
    return { id: created, created: true }
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const duplicate = await prisma.bankStatementImport.findUnique({
        where: { tenantId_contentHash: { tenantId, contentHash } },
        select: { id: true },
      })
      if (duplicate) return { id: duplicate.id, created: false }
    }
    throw error
  }
}

export async function getBankStatementImport(
  prisma: ReconciliationClient,
  tenantId: string,
  importId: string,
) {
  const batch = await prisma.bankStatementImport.findFirst({
    where: { id: importId, tenantId },
    include: {
      lines: {
        orderBy: [{ postedAt: 'asc' }, { id: 'asc' }],
        include: { matchedJournalLine: { include: { entry: { select: { postedAt: true, description: true, sourceType: true, currency: true } } } } },
      },
    },
  })
  if (!batch) throw new AppError(404, 'Bank statement import not found')

  const dates = batch.lines.map(line => line.postedAt.getTime())
  const currencies = [...new Set(batch.lines.map(line => line.currency))]
  const candidates = dates.length && currencies.length
    ? await prisma.journalLine.findMany({
      where: {
        tenantId,
        bankStatementMatch: null,
        account: { code: 'CASH_CLEARING' },
        entry: {
          tenantId,
          currency: { in: currencies },
          sourceType: { in: cashSettlementTypes },
          postedAt: { gte: new Date(Math.min(...dates) - MATCH_WINDOW_DAYS * DAY_MS), lt: new Date(Math.max(...dates) + (MATCH_WINDOW_DAYS + 1) * DAY_MS) },
          reversedBy: { is: null },
        },
      },
      include: { entry: { select: { postedAt: true, description: true, sourceType: true, currency: true } } },
    })
    : []

  const lines = batch.lines.map(row => {
    const matched = row.matchedJournalLine
    const matchedSignedAmount = matched ? (matched.side === 'DEBIT' ? matched.amount : matched.amount.negated()) : null
    const matchedLedgerLine = matched && matchedSignedAmount ? {
      journalLineId: matched.id,
      postedAt: matched.entry.postedAt.toISOString(),
      description: matched.entry.description,
      sourceType: matched.entry.sourceType,
      currency: matched.entry.currency,
      amount: matched.amount.toString(),
      signedAmount: matchedSignedAmount.toString(),
      daysApart: calendarDaysApart(matched.entry.postedAt, row.postedAt),
    } : null
    const possible = candidates.flatMap(candidate => {
      if (candidate.entry.currency !== row.currency) return []
      const signedAmount = candidate.side === 'DEBIT' ? candidate.amount : candidate.amount.negated()
      if (!signedAmount.eq(row.amount)) return []
      const daysApart = calendarDaysApart(candidate.entry.postedAt, row.postedAt)
      if (daysApart > MATCH_WINDOW_DAYS) return []
      return [{
        journalLineId: candidate.id,
        postedAt: candidate.entry.postedAt.toISOString(),
        description: candidate.entry.description,
        sourceType: candidate.entry.sourceType,
        currency: candidate.entry.currency,
        amount: candidate.amount.toString(),
        signedAmount: signedAmount.toString(),
        daysApart,
      }]
    }).sort((a, b) => a.daysApart - b.daysApart).slice(0, 10)
    return {
      id: row.id,
      postedAt: row.postedAt.toISOString(),
      description: row.description,
      reference: row.reference,
      currency: row.currency,
      amount: row.amount.toString(),
      matchedJournalLineId: row.matchedJournalLineId,
      matchedLedgerLine,
      suggestedMatches: row.matchedJournalLineId ? [] : possible,
    }
  })

  return {
    id: batch.id,
    fileName: batch.fileName,
    createdAt: batch.createdAt.toISOString(),
    lineCount: lines.length,
    matchedCount: lines.filter(line => line.matchedJournalLineId).length,
    lines,
  }
}

export async function confirmBankStatementMatch(
  tx: Prisma.TransactionClient,
  tenantId: string,
  importId: string,
  statementLineId: string,
  journalLineId: string,
) {
    const row = await tx.bankStatementLine.findFirst({ where: { id: statementLineId, importId, tenantId } })
    if (!row) throw new AppError(404, 'Bank statement line not found')
    if (row.matchedJournalLineId) throw new AppError(409, 'This statement line is already reconciled')

    const journalLine = await tx.journalLine.findFirst({
      where: {
        id: journalLineId,
        tenantId,
        bankStatementMatch: null,
        account: { code: 'CASH_CLEARING' },
        entry: {
          tenantId,
          currency: row.currency,
          sourceType: { in: cashSettlementTypes },
          postedAt: { gte: new Date(row.postedAt.getTime() - MATCH_WINDOW_DAYS * DAY_MS), lt: new Date(row.postedAt.getTime() + (MATCH_WINDOW_DAYS + 1) * DAY_MS) },
          reversedBy: { is: null },
        },
      },
      include: { entry: { select: { postedAt: true } } },
    })
    if (!journalLine) throw new AppError(409, 'The selected ledger line is unavailable or outside this statement match window')
    const signedAmount = journalLine.side === 'DEBIT' ? journalLine.amount : journalLine.amount.negated()
    if (!signedAmount.eq(row.amount)) throw new AppError(409, 'The statement and ledger amounts do not match exactly')

    const updated = await tx.bankStatementLine.updateMany({
      where: { id: row.id, tenantId, matchedJournalLineId: null },
      data: { matchedJournalLineId: journalLine.id, matchedAt: new Date() },
    })
    if (updated.count !== 1) throw new AppError(409, 'This statement line was reconciled by another request')
    return { id: row.id, journalLineId: journalLine.id, matchedAt: new Date().toISOString() }
}

export async function undoBankStatementMatch(tx: Prisma.TransactionClient, tenantId: string, importId: string, statementLineId: string) {
  const result = await tx.bankStatementLine.updateMany({
    where: { id: statementLineId, importId, tenantId, matchedJournalLineId: { not: null } },
    data: { matchedJournalLineId: null, matchedAt: null },
  })
  if (result.count !== 1) throw new AppError(404, 'Reconciled bank statement line not found')
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002'
}
