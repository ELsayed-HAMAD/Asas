import { Prisma } from '@prisma/client'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it, vi } from 'vitest'
import { expenseSettlementComparison, payableSettlementComparison, payrollSettlementComparison, receivableSettlementComparison, recordCashSettlement, recordInvoiceRecognition, recentSettlements, settlementCashFlow, settlementCashFlowComparison, trialBalance } from '../src/modules/finance/ledger.service.js'

describe('FX journal posting', () => {
  it('values foreign invoice recognition using the quote effective at recognition time', async () => {
    const created: Record<string, unknown>[] = []
    const lines: Record<string, unknown>[] = []
    const tx = {
      journalEntry: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return { id: 'recognition_1' } }),
      },
      exchangeRate: { findFirst: vi.fn(async () => ({ id: 'eur_1', rateToBase: new Prisma.Decimal('1.2') })) },
      ledgerAccount: { upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: String(create.code) })) },
      journalLine: { createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => { lines.push(...data); return { count: data.length } }) },
    } as unknown as Prisma.TransactionClient

    await recordInvoiceRecognition(tx, {
      tenantId: 'tenant_1', sourceId: 'invoice_1', sourceType: 'AP_RECOGNITION',
      amount: '100.00', currency: 'EUR', workspaceCurrency: 'USD', postedAt: new Date('2026-10-07T10:00:00Z'),
      actorId: 'admin_1', description: 'Recognized bill',
    })

    expect(created[0]).toMatchObject({
      currency: 'EUR', amount: '100.00', baseCurrency: 'USD', baseAmount: '120.00',
      baseMinorUnitDigits: 2, fxRate: '1.2', exchangeRateId: 'eur_1',
    })
    expect(lines.map(line => line.baseAmount)).toEqual(['120.00', '120.00'])
  })

  it('rounds high-precision FX multiplication once without decimal-context precision loss', async () => {
    const quoteNumerator = 1_123_456_789_012n
    const quoteDenominator = 1_000_000_000_000n
    const amountMinor = 12_345_678_901_234_567n
    const baseCents = (amountMinor * quoteNumerator + quoteDenominator / 2n) / quoteDenominator
    const expectedBase = `${baseCents / 100n}.${(baseCents % 100n).toString().padStart(2, '0')}`
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: String(data.baseAmount) }))
    const tx = {
      journalEntry: { findFirst: vi.fn(async () => null), create },
      exchangeRate: { findFirst: vi.fn(async () => ({ id: 'precise_rate', rateToBase: new Prisma.Decimal('1.123456789012') })) },
      ledgerAccount: { upsert: vi.fn(async ({ create: account }: { create: Record<string, unknown> }) => ({ id: String(account.code) })) },
      journalLine: { createMany: vi.fn(async () => ({ count: 2 })) },
    } as unknown as Prisma.TransactionClient
    await recordInvoiceRecognition(tx, {
      tenantId: 'tenant_1', sourceId: 'invoice_2', sourceType: 'AR_RECOGNITION',
      amount: '123456789012345.67', currency: 'EUR', workspaceCurrency: 'USD', postedAt: new Date('2026-10-07T10:00:00Z'),
      actorId: null, description: 'Precise amount',
    })
    expect(create.mock.calls[0]?.[0].data.baseAmount).toBe(expectedBase)
  })

  it('posts settlement carrying value, cash value, and realized FX loss in base currency', async () => {
    const entryData: Record<string, unknown>[] = []
    const lines: Record<string, unknown>[] = []
    const tx = {
      exchangeRate: { findFirst: vi.fn(async () => ({ id: 'eur_2', rateToBase: new Prisma.Decimal('1.32') })) },
      ledgerAccount: { upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: `${create.code}_${create.currency}` })) },
      journalEntry: {
        findFirst: vi.fn(async () => ({ amount: new Prisma.Decimal('100'), currency: 'EUR', baseAmount: new Prisma.Decimal('120') })),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { entryData.push(data); return { id: 'payment_1' } }),
      },
      journalLine: { createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => { lines.push(...data); return { count: data.length } }) },
    } as unknown as Prisma.TransactionClient

    await recordCashSettlement(tx, {
      tenantId: 'tenant_1', sourceId: 'invoice_1', sourceType: 'AP_PAYMENT', amount: '100.00',
      documentCurrency: 'EUR', workspaceCurrency: 'USD', postedAt: new Date('2026-10-07T12:00:00Z'),
      actorId: 'admin_1', description: 'Paid bill',
    })

    expect(entryData[0]).toMatchObject({ baseCurrency: 'USD', baseAmount: '132.00', fxRate: '1.32', exchangeRateId: 'eur_2' })
    expect(lines).toEqual([
      expect.objectContaining({ side: 'DEBIT', amount: '100.00', baseAmount: '120' }),
      expect.objectContaining({ side: 'CREDIT', amount: '100.00', baseAmount: '132' }),
      expect.objectContaining({ side: 'DEBIT', amount: '0', baseAmount: '12', accountId: 'FX_LOSS_USD' }),
    ])
    const debits = new Prisma.Decimal(String(lines[0]?.baseAmount)).plus(String(lines[2]?.baseAmount))
    const credits = new Prisma.Decimal(String(lines[1]?.baseAmount))
    expect(debits.eq(credits)).toBe(true)
  })

  it('records a realized FX gain when an AR collection settles above its carrying value', async () => {
    const lines: Record<string, unknown>[] = []
    const tx = {
      exchangeRate: { findFirst: vi.fn(async () => ({ id: 'eur_2', rateToBase: new Prisma.Decimal('1.32') })) },
      ledgerAccount: { upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: `${create.code}_${create.currency}` })) },
      journalEntry: {
        findFirst: vi.fn(async () => ({ amount: new Prisma.Decimal('100'), currency: 'EUR', baseAmount: new Prisma.Decimal('120') })),
        create: vi.fn(async () => ({ id: 'collection_1' })),
      },
      journalLine: { createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => { lines.push(...data); return { count: data.length } }) },
    } as unknown as Prisma.TransactionClient
    await recordCashSettlement(tx, {
      tenantId: 'tenant_1', sourceId: 'invoice_1', sourceType: 'AR_COLLECTION', amount: '100.00',
      documentCurrency: 'EUR', workspaceCurrency: 'USD', postedAt: new Date('2026-10-07T12:00:00Z'),
      actorId: 'admin_1', description: 'Collected invoice',
    })
    expect(lines).toEqual([
      expect.objectContaining({ side: 'DEBIT', baseAmount: '132' }),
      expect.objectContaining({ side: 'CREDIT', baseAmount: '120' }),
      expect.objectContaining({ side: 'CREDIT', baseAmount: '12', accountId: 'FX_GAIN_USD' }),
    ])
  })

  it('aggregates cash flow in the workspace base currency across document currencies', async () => {
    const query = vi.fn(async () => [{ month: '2026-10', inflow: new Prisma.Decimal('132'), outflow: new Prisma.Decimal('120') }])
    const prisma = { $queryRaw: query } as unknown as Prisma.TransactionClient
    const result = await settlementCashFlow(prisma, 'tenant_1', 'USD', 'America/New_York')
    expect(String(query.mock.calls[0]?.[0])).toContain('baseAmount')
    expect(String(query.mock.calls[0]?.[0])).toContain('AT TIME ZONE')
    expect(result).toEqual([{
      month: '2026-10',
      inflow: { amount: 13200, currency: 'USD' },
      outflow: { amount: 12000, currency: 'USD' },
      net: { amount: 1200, currency: 'USD' },
    }])
  })

  it('compares tenant-local cash flow windows using posted journal settlements and reversals', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TABLE "JournalEntry" ("id" text PRIMARY KEY, "tenantId" text, "baseCurrency" text, "baseAmount" numeric, "postedAt" timestamptz, "sourceType" text, "reversesJournalEntryId" text);
        INSERT INTO "JournalEntry" VALUES
          ('current_ar', 'tenant_1', 'USD', 100, '2026-10-07T16:00:00Z', 'AR_COLLECTION', NULL),
          ('current_ap', 'tenant_1', 'USD', 30, '2026-10-07T17:00:00Z', 'AP_PAYMENT', NULL),
          ('prior_ar', 'tenant_1', 'USD', 50, '2025-10-07T16:00:00Z', 'AR_COLLECTION', NULL),
          ('prior_expense', 'tenant_1', 'USD', 20, '2025-10-07T17:00:00Z', 'EXPENSE_REIMBURSEMENT', NULL),
          ('payroll_original', 'tenant_1', 'USD', 5, '2026-10-01T12:00:00Z', 'PAYROLL_PAYMENT', NULL),
          ('current_reversal', 'tenant_1', 'USD', 5, '2026-10-07T18:00:00Z', 'SETTLEMENT_REVERSAL', 'payroll_original'),
          ('local_month_boundary', 'tenant_1', 'USD', 1, '2026-11-01T02:00:00Z', 'AR_COLLECTION', NULL),
          ('at_end', 'tenant_1', 'USD', 900, '2026-10-08T04:00:00Z', 'AR_COLLECTION', NULL),
          ('foreign_tenant', 'tenant_2', 'USD', 800, '2026-10-07T16:00:00Z', 'AR_COLLECTION', NULL);
      `)
      const prisma = {
        $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const sql = strings.reduce((text, part, index) => text + part + (index < values.length ? `$${index + 1}` : ''), '')
          const result = await db.query(sql, values)
          return result.rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, key === 'month' ? value : new Prisma.Decimal(String(value))])))
        },
      } as unknown as Prisma.TransactionClient
      const comparison = await settlementCashFlowComparison(prisma, 'tenant_1', 'USD', 'America/New_York', '2026-01-01', '2026-10-08', '2025-01-01', '2025-10-08')
      expect(comparison).toEqual({
        current: { startDate: '2026-01-01', endDateExclusive: '2026-10-08', inflow: { amount: 10500, currency: 'USD' }, outflow: { amount: 3500, currency: 'USD' }, net: { amount: 7000, currency: 'USD' } },
        previous: { startDate: '2025-01-01', endDateExclusive: '2025-10-08', inflow: { amount: 5000, currency: 'USD' }, outflow: { amount: 2000, currency: 'USD' }, net: { amount: 3000, currency: 'USD' } },
      })
      const monthly = await settlementCashFlow(prisma, 'tenant_1', 'USD', 'America/New_York')
      expect(monthly).toContainEqual({ month: '2026-10', inflow: { amount: 100600, currency: 'USD' }, outflow: { amount: 3500, currency: 'USD' }, net: { amount: 97100, currency: 'USD' } })
    } finally {
      await db.close()
    }
  }, 30_000)

  it('reports an as-of base-currency trial balance and discloses unvalued legacy journals', async () => {
    const prisma = {
      tenant: { findUnique: vi.fn(async () => ({ currency: 'USD' })) },
      journalEntry: { count: vi.fn(async () => 2) },
      $queryRaw: vi.fn(async () => [{
        accountId: 'cash_1', accountCode: 'CASH_CLEARING', accountName: 'Cash clearing', accountKind: 'ASSET', currency: 'USD',
        debit: new Prisma.Decimal('50'), credit: new Prisma.Decimal('20'),
        debitBase: new Prisma.Decimal('50'), creditBase: new Prisma.Decimal('20'),
      }]),
    } as unknown as Prisma.TransactionClient
    const result = await trialBalance(prisma, 'tenant_1', '2026-10-07')
    expect(result).toMatchObject({
      asOf: '2026-10-07', baseCurrency: 'USD', isComplete: false, unvaluedJournalCount: 2,
      totalDebitBase: { amount: 5000, currency: 'USD' }, totalCreditBase: { amount: 2000, currency: 'USD' },
      rows: [{ netDebitBase: { amount: 3000, currency: 'USD' }, netCreditBase: { amount: 0, currency: 'USD' } }],
    })
  })

  it('runs the trial-balance aggregation against PostgreSQL-compatible SQL with date and tenant boundaries', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TABLE "LedgerAccount" ("id" text, "tenantId" text, "code" text, "name" text, "kind" text, "currency" text);
        CREATE TABLE "JournalEntry" ("id" text, "tenantId" text, "postedAt" timestamptz, "baseAmount" numeric);
        CREATE TABLE "JournalLine" ("id" text, "tenantId" text, "entryId" text, "accountId" text, "side" text, "amount" numeric, "baseAmount" numeric);
        CREATE TABLE "Tenant" ("id" text, "currency" text);
        INSERT INTO "Tenant" VALUES ('tenant_1', 'USD');
        INSERT INTO "LedgerAccount" VALUES
          ('cash', 'tenant_1', '1000', 'Cash', 'ASSET', 'USD'),
          ('other_tenant', 'tenant_2', '1000', 'Other cash', 'ASSET', 'USD');
        INSERT INTO "JournalEntry" VALUES
          ('included', 'tenant_1', '2026-10-07T23:59:59Z', 30),
          ('next_day', 'tenant_1', '2026-10-08T00:00:00Z', 50),
          ('other_tenant_entry', 'tenant_2', '2026-10-07T12:00:00Z', 900),
          ('unvalued', 'tenant_1', '2026-10-07T12:00:00Z', NULL);
        INSERT INTO "JournalLine" VALUES
          ('line_1', 'tenant_1', 'included', 'cash', 'DEBIT', 30, 30),
          ('line_2', 'tenant_1', 'unvalued', 'cash', 'CREDIT', 10, NULL),
          ('line_3', 'tenant_1', 'next_day', 'cash', 'DEBIT', 50, 50),
          ('line_4', 'tenant_2', 'other_tenant_entry', 'other_tenant', 'DEBIT', 900, 900);
      `)
      const client = {
        tenant: { findUnique: vi.fn(async () => ({ currency: 'USD' })) },
        journalEntry: {
          count: vi.fn(async ({ where }: { where: { postedAt: { lt: Date }; baseAmount: null } }) => {
            const result = await db.query<{ count: number }>(
              'SELECT count(*)::int AS count FROM "JournalEntry" WHERE "tenantId" = $1 AND "postedAt" < $2 AND "baseAmount" IS NULL',
              ['tenant_1', where.postedAt.lt],
            )
            return result.rows[0]?.count ?? 0
          }),
        },
        $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const sql = strings.reduce((text, part, index) => text + part + (index < values.length ? `$${index + 1}` : ''), '')
          const result = await db.query(sql, values)
          return result.rows.map(row => ({
            ...row,
            debit: new Prisma.Decimal(String(row.debit)),
            credit: new Prisma.Decimal(String(row.credit)),
            debitBase: new Prisma.Decimal(String(row.debitBase)),
            creditBase: new Prisma.Decimal(String(row.creditBase)),
          }))
        },
      } as unknown as Prisma.TransactionClient

      const report = await trialBalance(client, 'tenant_1', '2026-10-07')
      expect(report).toMatchObject({
        totalDebitBase: { amount: 3000, currency: 'USD' },
        totalCreditBase: { amount: 0, currency: 'USD' },
        unvaluedJournalCount: 1,
        isComplete: false,
        rows: [{ accountCode: '1000', debit: { amount: 3000 }, credit: { amount: 1000 }, netDebitBase: { amount: 3000 } }],
      })
    } finally {
      await db.close()
    }
  }, 30_000)

  it('classifies payroll and reimbursement reversals as returned cash', async () => {
    const query = vi.fn(async () => [])
    const rows = [
      { id: 'payroll_reversal', postedAt: new Date('2026-10-08T00:00:00Z'), description: 'Payroll reversal', amount: new Prisma.Decimal('90'), currency: 'USD', sourceType: 'SETTLEMENT_REVERSAL', reverses: { sourceType: 'PAYROLL_PAYMENT' } },
      { id: 'expense_reversal', postedAt: new Date('2026-10-08T00:00:00Z'), description: 'Expense reversal', amount: new Prisma.Decimal('18.25'), currency: 'USD', sourceType: 'SETTLEMENT_REVERSAL', reverses: { sourceType: 'EXPENSE_REIMBURSEMENT' } },
      { id: 'ar_reversal', postedAt: new Date('2026-10-08T00:00:00Z'), description: 'Collection reversal', amount: new Prisma.Decimal('20'), currency: 'USD', sourceType: 'SETTLEMENT_REVERSAL', reverses: { sourceType: 'AR_COLLECTION' } },
    ]
    const prisma = {
      $queryRaw: query,
      journalEntry: { findMany: vi.fn(async () => rows) },
    } as unknown as Prisma.TransactionClient
    await settlementCashFlow(prisma, 'tenant_1', 'USD')
    expect(String(query.mock.calls[0]?.[0])).toContain("original.\"sourceType\" IN ('AP_PAYMENT', 'PAYROLL_PAYMENT', 'EXPENSE_REIMBURSEMENT')")
    const recent = await recentSettlements(prisma, 'tenant_1')
    expect(recent.map(row => row.type)).toEqual(['credit', 'credit', 'debit'])
  })
})

describe('payables cash period comparison', () => {
  it('aggregates tenant-local AP payments in base currency and subtracts linked reversals', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TABLE "SettlementHistoryCoverage" ("tenantId" TEXT, "startsAt" TIMESTAMP);
        CREATE TABLE "JournalEntry" (
          "id" TEXT, "tenantId" TEXT, "sourceType" TEXT, "reversesJournalEntryId" TEXT,
          "baseCurrency" TEXT, "baseAmount" NUMERIC, "postedAt" TIMESTAMPTZ
        );
        INSERT INTO "SettlementHistoryCoverage" VALUES ('tenant_1', '2026-08-01 00:00:00');
        INSERT INTO "JournalEntry" VALUES
          ('ap_current', 'tenant_1', 'AP_PAYMENT', NULL, 'USD', 100, '2026-10-02T00:00:00Z'),
          ('ap_current_reversal', 'tenant_1', 'SETTLEMENT_REVERSAL', 'ap_current', 'USD', 30, '2026-10-03T00:00:00Z'),
          ('ap_previous', 'tenant_1', 'AP_PAYMENT', NULL, 'USD', 50, '2026-09-02T00:00:00Z'),
          ('ap_previous_reversal', 'tenant_1', 'SETTLEMENT_REVERSAL', 'ap_previous', 'USD', 5, '2026-09-03T00:00:00Z'),
          ('ar_current', 'tenant_1', 'AR_COLLECTION', NULL, 'USD', 333, '2026-10-02T00:00:00Z'),
          ('recognition_current', 'tenant_1', 'AP_RECOGNITION', NULL, 'USD', 999, '2026-10-02T00:00:00Z'),
          ('other_tenant', 'tenant_2', 'AP_PAYMENT', NULL, 'USD', 700, '2026-10-02T00:00:00Z'),
          ('unvalued_current', 'tenant_1', 'AP_PAYMENT', NULL, 'USD', NULL, '2026-10-02T00:00:00Z');
      `)
      const prisma = {
        $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const sql = strings.reduce((text, part, index) => text + part + (index < values.length ? `$${index + 1}` : ''), '')
          const result = await db.query(sql, values)
          return result.rows.map(row => ({
            ...row,
            currentTotal: row.currentTotal == null ? null : new Prisma.Decimal(String(row.currentTotal)),
            previousTotal: row.previousTotal == null ? null : new Prisma.Decimal(String(row.previousTotal)),
          }))
        },
      } as unknown as PrismaClient

      const comparison = await payableSettlementComparison(prisma, 'tenant_1', 'USD', 'Africa/Cairo', '2026-10-01', '2026-10-09', '2026-09-01', '2026-09-09')
      expect(comparison).toEqual({
        currentTotal: { amount: 7000, currency: 'USD' },
        previousTotal: { amount: 4500, currency: 'USD' },
      })

      await db.exec(`UPDATE "SettlementHistoryCoverage" SET "startsAt" = '2026-10-03 00:00:00' WHERE "tenantId" = 'tenant_1'`)
      const beforeCoverage = await payableSettlementComparison(prisma, 'tenant_1', 'USD', 'Africa/Cairo', '2026-10-01', '2026-10-09', '2026-09-01', '2026-09-09')
      expect(beforeCoverage.previousTotal).toBeNull()
      expect(beforeCoverage.currentTotal).toBeNull()
    } finally {
      await db.close()
    }
  }, 30_000)
})

describe('receivables cash period comparison', () => {
  it('aggregates tenant-local AR collections in base currency and subtracts linked reversals', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TABLE "SettlementHistoryCoverage" ("tenantId" TEXT, "startsAt" TIMESTAMP);
        CREATE TABLE "JournalEntry" (
          "id" TEXT, "tenantId" TEXT, "sourceType" TEXT, "reversesJournalEntryId" TEXT,
          "baseCurrency" TEXT, "baseAmount" NUMERIC, "postedAt" TIMESTAMPTZ
        );
        INSERT INTO "SettlementHistoryCoverage" VALUES ('tenant_1', '2026-08-01 00:00:00');
        INSERT INTO "JournalEntry" VALUES
          ('ar_current', 'tenant_1', 'AR_COLLECTION', NULL, 'USD', 100, '2026-10-02T00:00:00Z'),
          ('ar_current_reversal', 'tenant_1', 'SETTLEMENT_REVERSAL', 'ar_current', 'USD', 30, '2026-10-03T00:00:00Z'),
          ('ar_previous', 'tenant_1', 'AR_COLLECTION', NULL, 'USD', 50, '2026-09-02T00:00:00Z'),
          ('ar_previous_reversal', 'tenant_1', 'SETTLEMENT_REVERSAL', 'ar_previous', 'USD', 5, '2026-09-03T00:00:00Z'),
          ('ap_current', 'tenant_1', 'AP_PAYMENT', NULL, 'USD', 333, '2026-10-02T00:00:00Z'),
          ('other_tenant', 'tenant_2', 'AR_COLLECTION', NULL, 'USD', 700, '2026-10-02T00:00:00Z'),
          ('unvalued_current', 'tenant_1', 'AR_COLLECTION', NULL, 'USD', NULL, '2026-10-02T00:00:00Z');
      `)
      const prisma = {
        $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const sql = strings.reduce((text, part, index) => text + part + (index < values.length ? `$${index + 1}` : ''), '')
          const result = await db.query(sql, values)
          return result.rows.map(row => ({
            ...row,
            currentTotal: row.currentTotal == null ? null : new Prisma.Decimal(String(row.currentTotal)),
            previousTotal: row.previousTotal == null ? null : new Prisma.Decimal(String(row.previousTotal)),
          }))
        },
      } as unknown as PrismaClient

      const comparison = await receivableSettlementComparison(prisma, 'tenant_1', 'USD', 'Africa/Cairo', '2026-10-01', '2026-10-09', '2026-09-01', '2026-09-09')
      expect(comparison).toEqual({
        currentTotal: { amount: 7000, currency: 'USD' },
        previousTotal: { amount: 4500, currency: 'USD' },
      })

      await db.exec(`UPDATE "SettlementHistoryCoverage" SET "startsAt" = '2026-10-03 00:00:00' WHERE "tenantId" = 'tenant_1'`)
      const beforeCoverage = await receivableSettlementComparison(prisma, 'tenant_1', 'USD', 'Africa/Cairo', '2026-10-01', '2026-10-09', '2026-09-01', '2026-09-09')
      expect(beforeCoverage.previousTotal).toBeNull()
      expect(beforeCoverage.currentTotal).toBeNull()
    } finally {
      await db.close()
    }
  }, 30_000)
})

describe('payroll cash period comparison', () => {
  it('aggregates tenant-local payroll payments in base currency and subtracts linked reversals', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TABLE "SettlementHistoryCoverage" ("tenantId" TEXT, "startsAt" TIMESTAMP);
        CREATE TABLE "JournalEntry" (
          "id" TEXT, "tenantId" TEXT, "sourceType" TEXT, "reversesJournalEntryId" TEXT,
          "baseCurrency" TEXT, "baseAmount" NUMERIC, "postedAt" TIMESTAMPTZ
        );
        INSERT INTO "SettlementHistoryCoverage" VALUES ('tenant_1', '2026-08-01 00:00:00');
        INSERT INTO "JournalEntry" VALUES
          ('payroll_current', 'tenant_1', 'PAYROLL_PAYMENT', NULL, 'USD', 100, '2026-10-02T00:00:00Z'),
          ('payroll_current_reversal', 'tenant_1', 'SETTLEMENT_REVERSAL', 'payroll_current', 'USD', 30, '2026-10-03T00:00:00Z'),
          ('payroll_previous', 'tenant_1', 'PAYROLL_PAYMENT', NULL, 'USD', 50, '2026-09-02T00:00:00Z'),
          ('payroll_previous_reversal', 'tenant_1', 'SETTLEMENT_REVERSAL', 'payroll_previous', 'USD', 5, '2026-09-03T00:00:00Z'),
          ('expense_current', 'tenant_1', 'EXPENSE_REIMBURSEMENT', NULL, 'USD', 333, '2026-10-02T00:00:00Z'),
          ('other_tenant', 'tenant_2', 'PAYROLL_PAYMENT', NULL, 'USD', 700, '2026-10-02T00:00:00Z'),
          ('unvalued_current', 'tenant_1', 'PAYROLL_PAYMENT', NULL, 'USD', NULL, '2026-10-02T00:00:00Z');
      `)
      const prisma = {
        $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const sql = strings.reduce((text, part, index) => text + part + (index < values.length ? `$${index + 1}` : ''), '')
          const result = await db.query(sql, values)
          return result.rows.map(row => ({
            ...row,
            currentTotal: row.currentTotal == null ? null : new Prisma.Decimal(String(row.currentTotal)),
            previousTotal: row.previousTotal == null ? null : new Prisma.Decimal(String(row.previousTotal)),
          }))
        },
      } as unknown as PrismaClient

      const comparison = await payrollSettlementComparison(prisma, 'tenant_1', 'USD', 'Africa/Cairo', '2026-10-01', '2026-10-09', '2026-09-01', '2026-09-09')
      expect(comparison).toEqual({
        currentTotal: { amount: 7000, currency: 'USD' },
        previousTotal: { amount: 4500, currency: 'USD' },
      })

      await db.exec(`UPDATE "SettlementHistoryCoverage" SET "startsAt" = '2026-10-03 00:00:00' WHERE "tenantId" = 'tenant_1'`)
      const beforeCoverage = await payrollSettlementComparison(prisma, 'tenant_1', 'USD', 'Africa/Cairo', '2026-10-01', '2026-10-09', '2026-09-01', '2026-09-09')
      expect(beforeCoverage.previousTotal).toBeNull()
      expect(beforeCoverage.currentTotal).toBeNull()
    } finally {
      await db.close()
    }
  }, 30_000)
})

describe('expense reimbursement period comparison', () => {
  it('aggregates tenant-local reimbursements in base currency and subtracts linked reversals', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TABLE "SettlementHistoryCoverage" ("tenantId" TEXT, "startsAt" TIMESTAMP);
        CREATE TABLE "JournalEntry" (
          "id" TEXT, "tenantId" TEXT, "sourceType" TEXT, "reversesJournalEntryId" TEXT,
          "baseCurrency" TEXT, "baseAmount" NUMERIC, "postedAt" TIMESTAMPTZ
        );
        INSERT INTO "SettlementHistoryCoverage" VALUES ('tenant_1', '2026-08-01 00:00:00');
        INSERT INTO "JournalEntry" VALUES
          ('expense_current', 'tenant_1', 'EXPENSE_REIMBURSEMENT', NULL, 'USD', 100, '2026-10-02T00:00:00Z'),
          ('expense_current_reversal', 'tenant_1', 'SETTLEMENT_REVERSAL', 'expense_current', 'USD', 30, '2026-10-03T00:00:00Z'),
          ('expense_previous', 'tenant_1', 'EXPENSE_REIMBURSEMENT', NULL, 'USD', 50, '2026-09-02T00:00:00Z'),
          ('expense_previous_reversal', 'tenant_1', 'SETTLEMENT_REVERSAL', 'expense_previous', 'USD', 5, '2026-09-03T00:00:00Z'),
          ('ap_current', 'tenant_1', 'AP_PAYMENT', NULL, 'USD', 333, '2026-10-02T00:00:00Z'),
          ('other_tenant', 'tenant_2', 'EXPENSE_REIMBURSEMENT', NULL, 'USD', 700, '2026-10-02T00:00:00Z'),
          ('unvalued_current', 'tenant_1', 'EXPENSE_REIMBURSEMENT', NULL, 'USD', NULL, '2026-10-02T00:00:00Z');
      `)
      const prisma = {
        $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const sql = strings.reduce((text, part, index) => text + part + (index < values.length ? `$${index + 1}` : ''), '')
          const result = await db.query(sql, values)
          return result.rows.map(row => ({
            ...row,
            currentTotal: row.currentTotal == null ? null : new Prisma.Decimal(String(row.currentTotal)),
            previousTotal: row.previousTotal == null ? null : new Prisma.Decimal(String(row.previousTotal)),
          }))
        },
      } as unknown as PrismaClient

      const comparison = await expenseSettlementComparison(prisma, 'tenant_1', 'USD', 'Africa/Cairo', '2026-10-01', '2026-10-09', '2026-09-01', '2026-09-09')
      expect(comparison).toEqual({
        currentTotal: { amount: 7000, currency: 'USD' },
        previousTotal: { amount: 4500, currency: 'USD' },
      })

      await db.exec(`UPDATE "SettlementHistoryCoverage" SET "startsAt" = '2026-10-03 00:00:00' WHERE "tenantId" = 'tenant_1'`)
      const beforeCoverage = await expenseSettlementComparison(prisma, 'tenant_1', 'USD', 'Africa/Cairo', '2026-10-01', '2026-10-09', '2026-09-01', '2026-09-09')
      expect(beforeCoverage.previousTotal).toBeNull()
      expect(beforeCoverage.currentTotal).toBeNull()
    } finally {
      await db.close()
    }
  }, 30_000)
})
