import { Prisma, type PrismaClient } from '@prisma/client'
import { divideRounded, getCurrency, Money, rationalFromDecimal } from '@asas/domain'
import { buildPaginationMeta, toPrismaPage, type JournalListQuery, type JournalEntry as JournalEntryContract, type OpeningBalanceWriteInput, type TrialBalance } from '@asas/contracts'
import { AppError } from '../../utils/errors.js'

type LedgerClient = PrismaClient | Prisma.TransactionClient
const accounts = {
  CASH_CLEARING: { name: 'Manually recorded cash clearing', kind: 'ASSET' },
  ACCOUNTS_PAYABLE: { name: 'Accounts payable control', kind: 'LIABILITY' },
  ACCOUNTS_RECEIVABLE: { name: 'Accounts receivable control', kind: 'ASSET' },
  UNCLASSIFIED_EXPENSE: { name: 'Unclassified operating expense', kind: 'EXPENSE' },
  UNCLASSIFIED_REVENUE: { name: 'Unclassified revenue', kind: 'INCOME' },
  DISBURSEMENT_CLEARING: { name: 'Unclassified cash disbursements', kind: 'ASSET' },
  RECEIPT_CLEARING: { name: 'Unclassified cash receipts', kind: 'LIABILITY' },
  PAYROLL_CLEARING: { name: 'Unclassified payroll settlements', kind: 'LIABILITY' },
  REIMBURSEMENT_CLEARING: { name: 'Unclassified reimbursements', kind: 'LIABILITY' },
  FX_GAIN: { name: 'Realized foreign exchange gain', kind: 'INCOME' },
  FX_LOSS: { name: 'Realized foreign exchange loss', kind: 'EXPENSE' },
} as const

async function resolveFxRate(client: LedgerClient, tenantId: string, currency: string, baseCurrency: string, postedAt: Date) {
  if (currency === baseCurrency) return { rate: new Prisma.Decimal(1), exchangeRateId: null as string | null }
  const quote = await client.exchangeRate.findFirst({
    where: { tenantId, currency, effectiveAt: { lte: postedAt } },
    orderBy: [{ effectiveAt: 'desc' }, { id: 'desc' }],
    select: { id: true, rateToBase: true },
  })
  if (!quote) throw new AppError(409, `No ${currency}/${baseCurrency} FX rate exists on or before ${postedAt.toISOString()}`)
  return { rate: quote.rateToBase, exchangeRateId: quote.id }
}

function convertToBase(amount: string, currency: string, baseCurrency: string, rate: Prisma.Decimal): Money {
  const source = Money.fromDecimal(amount, currency)
  const rateRatio = rationalFromDecimal(rate.toString())
  const baseScale = 10n ** BigInt(getCurrency(baseCurrency).minorUnitDigits)
  const sourceScale = 10n ** BigInt(source.scale)
  const baseMinorUnits = divideRounded(
    source.minorUnits * rateRatio.numerator * baseScale,
    rateRatio.denominator * sourceScale,
    'HALF_UP',
  )
  const sign = baseMinorUnits < 0n ? '-' : ''
  const absolute = baseMinorUnits < 0n ? -baseMinorUnits : baseMinorUnits
  const major = absolute / baseScale
  const fraction = absolute % baseScale
  const digits = getCurrency(baseCurrency).minorUnitDigits
  const decimal = digits === 0 ? `${sign}${major}` : `${sign}${major}.${fraction.toString().padStart(digits, '0')}`
  return Money.fromDecimal(decimal, baseCurrency)
}

function baseJournalFields(amount: string, currency: string, baseCurrency: string, rate: Prisma.Decimal, exchangeRateId: string | null) {
  const baseAmount = convertToBase(amount, currency, baseCurrency, rate)
  return {
    baseCurrency, baseAmount: baseAmount.toDecimalString(),
    baseMinorUnitDigits: getCurrency(baseCurrency).minorUnitDigits,
    fxRate: rate.toString(), exchangeRateId,
  }
}

async function upsertAccount(tx: Prisma.TransactionClient, tenantId: string, currency: string, code: keyof typeof accounts) {
  return tx.ledgerAccount.upsert({
    where: { tenantId_code_currency: { tenantId, code, currency } },
    create: { tenantId, code, currency, ...accounts[code] }, update: {},
  })
}

/** Payment status is manual confirmation, not evidence of a processor or bank transfer. */
export async function recordCashSettlement(tx: Prisma.TransactionClient, input: {
  tenantId: string; sourceId: string; sourceType: 'AP_PAYMENT' | 'AR_COLLECTION' | 'PAYROLL_PAYMENT' | 'EXPENSE_REIMBURSEMENT';
  amount: string; documentCurrency: string | null; workspaceCurrency: string;
  postedAt: Date; actorId: string | null; description: string;
}): Promise<string> {
  const currency = input.documentCurrency ?? input.workspaceCurrency
  let amount: Money
  try { amount = Money.fromDecimal(input.amount, currency) } catch {
    throw new AppError(409, 'The source amount is not exact in its recorded currency; reconcile its precision before settlement')
  }
  if (amount.isNegative()) throw new AppError(400, 'A settlement amount cannot be negative')
  const fx = await resolveFxRate(tx, input.tenantId, currency, input.workspaceCurrency, input.postedAt)
  const settlementBase = convertToBase(amount.toDecimalString(), currency, input.workspaceCurrency, fx.rate)
  const clearingCode = input.sourceType === 'AP_PAYMENT' ? 'ACCOUNTS_PAYABLE'
    : input.sourceType === 'AR_COLLECTION' ? 'ACCOUNTS_RECEIVABLE'
      : input.sourceType === 'PAYROLL_PAYMENT' ? 'PAYROLL_CLEARING' : 'REIMBURSEMENT_CLEARING'
  const cash = await upsertAccount(tx, input.tenantId, currency, 'CASH_CLEARING')
  const clearing = await upsertAccount(tx, input.tenantId, currency, clearingCode)
  const decimal = amount.toDecimalString()
  const lines: Array<{ tenantId: string; accountId: string; side: string; amount: string; baseAmount: string }> = []
  if (input.sourceType === 'AP_PAYMENT' || input.sourceType === 'AR_COLLECTION') {
    const payable = input.sourceType === 'AP_PAYMENT'
    const recognition = await tx.journalEntry.findFirst({
      where: payable
        ? { tenantId: input.tenantId, recognizesPayableInvoiceId: input.sourceId, sourceType: 'AP_RECOGNITION', reversedBy: { is: null } }
        : { tenantId: input.tenantId, recognizesReceivableInvoiceId: input.sourceId, sourceType: 'AR_RECOGNITION', reversedBy: { is: null } },
      select: { amount: true, currency: true, baseAmount: true },
    })
    if (!recognition?.baseAmount || !recognition.amount.eq(decimal) || recognition.currency !== currency) {
      throw new AppError(409, 'A matching, FX-valued invoice recognition is required before settlement')
    }
    const carryingBase = new Prisma.Decimal(recognition.baseAmount.toString())
    lines.push(
      { tenantId: input.tenantId, accountId: payable ? clearing.id : cash.id, side: 'DEBIT', amount: decimal, baseAmount: (payable ? carryingBase : new Prisma.Decimal(settlementBase.toDecimalString())).toString() },
      { tenantId: input.tenantId, accountId: payable ? cash.id : clearing.id, side: 'CREDIT', amount: decimal, baseAmount: (payable ? new Prisma.Decimal(settlementBase.toDecimalString()) : carryingBase).toString() },
    )
    const difference = new Prisma.Decimal(settlementBase.toDecimalString()).minus(carryingBase).abs()
    if (!difference.isZero()) {
      const settlementHigher = new Prisma.Decimal(settlementBase.toDecimalString()).greaterThan(carryingBase)
      const fxCode = payable ? (settlementHigher ? 'FX_LOSS' : 'FX_GAIN') : (settlementHigher ? 'FX_GAIN' : 'FX_LOSS')
      const fxAccount = await upsertAccount(tx, input.tenantId, input.workspaceCurrency, fxCode)
      lines.push({ tenantId: input.tenantId, accountId: fxAccount.id, side: fxCode === 'FX_LOSS' ? 'DEBIT' : 'CREDIT', amount: '0', baseAmount: difference.toString() })
    }
  } else {
    lines.push(
      { tenantId: input.tenantId, accountId: cash.id, side: 'CREDIT', amount: decimal, baseAmount: settlementBase.toDecimalString() },
      { tenantId: input.tenantId, accountId: clearing.id, side: 'DEBIT', amount: decimal, baseAmount: settlementBase.toDecimalString() },
    )
  }
  const entry = await tx.journalEntry.create({ data: {
    tenantId: input.tenantId, currency, amount: decimal, sourceType: input.sourceType,
    ...baseJournalFields(decimal, currency, input.workspaceCurrency, fx.rate, fx.exchangeRateId),
    payableInvoiceId: input.sourceType === 'AP_PAYMENT' ? input.sourceId : null,
    receivableInvoiceId: input.sourceType === 'AR_COLLECTION' ? input.sourceId : null,
    payrollRunId: input.sourceType === 'PAYROLL_PAYMENT' ? input.sourceId : null,
    expenseId: input.sourceType === 'EXPENSE_REIMBURSEMENT' ? input.sourceId : null,
    currencyProvenance: input.documentCurrency == null ? 'WORKSPACE_FALLBACK' : 'DOCUMENT',
    postedAt: input.postedAt, actorId: input.actorId, description: input.description,
  } })
  await tx.journalLine.createMany({ data: lines.map(line => ({ ...line, entryId: entry.id })) })
  return entry.id
}

/** AP invoices are recognized at approval; issued AR invoices are recognized at creation. */
export async function recordInvoiceRecognition(tx: Prisma.TransactionClient, input: {
  tenantId: string; sourceId: string; sourceType: 'AP_RECOGNITION' | 'AR_RECOGNITION';
  amount: string; currency: string; workspaceCurrency: string; postedAt: Date; actorId: string | null; description: string;
}): Promise<string> {
  let amount: Money
  try { amount = Money.fromDecimal(input.amount, input.currency) } catch {
    throw new AppError(409, 'The invoice amount is not exact in its recorded currency; reconcile its precision before recognition')
  }
  if (!amount.isPositive()) throw new AppError(400, 'An invoice recognition amount must be positive')
  const recognizedPayable = input.sourceType === 'AP_RECOGNITION'
  const where = {
    tenantId: input.tenantId, sourceType: input.sourceType,
    ...(recognizedPayable ? { recognizesPayableInvoiceId: input.sourceId } : { recognizesReceivableInvoiceId: input.sourceId }),
    reversedBy: { is: null },
  }
  const existing = await tx.journalEntry.findFirst({ where, select: { id: true, amount: true, currency: true, baseAmount: true } })
  if (existing) {
    if (existing.amount.eq(amount.toDecimalString()) && existing.currency === input.currency && existing.baseAmount != null) return existing.id
    await reverseCashSettlement(tx, {
      tenantId: input.tenantId, sourceId: input.sourceId, sourceType: input.sourceType,
      reason: existing.baseAmount == null ? 'Invoice recognition FX basis recorded' : 'Invoice amount corrected', actorId: input.actorId, postedAt: input.postedAt,
    })
  }
  const fx = await resolveFxRate(tx, input.tenantId, input.currency, input.workspaceCurrency, input.postedAt)
  const basis = baseJournalFields(amount.toDecimalString(), input.currency, input.workspaceCurrency, fx.rate, fx.exchangeRateId)
  const debitCode = recognizedPayable ? 'UNCLASSIFIED_EXPENSE' : 'ACCOUNTS_RECEIVABLE'
  const creditCode = recognizedPayable ? 'ACCOUNTS_PAYABLE' : 'UNCLASSIFIED_REVENUE'
  const [debitAccount, creditAccount] = await Promise.all([debitCode, creditCode].map(async code => {
    const details = accounts[code as keyof typeof accounts]
    return tx.ledgerAccount.upsert({
      where: { tenantId_code_currency: { tenantId: input.tenantId, code, currency: input.currency } },
      create: { tenantId: input.tenantId, code, currency: input.currency, ...details }, update: {},
    })
  }))
  const decimal = amount.toDecimalString()
  const entry = await tx.journalEntry.create({ data: {
    tenantId: input.tenantId, currency: input.currency, amount: decimal, sourceType: input.sourceType, ...basis,
    recognizesPayableInvoiceId: recognizedPayable ? input.sourceId : null,
    recognizesReceivableInvoiceId: recognizedPayable ? null : input.sourceId,
    currencyProvenance: 'DOCUMENT', description: input.description, actorId: input.actorId, postedAt: input.postedAt,
  } })
  await tx.journalLine.createMany({ data: [
    { tenantId: input.tenantId, entryId: entry.id, accountId: debitAccount!.id, side: 'DEBIT', amount: decimal, baseAmount: basis.baseAmount },
    { tenantId: input.tenantId, entryId: entry.id, accountId: creditAccount!.id, side: 'CREDIT', amount: decimal, baseAmount: basis.baseAmount },
  ] })
  return entry.id
}

export async function reverseCashSettlement(tx: Prisma.TransactionClient, input: {
  tenantId: string; sourceId: string; sourceType: 'AP_PAYMENT' | 'AR_COLLECTION' | 'PAYROLL_PAYMENT' | 'EXPENSE_REIMBURSEMENT' | 'AP_RECOGNITION' | 'AR_RECOGNITION';
  reason: string; actorId: string | null; postedAt: Date;
}): Promise<string> {
  const original = await tx.journalEntry.findFirst({
    where: input.sourceType === 'AP_PAYMENT'
      ? { tenantId: input.tenantId, payableInvoiceId: input.sourceId, sourceType: input.sourceType }
      : input.sourceType === 'AR_COLLECTION'
        ? { tenantId: input.tenantId, receivableInvoiceId: input.sourceId, sourceType: input.sourceType }
        : input.sourceType === 'PAYROLL_PAYMENT'
          ? { tenantId: input.tenantId, payrollRunId: input.sourceId, sourceType: input.sourceType }
          : input.sourceType === 'EXPENSE_REIMBURSEMENT'
            ? { tenantId: input.tenantId, expenseId: input.sourceId, sourceType: input.sourceType }
        : input.sourceType === 'AP_RECOGNITION'
          ? { tenantId: input.tenantId, recognizesPayableInvoiceId: input.sourceId, sourceType: input.sourceType, reversedBy: { is: null } }
          : { tenantId: input.tenantId, recognizesReceivableInvoiceId: input.sourceId, sourceType: input.sourceType, reversedBy: { is: null } },
    include: { lines: true },
  })
  if (!original || original.lines.length < 2) throw new AppError(409, 'A posted journal is required before reversing this source')
  if (await tx.journalEntry.findFirst({ where: { tenantId: input.tenantId, reversesJournalEntryId: original.id }, select: { id: true } })) {
    throw new AppError(409, 'This settlement has already been reversed')
  }
  const reversal = await tx.journalEntry.create({ data: {
    tenantId: input.tenantId, currency: original.currency, amount: original.amount,
    baseCurrency: original.baseCurrency, baseAmount: original.baseAmount, baseMinorUnitDigits: original.baseMinorUnitDigits,
    fxRate: original.fxRate, exchangeRateId: original.exchangeRateId,
    sourceType: 'SETTLEMENT_REVERSAL', reversesJournalEntryId: original.id,
    currencyProvenance: original.currencyProvenance,
    description: `Reversal: ${original.description}`, reversalReason: input.reason.trim(),
    actorId: input.actorId, postedAt: input.postedAt,
  } })
  await tx.journalLine.createMany({ data: original.lines.map(line => ({
    tenantId: input.tenantId, entryId: reversal.id, accountId: line.accountId,
    side: line.side === 'DEBIT' ? 'CREDIT' : 'DEBIT', amount: line.amount, baseAmount: line.baseAmount,
  })) })
  return reversal.id
}

export async function reverseInvoiceRecognitionIfPresent(tx: Prisma.TransactionClient, input: {
  tenantId: string; sourceId: string; sourceType: 'AP_RECOGNITION' | 'AR_RECOGNITION'; actorId: string | null; reason: string;
}): Promise<string | null> {
  const original = await tx.journalEntry.findFirst({
    where: input.sourceType === 'AP_RECOGNITION'
      ? { tenantId: input.tenantId, recognizesPayableInvoiceId: input.sourceId, sourceType: input.sourceType, reversedBy: { is: null } }
      : { tenantId: input.tenantId, recognizesReceivableInvoiceId: input.sourceId, sourceType: input.sourceType, reversedBy: { is: null } },
    select: { id: true },
  })
  if (!original) return null
  return reverseCashSettlement(tx, {
    tenantId: input.tenantId, sourceId: input.sourceId, sourceType: input.sourceType,
    reason: input.reason, actorId: input.actorId, postedAt: new Date(),
  })
}

const include = { lines: { include: { account: { select: { code: true, name: true, kind: true } } }, orderBy: { id: 'asc' as const } } } as const
function mapEntry(entry: Prisma.JournalEntryGetPayload<{ include: typeof include }>): JournalEntryContract {
  return {
    id: entry.id, sourceType: entry.sourceType as JournalEntryContract['sourceType'],
    sourceId: entry.payableInvoiceId ?? entry.receivableInvoiceId ?? entry.payrollRunId ?? entry.expenseId ?? entry.recognizesPayableInvoiceId ?? entry.recognizesReceivableInvoiceId ?? entry.reversesJournalEntryId ?? entry.id,
    currencyProvenance: entry.currencyProvenance as JournalEntryContract['currencyProvenance'],
    amount: Money.fromDecimal(entry.amount.toString(), entry.currency).toWire(),
    baseCurrency: entry.baseCurrency,
    baseAmount: entry.baseAmount == null || entry.baseCurrency == null ? null : Money.fromDecimal(entry.baseAmount.toString(), entry.baseCurrency).toWire(),
    exchangeRate: entry.fxRate?.toString() ?? null,
    description: entry.description, reversalReason: entry.reversalReason, actorId: entry.actorId, postedAt: entry.postedAt.toISOString(),
    lines: entry.lines.map(line => ({
      id: line.id, accountCode: line.account.code, accountName: line.account.name,
      side: line.side as 'DEBIT' | 'CREDIT', amount: Money.fromDecimal(line.amount.toString(), entry.currency).toWire(),
      baseAmount: line.baseAmount == null || entry.baseCurrency == null ? null : Money.fromDecimal(line.baseAmount.toString(), entry.baseCurrency).toWire(),
    })),
  }
}
export async function listJournals(prisma: LedgerClient, tenantId: string, query: JournalListQuery) {
  const where = { tenantId, ...(query.sourceType && { sourceType: query.sourceType }) }
  const { skip, take } = toPrismaPage(query)
  const [rows, total] = await Promise.all([
    prisma.journalEntry.findMany({ where, skip, take, orderBy: [{ postedAt: 'desc' }, { id: 'desc' }], include }),
    prisma.journalEntry.count({ where }),
  ])
  return { items: rows.map(mapEntry), pagination: buildPaginationMeta(query, total) }
}
export async function getJournal(prisma: LedgerClient, tenantId: string, id: string) {
  const entry = await prisma.journalEntry.findFirst({ where: { id, tenantId }, include })
  if (!entry) throw new AppError(404, 'Journal entry not found')
  return mapEntry(entry)
}

/** Post one immutable, base-currency opening balance before any other tenant journal exists. */
export async function postOpeningBalance(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actorId: string,
  input: OpeningBalanceWriteInput,
): Promise<JournalEntryContract> {
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')
  if (await tx.journalEntry.count({ where: { tenantId } })) {
    throw new AppError(409, 'Opening balances can only be posted before the first ledger journal')
  }

  const currency = tenant.currency
  const postedAt = new Date(`${input.asOf}T00:00:00.000Z`)
  let debitTotal = new Prisma.Decimal(0)
  let creditTotal = new Prisma.Decimal(0)
  const lines: Array<{ accountId: string; side: 'DEBIT' | 'CREDIT'; amount: string; baseAmount: string }> = []

  for (const line of input.lines) {
    let amount: Money
    try { amount = Money.fromDecimal(line.amount, currency) } catch {
      throw new AppError(400, `Opening amount for ${line.code} is not exact in ${currency}`)
    }
    if (!amount.isPositive()) throw new AppError(400, `Opening amount for ${line.code} must be positive`)
    const decimal = amount.toDecimalString()
    const key = { tenantId_code_currency: { tenantId, code: line.code, currency } }
    const existing = await tx.ledgerAccount.findUnique({ where: key })
    if (existing && (existing.name !== line.name.trim() || existing.kind !== line.kind)) {
      throw new AppError(409, `Account code ${line.code} already exists with a different name or type`)
    }
    const account = existing ?? await tx.ledgerAccount.create({
      data: { tenantId, code: line.code, currency, name: line.name.trim(), kind: line.kind },
    })
    lines.push({ accountId: account.id, side: line.side, amount: decimal, baseAmount: decimal })
    if (line.side === 'DEBIT') debitTotal = debitTotal.plus(decimal)
    else creditTotal = creditTotal.plus(decimal)
  }

  if (debitTotal.isZero() || !debitTotal.eq(creditTotal)) {
    throw new AppError(400, 'Opening balance debits and credits must be equal and greater than zero')
  }
  const amount = debitTotal.toFixed(4)
  const entry = await tx.journalEntry.create({ data: {
    tenantId, currency, amount, baseCurrency: currency, baseAmount: amount,
    baseMinorUnitDigits: getCurrency(currency).minorUnitDigits, fxRate: '1', exchangeRateId: null,
    sourceType: 'OPENING_BALANCE', currencyProvenance: 'MANUAL_BASE', description: input.description.trim(),
    actorId, postedAt,
  } })
  await tx.journalLine.createMany({ data: lines.map(line => ({ ...line, tenantId, entryId: entry.id })) })
  return getJournal(tx, tenantId, entry.id)
}

/** Base-currency trial balance through an inclusive calendar date, with legacy gaps disclosed. */
export async function trialBalance(prisma: LedgerClient, tenantId: string, asOf: string): Promise<TrialBalance> {
  const asOfDate = new Date(`${asOf}T00:00:00.000Z`)
  const [tenant, rows, unvaluedJournalCount] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } }),
    prisma.$queryRaw<Array<{
      accountId: string; accountCode: string; accountName: string; accountKind: string; currency: string
      debit: Prisma.Decimal; credit: Prisma.Decimal; debitBase: Prisma.Decimal; creditBase: Prisma.Decimal
    }>>`
      SELECT account."id" AS "accountId", account."code" AS "accountCode", account."name" AS "accountName",
        account."kind" AS "accountKind", account."currency",
        COALESCE(sum(line."amount") FILTER (WHERE entry."id" IS NOT NULL AND line."side" = 'DEBIT'), 0) AS "debit",
        COALESCE(sum(line."amount") FILTER (WHERE entry."id" IS NOT NULL AND line."side" = 'CREDIT'), 0) AS "credit",
        COALESCE(sum(line."baseAmount") FILTER (WHERE entry."id" IS NOT NULL AND line."side" = 'DEBIT'), 0) AS "debitBase",
        COALESCE(sum(line."baseAmount") FILTER (WHERE entry."id" IS NOT NULL AND line."side" = 'CREDIT'), 0) AS "creditBase"
      FROM "LedgerAccount" account
      LEFT JOIN "JournalLine" line ON line."accountId" = account."id" AND line."tenantId" = account."tenantId"
      LEFT JOIN "JournalEntry" entry ON entry."id" = line."entryId" AND entry."tenantId" = account."tenantId"
        AND entry."postedAt" < (${asOfDate}::date + INTERVAL '1 day')
      WHERE account."tenantId" = ${tenantId}
      GROUP BY account."id", account."code", account."name", account."kind", account."currency"
      ORDER BY account."code", account."currency"
    `,
    prisma.journalEntry.count({ where: { tenantId, postedAt: { lt: new Date(asOfDate.getTime() + 86_400_000) }, baseAmount: null } }),
  ])
  if (!tenant) throw new AppError(404, 'Workspace not found')
  const baseCurrency = tenant.currency
  const zero = new Prisma.Decimal(0)
  const totalDebit = rows.reduce((sum, row) => sum.plus(row.debitBase), zero)
  const totalCredit = rows.reduce((sum, row) => sum.plus(row.creditBase), zero)
  const netDebitBase = (row: typeof rows[number]) => Prisma.Decimal.max(row.debitBase.minus(row.creditBase), 0)
  const netCreditBase = (row: typeof rows[number]) => Prisma.Decimal.max(row.creditBase.minus(row.debitBase), 0)
  const wire = (value: Prisma.Decimal, currency: string) => Money.fromDecimal(value.toString(), currency, 'DOWN').toWire()
  return {
    asOf, baseCurrency,
    rows: rows.map(row => ({
      accountId: row.accountId, accountCode: row.accountCode, accountName: row.accountName,
      accountKind: row.accountKind as 'ASSET' | 'LIABILITY' | 'EXPENSE' | 'INCOME', currency: row.currency,
      debit: wire(row.debit, row.currency), credit: wire(row.credit, row.currency),
      debitBase: wire(row.debitBase, baseCurrency), creditBase: wire(row.creditBase, baseCurrency),
      netDebitBase: wire(netDebitBase(row), baseCurrency), netCreditBase: wire(netCreditBase(row), baseCurrency),
    })),
    totalDebitBase: wire(totalDebit, baseCurrency), totalCreditBase: wire(totalCredit, baseCurrency),
    unvaluedJournalCount, isComplete: unvaluedJournalCount === 0,
  }
}

/** Only recorded AP/AR/payroll/reimbursement settlements; legacy snapshots are not mixed into these sums. */
export async function settlementCashFlow(prisma: LedgerClient, tenantId: string, currency: string, timezone = 'UTC') {
  const rows = await prisma.$queryRaw<Array<{ month: string; inflow: Prisma.Decimal; outflow: Prisma.Decimal }>>`
    SELECT to_char(entry."postedAt" AT TIME ZONE ${timezone}, 'YYYY-MM') AS month,
      COALESCE(sum(entry."baseAmount") FILTER (WHERE entry."sourceType" = 'AR_COLLECTION' OR (entry."sourceType" = 'SETTLEMENT_REVERSAL' AND original."sourceType" IN ('AP_PAYMENT', 'PAYROLL_PAYMENT', 'EXPENSE_REIMBURSEMENT'))), 0) AS inflow,
      COALESCE(sum(entry."baseAmount") FILTER (WHERE entry."sourceType" IN ('AP_PAYMENT', 'PAYROLL_PAYMENT', 'EXPENSE_REIMBURSEMENT') OR (entry."sourceType" = 'SETTLEMENT_REVERSAL' AND original."sourceType" = 'AR_COLLECTION')), 0) AS outflow
    FROM "JournalEntry" entry LEFT JOIN "JournalEntry" original ON original."id" = entry."reversesJournalEntryId"
    WHERE entry."tenantId" = ${tenantId} AND entry."baseCurrency" = ${currency} AND entry."baseAmount" IS NOT NULL
    GROUP BY month ORDER BY month
  `
  return rows.map(row => {
    const inflow = Money.fromDecimal(row.inflow.toString(), currency, 'HALF_UP')
    const outflow = Money.fromDecimal(row.outflow.toString(), currency, 'HALF_UP')
    return { month: row.month, inflow: inflow.toWire(), outflow: outflow.toWire(), net: inflow.subtract(outflow).toWire() }
  })
}

export async function settlementCashFlowComparison(
  prisma: LedgerClient,
  tenantId: string,
  currency: string,
  timezone: string,
  currentStart: string,
  currentEndExclusive: string,
  previousStart: string,
  previousEndExclusive: string,
) {
  const rows = await prisma.$queryRaw<Array<{
    currentInflow: Prisma.Decimal; currentOutflow: Prisma.Decimal;
    previousInflow: Prisma.Decimal; previousOutflow: Prisma.Decimal;
  }>>`
    WITH bounds AS (
      SELECT
        (${currentStart}::date::timestamp AT TIME ZONE ${timezone}) AS current_start,
        (${currentEndExclusive}::date::timestamp AT TIME ZONE ${timezone}) AS current_end,
        (${previousStart}::date::timestamp AT TIME ZONE ${timezone}) AS previous_start,
        (${previousEndExclusive}::date::timestamp AT TIME ZONE ${timezone}) AS previous_end
    )
    SELECT
      COALESCE(sum(entry."baseAmount") FILTER (WHERE entry."postedAt" >= bounds.current_start AND entry."postedAt" < bounds.current_end
        AND (entry."sourceType" = 'AR_COLLECTION' OR (entry."sourceType" = 'SETTLEMENT_REVERSAL' AND original."sourceType" IN ('AP_PAYMENT', 'PAYROLL_PAYMENT', 'EXPENSE_REIMBURSEMENT')))), 0) AS "currentInflow",
      COALESCE(sum(entry."baseAmount") FILTER (WHERE entry."postedAt" >= bounds.current_start AND entry."postedAt" < bounds.current_end
        AND (entry."sourceType" IN ('AP_PAYMENT', 'PAYROLL_PAYMENT', 'EXPENSE_REIMBURSEMENT') OR (entry."sourceType" = 'SETTLEMENT_REVERSAL' AND original."sourceType" = 'AR_COLLECTION'))), 0) AS "currentOutflow",
      COALESCE(sum(entry."baseAmount") FILTER (WHERE entry."postedAt" >= bounds.previous_start AND entry."postedAt" < bounds.previous_end
        AND (entry."sourceType" = 'AR_COLLECTION' OR (entry."sourceType" = 'SETTLEMENT_REVERSAL' AND original."sourceType" IN ('AP_PAYMENT', 'PAYROLL_PAYMENT', 'EXPENSE_REIMBURSEMENT')))), 0) AS "previousInflow",
      COALESCE(sum(entry."baseAmount") FILTER (WHERE entry."postedAt" >= bounds.previous_start AND entry."postedAt" < bounds.previous_end
        AND (entry."sourceType" IN ('AP_PAYMENT', 'PAYROLL_PAYMENT', 'EXPENSE_REIMBURSEMENT') OR (entry."sourceType" = 'SETTLEMENT_REVERSAL' AND original."sourceType" = 'AR_COLLECTION'))), 0) AS "previousOutflow"
    FROM "JournalEntry" entry
    CROSS JOIN bounds
    LEFT JOIN "JournalEntry" original ON original."id" = entry."reversesJournalEntryId"
    WHERE entry."tenantId" = ${tenantId} AND entry."baseCurrency" = ${currency} AND entry."baseAmount" IS NOT NULL
      AND entry."postedAt" >= LEAST(bounds.current_start, bounds.previous_start)
      AND entry."postedAt" < GREATEST(bounds.current_end, bounds.previous_end)
  `
  const row = rows[0]
  const period = (startDate: string, endDateExclusive: string, inflowDecimal: Prisma.Decimal, outflowDecimal: Prisma.Decimal) => {
    const inflow = Money.fromDecimal(inflowDecimal.toString(), currency, 'HALF_UP')
    const outflow = Money.fromDecimal(outflowDecimal.toString(), currency, 'HALF_UP')
    return { startDate, endDateExclusive, inflow: inflow.toWire(), outflow: outflow.toWire(), net: inflow.subtract(outflow).toWire() }
  }
  const zero = new Prisma.Decimal(0)
  return {
    current: period(currentStart, currentEndExclusive, row?.currentInflow ?? zero, row?.currentOutflow ?? zero),
    previous: period(previousStart, previousEndExclusive, row?.previousInflow ?? zero, row?.previousOutflow ?? zero),
  }
}

/** AP cash paid in a tenant-local period, net of linked payment reversals, in base currency. */
export async function payableSettlementComparison(
  prisma: LedgerClient,
  tenantId: string,
  currency: string,
  timezone: string,
  currentStart: string,
  currentEndExclusive: string,
  previousStart: string,
  previousEndExclusive: string,
) {
  const rows = await prisma.$queryRaw<Array<{
    currentTotal: Prisma.Decimal | null
    previousTotal: Prisma.Decimal | null
  }>>`
    WITH bounds AS (
      SELECT
        (${currentStart}::date::timestamp AT TIME ZONE ${timezone}) AS current_start,
        (${currentEndExclusive}::date::timestamp AT TIME ZONE ${timezone}) AS current_end,
        (${previousStart}::date::timestamp AT TIME ZONE ${timezone}) AS previous_start,
        (${previousEndExclusive}::date::timestamp AT TIME ZONE ${timezone}) AS previous_end
    )
    SELECT
      CASE WHEN coverage."startsAt" <= (bounds.current_start AT TIME ZONE 'UTC') THEN
      COALESCE(sum(entry."baseAmount") FILTER (
        WHERE entry."sourceType" = 'AP_PAYMENT'
          AND entry."postedAt" >= bounds.current_start AND entry."postedAt" < bounds.current_end
      ), 0) - COALESCE(sum(entry."baseAmount") FILTER (
        WHERE entry."sourceType" = 'SETTLEMENT_REVERSAL' AND original."sourceType" = 'AP_PAYMENT'
          AND entry."postedAt" >= bounds.current_start AND entry."postedAt" < bounds.current_end
      ), 0) ELSE NULL::numeric END AS "currentTotal",
      CASE WHEN coverage."startsAt" <= (bounds.previous_start AT TIME ZONE 'UTC') THEN
        COALESCE(sum(entry."baseAmount") FILTER (
          WHERE entry."sourceType" = 'AP_PAYMENT'
            AND entry."postedAt" >= bounds.previous_start AND entry."postedAt" < bounds.previous_end
        ), 0) - COALESCE(sum(entry."baseAmount") FILTER (
          WHERE entry."sourceType" = 'SETTLEMENT_REVERSAL' AND original."sourceType" = 'AP_PAYMENT'
            AND entry."postedAt" >= bounds.previous_start AND entry."postedAt" < bounds.previous_end
        ), 0)
      ELSE NULL::numeric END AS "previousTotal"
    FROM "SettlementHistoryCoverage" AS coverage
    CROSS JOIN bounds
    LEFT JOIN "JournalEntry" AS entry ON entry."tenantId" = coverage."tenantId"
      AND entry."baseCurrency" = ${currency} AND entry."baseAmount" IS NOT NULL
      AND entry."postedAt" >= LEAST(bounds.current_start, bounds.previous_start)
      AND entry."postedAt" < GREATEST(bounds.current_end, bounds.previous_end)
    LEFT JOIN "JournalEntry" AS original ON original."id" = entry."reversesJournalEntryId"
      AND original."tenantId" = entry."tenantId"
    WHERE coverage."tenantId" = ${tenantId}
    GROUP BY coverage."startsAt", bounds.current_start, bounds.current_end, bounds.previous_start, bounds.previous_end
  `
  const row = rows[0]
  const wire = (amount: Prisma.Decimal | null) => amount == null
    ? null
    : Money.fromDecimal(amount.toString(), currency, 'HALF_UP').toWire()
  return {
    currentTotal: wire(row?.currentTotal ?? null),
    previousTotal: wire(row?.previousTotal ?? null),
  }
}

/** AR cash collected in a tenant-local period, net of linked collection reversals, in base currency. */
export async function receivableSettlementComparison(
  prisma: LedgerClient,
  tenantId: string,
  currency: string,
  timezone: string,
  currentStart: string,
  currentEndExclusive: string,
  previousStart: string,
  previousEndExclusive: string,
) {
  const rows = await prisma.$queryRaw<Array<{
    currentTotal: Prisma.Decimal | null
    previousTotal: Prisma.Decimal | null
  }>>`
    WITH bounds AS (
      SELECT
        (${currentStart}::date::timestamp AT TIME ZONE ${timezone}) AS current_start,
        (${currentEndExclusive}::date::timestamp AT TIME ZONE ${timezone}) AS current_end,
        (${previousStart}::date::timestamp AT TIME ZONE ${timezone}) AS previous_start,
        (${previousEndExclusive}::date::timestamp AT TIME ZONE ${timezone}) AS previous_end
    )
    SELECT
      CASE WHEN coverage."startsAt" <= (bounds.current_start AT TIME ZONE 'UTC') THEN
        COALESCE(sum(entry."baseAmount") FILTER (
          WHERE entry."sourceType" = 'AR_COLLECTION'
            AND entry."postedAt" >= bounds.current_start AND entry."postedAt" < bounds.current_end
        ), 0) - COALESCE(sum(entry."baseAmount") FILTER (
          WHERE entry."sourceType" = 'SETTLEMENT_REVERSAL' AND original."sourceType" = 'AR_COLLECTION'
            AND entry."postedAt" >= bounds.current_start AND entry."postedAt" < bounds.current_end
        ), 0)
      ELSE NULL::numeric END AS "currentTotal",
      CASE WHEN coverage."startsAt" <= (bounds.previous_start AT TIME ZONE 'UTC') THEN
        COALESCE(sum(entry."baseAmount") FILTER (
          WHERE entry."sourceType" = 'AR_COLLECTION'
            AND entry."postedAt" >= bounds.previous_start AND entry."postedAt" < bounds.previous_end
        ), 0) - COALESCE(sum(entry."baseAmount") FILTER (
          WHERE entry."sourceType" = 'SETTLEMENT_REVERSAL' AND original."sourceType" = 'AR_COLLECTION'
            AND entry."postedAt" >= bounds.previous_start AND entry."postedAt" < bounds.previous_end
        ), 0)
      ELSE NULL::numeric END AS "previousTotal"
    FROM "SettlementHistoryCoverage" AS coverage
    CROSS JOIN bounds
    LEFT JOIN "JournalEntry" AS entry ON entry."tenantId" = coverage."tenantId"
      AND entry."baseCurrency" = ${currency} AND entry."baseAmount" IS NOT NULL
      AND entry."postedAt" >= LEAST(bounds.current_start, bounds.previous_start)
      AND entry."postedAt" < GREATEST(bounds.current_end, bounds.previous_end)
    LEFT JOIN "JournalEntry" AS original ON original."id" = entry."reversesJournalEntryId"
      AND original."tenantId" = entry."tenantId"
    WHERE coverage."tenantId" = ${tenantId}
    GROUP BY coverage."startsAt", bounds.current_start, bounds.current_end, bounds.previous_start, bounds.previous_end
  `
  const row = rows[0]
  const wire = (amount: Prisma.Decimal | null) => amount == null
    ? null
    : Money.fromDecimal(amount.toString(), currency, 'HALF_UP').toWire()
  return {
    currentTotal: wire(row?.currentTotal ?? null),
    previousTotal: wire(row?.previousTotal ?? null),
  }
}

/** Payroll cash paid in a tenant-local period, net of linked payment reversals, in base currency. */
export async function payrollSettlementComparison(
  prisma: LedgerClient,
  tenantId: string,
  currency: string,
  timezone: string,
  currentStart: string,
  currentEndExclusive: string,
  previousStart: string,
  previousEndExclusive: string,
) {
  const rows = await prisma.$queryRaw<Array<{
    currentTotal: Prisma.Decimal | null
    previousTotal: Prisma.Decimal | null
  }>>`
    WITH bounds AS (
      SELECT
        (${currentStart}::date::timestamp AT TIME ZONE ${timezone}) AS current_start,
        (${currentEndExclusive}::date::timestamp AT TIME ZONE ${timezone}) AS current_end,
        (${previousStart}::date::timestamp AT TIME ZONE ${timezone}) AS previous_start,
        (${previousEndExclusive}::date::timestamp AT TIME ZONE ${timezone}) AS previous_end
    )
    SELECT
      CASE WHEN coverage."startsAt" <= (bounds.current_start AT TIME ZONE 'UTC') THEN
        COALESCE(sum(entry."baseAmount") FILTER (
          WHERE entry."sourceType" = 'PAYROLL_PAYMENT'
            AND entry."postedAt" >= bounds.current_start AND entry."postedAt" < bounds.current_end
        ), 0) - COALESCE(sum(entry."baseAmount") FILTER (
          WHERE entry."sourceType" = 'SETTLEMENT_REVERSAL' AND original."sourceType" = 'PAYROLL_PAYMENT'
            AND entry."postedAt" >= bounds.current_start AND entry."postedAt" < bounds.current_end
        ), 0)
      ELSE NULL::numeric END AS "currentTotal",
      CASE WHEN coverage."startsAt" <= (bounds.previous_start AT TIME ZONE 'UTC') THEN
        COALESCE(sum(entry."baseAmount") FILTER (
          WHERE entry."sourceType" = 'PAYROLL_PAYMENT'
            AND entry."postedAt" >= bounds.previous_start AND entry."postedAt" < bounds.previous_end
        ), 0) - COALESCE(sum(entry."baseAmount") FILTER (
          WHERE entry."sourceType" = 'SETTLEMENT_REVERSAL' AND original."sourceType" = 'PAYROLL_PAYMENT'
            AND entry."postedAt" >= bounds.previous_start AND entry."postedAt" < bounds.previous_end
        ), 0)
      ELSE NULL::numeric END AS "previousTotal"
    FROM "SettlementHistoryCoverage" AS coverage
    CROSS JOIN bounds
    LEFT JOIN "JournalEntry" AS entry ON entry."tenantId" = coverage."tenantId"
      AND entry."baseCurrency" = ${currency} AND entry."baseAmount" IS NOT NULL
      AND entry."postedAt" >= LEAST(bounds.current_start, bounds.previous_start)
      AND entry."postedAt" < GREATEST(bounds.current_end, bounds.previous_end)
    LEFT JOIN "JournalEntry" AS original ON original."id" = entry."reversesJournalEntryId"
      AND original."tenantId" = entry."tenantId"
    WHERE coverage."tenantId" = ${tenantId}
    GROUP BY coverage."startsAt", bounds.current_start, bounds.current_end, bounds.previous_start, bounds.previous_end
  `
  const row = rows[0]
  const wire = (amount: Prisma.Decimal | null) => amount == null
    ? null
    : Money.fromDecimal(amount.toString(), currency, 'HALF_UP').toWire()
  return {
    currentTotal: wire(row?.currentTotal ?? null),
    previousTotal: wire(row?.previousTotal ?? null),
  }
}

/** Expense reimbursements posted in a tenant-local period, net of linked reversals, in base currency. */
export async function expenseSettlementComparison(
  prisma: LedgerClient,
  tenantId: string,
  currency: string,
  timezone: string,
  currentStart: string,
  currentEndExclusive: string,
  previousStart: string,
  previousEndExclusive: string,
) {
  const rows = await prisma.$queryRaw<Array<{
    currentTotal: Prisma.Decimal | null
    previousTotal: Prisma.Decimal | null
  }>>`
    WITH bounds AS (
      SELECT
        (${currentStart}::date::timestamp AT TIME ZONE ${timezone}) AS current_start,
        (${currentEndExclusive}::date::timestamp AT TIME ZONE ${timezone}) AS current_end,
        (${previousStart}::date::timestamp AT TIME ZONE ${timezone}) AS previous_start,
        (${previousEndExclusive}::date::timestamp AT TIME ZONE ${timezone}) AS previous_end
    )
    SELECT
      CASE WHEN coverage."startsAt" <= (bounds.current_start AT TIME ZONE 'UTC') THEN
      COALESCE(sum(entry."baseAmount") FILTER (
        WHERE entry."sourceType" = 'EXPENSE_REIMBURSEMENT'
          AND entry."postedAt" >= bounds.current_start AND entry."postedAt" < bounds.current_end
      ), 0) - COALESCE(sum(entry."baseAmount") FILTER (
        WHERE entry."sourceType" = 'SETTLEMENT_REVERSAL' AND original."sourceType" = 'EXPENSE_REIMBURSEMENT'
          AND entry."postedAt" >= bounds.current_start AND entry."postedAt" < bounds.current_end
      ), 0) ELSE NULL::numeric END AS "currentTotal",
      CASE WHEN coverage."startsAt" <= (bounds.previous_start AT TIME ZONE 'UTC') THEN
        COALESCE(sum(entry."baseAmount") FILTER (
          WHERE entry."sourceType" = 'EXPENSE_REIMBURSEMENT'
            AND entry."postedAt" >= bounds.previous_start AND entry."postedAt" < bounds.previous_end
        ), 0) - COALESCE(sum(entry."baseAmount") FILTER (
          WHERE entry."sourceType" = 'SETTLEMENT_REVERSAL' AND original."sourceType" = 'EXPENSE_REIMBURSEMENT'
            AND entry."postedAt" >= bounds.previous_start AND entry."postedAt" < bounds.previous_end
        ), 0)
      ELSE NULL::numeric END AS "previousTotal"
    FROM "SettlementHistoryCoverage" AS coverage
    CROSS JOIN bounds
    LEFT JOIN "JournalEntry" AS entry ON entry."tenantId" = coverage."tenantId"
      AND entry."baseCurrency" = ${currency} AND entry."baseAmount" IS NOT NULL
      AND entry."postedAt" >= LEAST(bounds.current_start, bounds.previous_start)
      AND entry."postedAt" < GREATEST(bounds.current_end, bounds.previous_end)
    LEFT JOIN "JournalEntry" AS original ON original."id" = entry."reversesJournalEntryId"
      AND original."tenantId" = entry."tenantId"
    WHERE coverage."tenantId" = ${tenantId}
    GROUP BY coverage."startsAt", bounds.current_start, bounds.current_end, bounds.previous_start, bounds.previous_end
  `
  const row = rows[0]
  const wire = (amount: Prisma.Decimal | null) => amount == null
    ? null
    : Money.fromDecimal(amount.toString(), currency, 'HALF_UP').toWire()
  return {
    currentTotal: wire(row?.currentTotal ?? null),
    previousTotal: wire(row?.previousTotal ?? null),
  }
}

export async function recentSettlements(prisma: LedgerClient, tenantId: string) {
  const rows = await prisma.journalEntry.findMany({
    where: { tenantId, sourceType: { in: ['AP_PAYMENT', 'AR_COLLECTION', 'PAYROLL_PAYMENT', 'EXPENSE_REIMBURSEMENT', 'SETTLEMENT_REVERSAL'] } },
    orderBy: [{ postedAt: 'desc' }, { id: 'desc' }], take: 20,
    include: { reverses: { select: { sourceType: true } } },
  })
  return rows.map(row => ({
    id: row.id, date: row.postedAt.toISOString(), description: row.description,
    amount: Money.fromDecimal(row.amount.toString(), row.currency).toWire(),
    type: row.sourceType === 'AR_COLLECTION' || (row.sourceType === 'SETTLEMENT_REVERSAL' && row.reverses?.sourceType !== 'AR_COLLECTION') ? 'credit' as const : 'debit' as const,
    status: 'RECORDED' as const,
  }))
}
