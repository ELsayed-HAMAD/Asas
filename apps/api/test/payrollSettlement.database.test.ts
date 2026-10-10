import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let db: PGlite

beforeEach(async () => {
  db = new PGlite()
  await db.waitReady
  await db.exec(`
    CREATE TYPE "PayrollRunStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID');
    CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'FLAGGED', 'PROCESSING', 'APPROVED', 'REJECTED');
    CREATE TABLE "Tenant" ("id" TEXT PRIMARY KEY, "currency" TEXT NOT NULL, "currencyLockedAt" TIMESTAMP(3));
    CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
    CREATE TABLE "PayrollRun" (
      "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id"),
      "status" "PayrollRunStatus" NOT NULL, "currency" TEXT
    );
    CREATE TABLE "PayrollLine" (
      "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "payrollRunId" TEXT NOT NULL,
      "net" DECIMAL(19,4) NOT NULL
    );
    CREATE TABLE "PayrollTaxLine" ("id" TEXT PRIMARY KEY, "payrollLineId" TEXT NOT NULL);
    CREATE TABLE "Expense" (
      "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "amount" DECIMAL(19,4) NOT NULL,
      "currency" TEXT, "status" "ExpenseStatus" NOT NULL
    );
    CREATE TABLE "PayableInvoice" (
      "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "amount" DECIMAL(19,4), "currency" TEXT,
      "status" TEXT, "approvedAt" TIMESTAMP(3), "paidAt" TIMESTAMP(3), UNIQUE ("id", "tenantId")
    );
    CREATE TABLE "ReceivableInvoice" (
      "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "amount" DECIMAL(19,4), "currency" TEXT,
      "status" TEXT, "paidAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE ("id", "tenantId")
    );
    CREATE TABLE "LedgerAccount" (
      "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
      "kind" TEXT NOT NULL, "currency" TEXT NOT NULL, UNIQUE ("tenantId", "code"), UNIQUE ("id", "tenantId")
    );
    CREATE TABLE "JournalEntry" (
      "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "currency" TEXT NOT NULL,
      "amount" DECIMAL(19,4) NOT NULL, "sourceType" TEXT NOT NULL,
      "payableInvoiceId" TEXT, "receivableInvoiceId" TEXT,
      "currencyProvenance" TEXT NOT NULL, "description" TEXT NOT NULL, "actorId" TEXT,
      "postedAt" TIMESTAMP(3) NOT NULL, UNIQUE ("id", "tenantId"),
      CHECK (("sourceType" = 'AP_PAYMENT' AND "payableInvoiceId" IS NOT NULL AND "receivableInvoiceId" IS NULL)
          OR ("sourceType" = 'AR_COLLECTION' AND "receivableInvoiceId" IS NOT NULL AND "payableInvoiceId" IS NULL))
    );
    CREATE TABLE "JournalLine" (
      "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "entryId" TEXT NOT NULL,
      "accountId" TEXT NOT NULL, "side" TEXT NOT NULL, "amount" DECIMAL(19,4) NOT NULL
    );
    CREATE FUNCTION asas_immutable_posting() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Posted journals are append-only';
    END;
    $$;
    CREATE TRIGGER "JournalEntry_append_only" BEFORE UPDATE OR DELETE ON "JournalEntry"
      FOR EACH ROW EXECUTE FUNCTION asas_immutable_posting();
    CREATE TRIGGER "JournalLine_append_only" BEFORE UPDATE OR DELETE ON "JournalLine"
      FOR EACH ROW EXECUTE FUNCTION asas_immutable_posting();
    CREATE FUNCTION asas_validate_settlement_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END; $$;
    CREATE CONSTRAINT TRIGGER "JournalEntry_balanced" AFTER INSERT ON "JournalEntry"
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION asas_validate_settlement_journal();
    CREATE CONSTRAINT TRIGGER "JournalLine_balanced" AFTER INSERT ON "JournalLine"
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION asas_validate_settlement_journal();
  `)
  const migration = readFileSync(new URL('../prisma/migrations/20261007070000_payroll_settlement_journals/migration.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  const expenseMigration = readFileSync(new URL('../prisma/migrations/20261007080000_expense_reimbursement_journals/migration.sql', import.meta.url), 'utf8')
  await db.exec(expenseMigration)
  const reversalMigration = readFileSync(new URL('../prisma/migrations/20261007090000_settlement_reversals/migration.sql', import.meta.url), 'utf8')
  await db.exec(reversalMigration)
  const recognitionMigration = readFileSync(new URL('../prisma/migrations/20261007100000_invoice_recognition_and_controls/migration.sql', import.meta.url), 'utf8')
  await db.exec(recognitionMigration)
  const fxMigration = readFileSync(new URL('../prisma/migrations/20261007110000_workspace_fx_rates/migration.sql', import.meta.url), 'utf8')
  await db.exec(fxMigration)
  const fxJournalMigration = readFileSync(new URL('../prisma/migrations/20261007120000_fx_journal_accounting/migration.sql', import.meta.url), 'utf8')
  await db.exec(fxJournalMigration)
  const fxValidationMigration = readFileSync(new URL('../prisma/migrations/20261007130000_fx_journal_validation/migration.sql', import.meta.url), 'utf8')
  await db.exec(fxValidationMigration)
  const payrollExpenseReversalMigration = readFileSync(new URL('../prisma/migrations/20261007140000_payroll_expense_reversals/migration.sql', import.meta.url), 'utf8')
  await db.exec(payrollExpenseReversalMigration)
  const openingBalanceMigration = readFileSync(new URL('../prisma/migrations/20261007160000_ledger_opening_balances/migration.sql', import.meta.url), 'utf8')
  await db.exec(openingBalanceMigration)
}, 60_000)

afterEach(async () => { await db?.close() })

async function seedPaidRun() {
  await db.exec(`
    INSERT INTO "Tenant" ("id", "currency") VALUES ('tenant_1', 'USD');
    INSERT INTO "PayrollRun" ("id", "tenantId", "status", "currency") VALUES ('run_1', 'tenant_1', 'APPROVED', 'USD');
    INSERT INTO "PayrollLine" VALUES ('line_1', 'tenant_1', 'run_1', 42.12);
    UPDATE "PayrollRun" SET "status" = 'PAID', "paidAt" = '2026-10-07T00:00:00Z', "paidById" = 'admin_1' WHERE "id" = 'run_1';
    INSERT INTO "LedgerAccount" VALUES
      ('cash_1', 'tenant_1', 'CASH_CLEARING', 'Manual cash', 'ASSET', 'USD'),
      ('payroll_1', 'tenant_1', 'PAYROLL_CLEARING', 'Payroll clearing', 'LIABILITY', 'USD'),
      ('reimbursement_1', 'tenant_1', 'REIMBURSEMENT_CLEARING', 'Reimbursement clearing', 'LIABILITY', 'USD');
  `)
}

describe('payroll settlement SQL enforcement', () => {
  it('accepts a balanced payroll cash settlement and preserves its source link', async () => {
    await seedPaidRun()
    await db.exec(`
      BEGIN;
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "sourceType", "payrollRunId", "currencyProvenance", "description", "actorId", "postedAt")
      VALUES ('journal_1', 'tenant_1', 'USD', 42.12, 'USD', 42.12, 2, 1, 'PAYROLL_PAYMENT', 'run_1', 'DOCUMENT', 'Payroll payment', 'admin_1', '2026-10-07T00:00:00Z');
      INSERT INTO "JournalLine" ("id", "tenantId", "entryId", "accountId", "side", "amount", "baseAmount") VALUES
        ('line_a', 'tenant_1', 'journal_1', 'cash_1', 'CREDIT', 42.12, 42.12),
        ('line_b', 'tenant_1', 'journal_1', 'payroll_1', 'DEBIT', 42.12, 42.12);
      COMMIT;
    `)
    expect((await db.query('SELECT "payrollRunId", "amount"::text FROM "JournalEntry" WHERE "id" = $1', ['journal_1'])).rows[0]).toEqual({ payrollRunId: 'run_1', amount: '42.1200' })
  })

  it('rejects an entry that does not match the paid payroll total', async () => {
    await seedPaidRun()
    await expect(db.exec(`
      BEGIN;
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "sourceType", "payrollRunId", "currencyProvenance", "description", "postedAt")
      VALUES ('journal_bad', 'tenant_1', 'USD', 41, 'USD', 41, 2, 1, 'PAYROLL_PAYMENT', 'run_1', 'DOCUMENT', 'Wrong total', '2026-10-07T00:00:00Z');
      INSERT INTO "JournalLine" ("id", "tenantId", "entryId", "accountId", "side", "amount", "baseAmount") VALUES
        ('line_a', 'tenant_1', 'journal_bad', 'cash_1', 'CREDIT', 41, 41),
        ('line_b', 'tenant_1', 'journal_bad', 'payroll_1', 'DEBIT', 41, 41);
      COMMIT;
    `)).rejects.toMatchObject({ code: '23514' })
  })

  it('prevents changes to a paid run and its payroll lines', async () => {
    await seedPaidRun()
    await expect(db.query('UPDATE "PayrollRun" SET "status" = $1 WHERE "id" = $2', ['APPROVED', 'run_1'])).rejects.toMatchObject({ code: '23514' })
    await expect(db.query('UPDATE "PayrollLine" SET "net" = 0 WHERE "id" = $1', ['line_1'])).rejects.toMatchObject({ code: '23514' })
  })

  it('accepts a balanced expense reimbursement and locks the paid source amount', async () => {
    await db.exec(`
      INSERT INTO "Tenant" ("id", "currency") VALUES ('tenant_1', 'USD');
      INSERT INTO "Expense" ("id", "tenantId", "amount", "currency", "status") VALUES ('expense_1', 'tenant_1', 18.25, 'USD', 'APPROVED');
      UPDATE "Expense" SET "status" = 'REIMBURSED', "reimbursedAt" = '2026-10-07T00:00:00Z', "reimbursedById" = 'admin_1' WHERE "id" = 'expense_1';
      INSERT INTO "LedgerAccount" VALUES
        ('cash_1', 'tenant_1', 'CASH_CLEARING', 'Manual cash', 'ASSET', 'USD'),
        ('reimbursement_1', 'tenant_1', 'REIMBURSEMENT_CLEARING', 'Reimbursement clearing', 'LIABILITY', 'USD');
      BEGIN;
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "sourceType", "expenseId", "currencyProvenance", "description", "actorId", "postedAt")
      VALUES ('journal_expense', 'tenant_1', 'USD', 18.25, 'USD', 18.25, 2, 1, 'EXPENSE_REIMBURSEMENT', 'expense_1', 'DOCUMENT', 'Expense reimbursement', 'admin_1', '2026-10-07T00:00:00Z');
      INSERT INTO "JournalLine" ("id", "tenantId", "entryId", "accountId", "side", "amount", "baseAmount") VALUES
        ('expense_line_a', 'tenant_1', 'journal_expense', 'cash_1', 'CREDIT', 18.25, 18.25),
        ('expense_line_b', 'tenant_1', 'journal_expense', 'reimbursement_1', 'DEBIT', 18.25, 18.25);
      COMMIT;
    `)
    await expect(db.query('UPDATE "Expense" SET "amount" = 1 WHERE "id" = $1', ['expense_1'])).rejects.toMatchObject({ code: '23514' })
  })

  it('accepts an exact opposite AP journal before marking the paid invoice void', async () => {
    await db.exec(`
      INSERT INTO "Tenant" ("id", "currency") VALUES ('tenant_1', 'USD');
      INSERT INTO "PayableInvoice" VALUES ('payable_1', 'tenant_1', 25, 'USD', 'PAID', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z');
      INSERT INTO "LedgerAccount" VALUES
        ('cash_1', 'tenant_1', 'CASH_CLEARING', 'Manual cash', 'ASSET', 'USD'),
        ('clearing_1', 'tenant_1', 'ACCOUNTS_PAYABLE', 'Accounts payable', 'LIABILITY', 'USD');
      BEGIN;
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "sourceType", "payableInvoiceId", "currencyProvenance", "description", "postedAt")
      VALUES ('payment_1', 'tenant_1', 'USD', 25, 'USD', 25, 2, 1, 'AP_PAYMENT', 'payable_1', 'DOCUMENT', 'Payment', '2026-10-07T00:00:00Z');
      INSERT INTO "JournalLine" ("id", "tenantId", "entryId", "accountId", "side", "amount", "baseAmount") VALUES
        ('payment_cash', 'tenant_1', 'payment_1', 'cash_1', 'CREDIT', 25, 25),
        ('payment_clearing', 'tenant_1', 'payment_1', 'clearing_1', 'DEBIT', 25, 25);
      COMMIT;
      BEGIN;
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "sourceType", "reversesJournalEntryId", "reversalReason", "currencyProvenance", "description", "postedAt")
      VALUES ('reversal_1', 'tenant_1', 'USD', 25, 'USD', 25, 2, 1, 'SETTLEMENT_REVERSAL', 'payment_1', 'Returned by bank', 'DOCUMENT', 'Reversal', '2026-10-08T00:00:00Z');
      INSERT INTO "JournalLine" ("id", "tenantId", "entryId", "accountId", "side", "amount", "baseAmount") VALUES
        ('reversal_cash', 'tenant_1', 'reversal_1', 'cash_1', 'DEBIT', 25, 25),
        ('reversal_clearing', 'tenant_1', 'reversal_1', 'clearing_1', 'CREDIT', 25, 25);
      UPDATE "PayableInvoice" SET "status" = 'VOID' WHERE "id" = 'payable_1';
      COMMIT;
    `)
    expect((await db.query('SELECT "sourceType", "reversalReason" FROM "JournalEntry" WHERE "id" = $1', ['reversal_1'])).rows[0])
      .toEqual({ sourceType: 'SETTLEMENT_REVERSAL', reversalReason: 'Returned by bank' })
    await expect(db.query('UPDATE "PayableInvoice" SET "amount" = 99 WHERE "id" = $1', ['payable_1']))
      .rejects.toMatchObject({ code: '23514' })
    await expect(db.query('UPDATE "PayableInvoice" SET "status" = \'PAID\' WHERE "id" = $1', ['payable_1']))
      .rejects.toMatchObject({ code: '23514' })
  })

  it('rejects a reversal that does not flip both original posting sides', async () => {
    await expect(db.exec(`
      INSERT INTO "Tenant" ("id", "currency") VALUES ('tenant_1', 'USD');
      INSERT INTO "PayableInvoice" VALUES ('payable_1', 'tenant_1', 25, 'USD', 'PAID', '2026-10-07T00:00:00Z');
      INSERT INTO "LedgerAccount" VALUES
        ('cash_1', 'tenant_1', 'CASH_CLEARING', 'Manual cash', 'ASSET', 'USD'),
        ('clearing_1', 'tenant_1', 'ACCOUNTS_PAYABLE', 'Accounts payable', 'LIABILITY', 'USD');
      BEGIN;
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "sourceType", "payableInvoiceId", "currencyProvenance", "description", "postedAt")
      VALUES ('payment_1', 'tenant_1', 'USD', 25, 'USD', 25, 2, 1, 'AP_PAYMENT', 'payable_1', 'DOCUMENT', 'Payment', '2026-10-07T00:00:00Z');
      INSERT INTO "JournalLine" ("id", "tenantId", "entryId", "accountId", "side", "amount", "baseAmount") VALUES
        ('payment_cash', 'tenant_1', 'payment_1', 'cash_1', 'CREDIT', 25, 25),
        ('payment_clearing', 'tenant_1', 'payment_1', 'clearing_1', 'DEBIT', 25, 25);
      COMMIT;
      BEGIN;
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "sourceType", "reversesJournalEntryId", "reversalReason", "currencyProvenance", "description", "postedAt")
      VALUES ('reversal_1', 'tenant_1', 'USD', 25, 'USD', 25, 2, 1, 'SETTLEMENT_REVERSAL', 'payment_1', 'Returned by bank', 'DOCUMENT', 'Reversal', '2026-10-08T00:00:00Z');
      INSERT INTO "JournalLine" ("id", "tenantId", "entryId", "accountId", "side", "amount", "baseAmount") VALUES
        ('reversal_cash', 'tenant_1', 'reversal_1', 'cash_1', 'CREDIT', 25, 25),
        ('reversal_clearing', 'tenant_1', 'reversal_1', 'clearing_1', 'DEBIT', 25, 25);
      UPDATE "PayableInvoice" SET "status" = 'VOID' WHERE "id" = 'payable_1';
      COMMIT;
    `)).rejects.toMatchObject({ code: '23514' })
  })

  it('recognizes an approved payable and requires reversal before leaving approval', async () => {
    await db.exec(`
      INSERT INTO "Tenant" ("id", "currency") VALUES ('tenant_1', 'USD');
      INSERT INTO "PayableInvoice" ("id", "tenantId", "amount", "currency", "status", "approvedAt")
      VALUES ('payable_1', 'tenant_1', 40, 'USD', 'APPROVED', '2026-10-07T00:00:00Z');
      INSERT INTO "LedgerAccount" VALUES
        ('expense_1', 'tenant_1', 'UNCLASSIFIED_EXPENSE', 'Unclassified expense', 'EXPENSE', 'USD'),
        ('payable_1_account', 'tenant_1', 'ACCOUNTS_PAYABLE', 'Accounts payable', 'LIABILITY', 'USD');
      BEGIN;
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "sourceType", "recognizesPayableInvoiceId", "currencyProvenance", "description", "postedAt")
      VALUES ('recognition_1', 'tenant_1', 'USD', 40, 'USD', 40, 2, 1, 'AP_RECOGNITION', 'payable_1', 'DOCUMENT', 'Payable recognition', '2026-10-07T00:00:00Z');
      INSERT INTO "JournalLine" ("id", "tenantId", "entryId", "accountId", "side", "amount", "baseAmount") VALUES
        ('recognition_expense', 'tenant_1', 'recognition_1', 'expense_1', 'DEBIT', 40, 40),
        ('recognition_payable', 'tenant_1', 'recognition_1', 'payable_1_account', 'CREDIT', 40, 40);
      COMMIT;
    `)
    await expect(db.query('UPDATE "PayableInvoice" SET "status" = $1 WHERE "id" = $2', ['PENDING', 'payable_1']))
      .rejects.toMatchObject({ code: '23514' })
    await db.exec(`
      BEGIN;
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "sourceType", "reversesJournalEntryId", "reversalReason", "currencyProvenance", "description", "postedAt")
      VALUES ('recognition_reversal', 'tenant_1', 'USD', 40, 'USD', 40, 2, 1, 'SETTLEMENT_REVERSAL', 'recognition_1', 'Changes requested', 'DOCUMENT', 'Recognition reversal', '2026-10-08T00:00:00Z');
      INSERT INTO "JournalLine" ("id", "tenantId", "entryId", "accountId", "side", "amount", "baseAmount") VALUES
        ('reversal_expense', 'tenant_1', 'recognition_reversal', 'expense_1', 'CREDIT', 40, 40),
        ('reversal_payable', 'tenant_1', 'recognition_reversal', 'payable_1_account', 'DEBIT', 40, 40);
      UPDATE "PayableInvoice" SET "status" = 'PENDING', "approvedAt" = NULL WHERE "id" = 'payable_1';
      COMMIT;
    `)
    expect((await db.query('SELECT count(*)::int AS n FROM "JournalEntry" WHERE "recognizesPayableInvoiceId" = $1', ['payable_1'])).rows[0]?.n).toBe(1)
  })

  it('reverses and reposts receivable recognition when its amount changes', async () => {
    await db.exec(`
      INSERT INTO "Tenant" ("id", "currency") VALUES ('tenant_1', 'USD');
      INSERT INTO "ReceivableInvoice" ("id", "tenantId", "amount", "currency", "status") VALUES ('receivable_1', 'tenant_1', 80, 'USD', 'CURRENT');
      INSERT INTO "LedgerAccount" VALUES
        ('ar_1', 'tenant_1', 'ACCOUNTS_RECEIVABLE', 'Accounts receivable', 'ASSET', 'USD'),
        ('revenue_1', 'tenant_1', 'UNCLASSIFIED_REVENUE', 'Unclassified revenue', 'INCOME', 'USD');
      BEGIN;
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "sourceType", "recognizesReceivableInvoiceId", "currencyProvenance", "description", "postedAt")
      VALUES ('recognition_1', 'tenant_1', 'USD', 80, 'USD', 80, 2, 1, 'AR_RECOGNITION', 'receivable_1', 'DOCUMENT', 'Receivable recognition', '2026-10-07T00:00:00Z');
      INSERT INTO "JournalLine" ("id", "tenantId", "entryId", "accountId", "side", "amount", "baseAmount") VALUES
        ('recognition_ar', 'tenant_1', 'recognition_1', 'ar_1', 'DEBIT', 80, 80),
        ('recognition_revenue', 'tenant_1', 'recognition_1', 'revenue_1', 'CREDIT', 80, 80);
      COMMIT;
      BEGIN;
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "sourceType", "reversesJournalEntryId", "reversalReason", "currencyProvenance", "description", "postedAt")
      VALUES ('recognition_reversal', 'tenant_1', 'USD', 80, 'USD', 80, 2, 1, 'SETTLEMENT_REVERSAL', 'recognition_1', 'Amount corrected', 'DOCUMENT', 'Recognition reversal', '2026-10-08T00:00:00Z');
      INSERT INTO "JournalLine" ("id", "tenantId", "entryId", "accountId", "side", "amount", "baseAmount") VALUES
        ('reversal_ar', 'tenant_1', 'recognition_reversal', 'ar_1', 'CREDIT', 80, 80),
        ('reversal_revenue', 'tenant_1', 'recognition_reversal', 'revenue_1', 'DEBIT', 80, 80);
      UPDATE "ReceivableInvoice" SET "amount" = 90 WHERE "id" = 'receivable_1';
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "sourceType", "recognizesReceivableInvoiceId", "currencyProvenance", "description", "postedAt")
      VALUES ('recognition_2', 'tenant_1', 'USD', 90, 'USD', 90, 2, 1, 'AR_RECOGNITION', 'receivable_1', 'DOCUMENT', 'Adjusted receivable recognition', '2026-10-08T00:00:00Z');
      INSERT INTO "JournalLine" ("id", "tenantId", "entryId", "accountId", "side", "amount", "baseAmount") VALUES
        ('recognition_ar_2', 'tenant_1', 'recognition_2', 'ar_1', 'DEBIT', 90, 90),
        ('recognition_revenue_2', 'tenant_1', 'recognition_2', 'revenue_1', 'CREDIT', 90, 90);
      COMMIT;
    `)
    expect((await db.query('SELECT "amount"::text FROM "JournalEntry" WHERE "id" = $1', ['recognition_2'])).rows[0]?.amount).toBe('90.0000')
  })

  it('balances foreign payable settlement at the recognition carrying value and records realized FX loss', async () => {
    await db.exec(`
      INSERT INTO "Tenant" ("id", "currency") VALUES ('tenant_1', 'USD');
      INSERT INTO "PayableInvoice" ("id", "tenantId", "amount", "currency", "status", "approvedAt", "paidAt")
        VALUES ('payable_fx', 'tenant_1', 100, 'EUR', 'PAID', '2026-10-07T10:00:00Z', '2026-10-07T12:00:00Z');
      INSERT INTO "ExchangeRate" ("id", "tenantId", "currency", "rateToBase", "effectiveAt") VALUES
        ('eur_approval', 'tenant_1', 'EUR', 1.2, '2026-10-07T09:00:00Z'),
        ('eur_payment', 'tenant_1', 'EUR', 1.32, '2026-10-07T11:00:00Z');
      INSERT INTO "LedgerAccount" VALUES
        ('expense_eur', 'tenant_1', 'UNCLASSIFIED_EXPENSE', 'Unclassified expense', 'EXPENSE', 'EUR'),
        ('payable_eur', 'tenant_1', 'ACCOUNTS_PAYABLE', 'Accounts payable', 'LIABILITY', 'EUR'),
        ('cash_eur', 'tenant_1', 'CASH_CLEARING', 'Cash clearing', 'ASSET', 'EUR'),
        ('fx_loss_usd', 'tenant_1', 'FX_LOSS', 'Realized FX loss', 'EXPENSE', 'USD');
      BEGIN;
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "exchangeRateId", "sourceType", "recognizesPayableInvoiceId", "currencyProvenance", "description", "postedAt")
        VALUES ('recognition_fx', 'tenant_1', 'EUR', 100, 'USD', 120, 2, 1.2, 'eur_approval', 'AP_RECOGNITION', 'payable_fx', 'DOCUMENT', 'Recognized payable', '2026-10-07T10:00:00Z');
      INSERT INTO "JournalLine" ("id", "tenantId", "entryId", "accountId", "side", "amount", "baseAmount") VALUES
        ('recognition_expense_fx', 'tenant_1', 'recognition_fx', 'expense_eur', 'DEBIT', 100, 120),
        ('recognition_payable_fx', 'tenant_1', 'recognition_fx', 'payable_eur', 'CREDIT', 100, 120);
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "exchangeRateId", "sourceType", "payableInvoiceId", "currencyProvenance", "description", "postedAt")
        VALUES ('payment_fx', 'tenant_1', 'EUR', 100, 'USD', 132, 2, 1.32, 'eur_payment', 'AP_PAYMENT', 'payable_fx', 'DOCUMENT', 'Paid payable', '2026-10-07T12:00:00Z');
      INSERT INTO "JournalLine" ("id", "tenantId", "entryId", "accountId", "side", "amount", "baseAmount") VALUES
        ('payment_payable_fx', 'tenant_1', 'payment_fx', 'payable_eur', 'DEBIT', 100, 120),
        ('payment_cash_fx', 'tenant_1', 'payment_fx', 'cash_eur', 'CREDIT', 100, 132),
        ('payment_loss_fx', 'tenant_1', 'payment_fx', 'fx_loss_usd', 'DEBIT', 0, 12);
      COMMIT;
    `)
    const totals = await db.query(`SELECT sum("baseAmount") FILTER (WHERE "side" = 'DEBIT')::text AS debits, sum("baseAmount") FILTER (WHERE "side" = 'CREDIT')::text AS credits FROM "JournalLine" WHERE "entryId" = 'payment_fx'`)
    expect(totals.rows[0]).toEqual({ debits: '132.0000', credits: '132.0000' })
    await expect(db.exec(`UPDATE "JournalEntry" SET "baseAmount" = 133 WHERE "id" = 'payment_fx'`)).rejects.toMatchObject({ code: '23514' })
  })

  it('stores append-only effective FX quotes and locks the workspace base denomination', async () => {
    await db.exec(`INSERT INTO "Tenant" ("id", "currency") VALUES ('tenant_1', 'USD'); INSERT INTO "User" VALUES ('admin_1')`)
    await db.exec(`INSERT INTO "ExchangeRate" ("id", "tenantId", "currency", "rateToBase", "effectiveAt", "createdById") VALUES ('rate_1', 'tenant_1', 'EUR', 1.087654321012, '2026-10-07T10:00:00Z', 'admin_1')`)
    const result = await db.query(`SELECT rate."rateToBase"::text, tenant."currencyLockedAt" IS NOT NULL AS locked FROM "ExchangeRate" rate JOIN "Tenant" tenant ON tenant."id" = rate."tenantId" WHERE rate."id" = 'rate_1'`)
    expect(result.rows[0]).toMatchObject({ rateToBase: '1.087654321012', locked: true })
    await expect(db.exec(`INSERT INTO "ExchangeRate" ("id", "tenantId", "currency", "rateToBase", "effectiveAt") VALUES ('base_rate', 'tenant_1', 'USD', 1, CURRENT_TIMESTAMP)`)).rejects.toMatchObject({ code: '23514' })
    await expect(db.exec(`INSERT INTO "ExchangeRate" ("id", "tenantId", "currency", "rateToBase", "effectiveAt") VALUES ('zero_rate', 'tenant_1', 'GBP', 0, CURRENT_TIMESTAMP)`)).rejects.toMatchObject({ code: '23514' })
    await expect(db.exec(`INSERT INTO "ExchangeRate" ("id", "tenantId", "currency", "rateToBase", "effectiveAt") VALUES ('duplicate_rate', 'tenant_1', 'EUR', 1.2, '2026-10-07T10:00:00Z')`)).rejects.toMatchObject({ code: '23505' })
    await expect(db.exec(`UPDATE "ExchangeRate" SET "rateToBase" = 1.2 WHERE "id" = 'rate_1'`)).rejects.toMatchObject({ code: '23514' })
    await expect(db.exec(`DELETE FROM "ExchangeRate" WHERE "id" = 'rate_1'`)).rejects.toMatchObject({ code: '23514' })
  })

  it('requires and accepts an exact linked reversal before voiding a paid payroll run', async () => {
    await seedPaidRun()
    await db.exec(`
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "sourceType", "payrollRunId", "currencyProvenance", "description", "postedAt")
      VALUES ('payroll_paid', 'tenant_1', 'USD', 42.12, 'USD', 42.12, 2, 1, 'PAYROLL_PAYMENT', 'run_1', 'DOCUMENT', 'Payroll payment', '2026-10-07T00:00:00Z');
      INSERT INTO "JournalLine" ("id", "tenantId", "entryId", "accountId", "side", "amount", "baseAmount") VALUES
        ('payroll_paid_cash', 'tenant_1', 'payroll_paid', 'cash_1', 'CREDIT', 42.12, 42.12),
        ('payroll_paid_clearing', 'tenant_1', 'payroll_paid', 'payroll_1', 'DEBIT', 42.12, 42.12);
    `)
    await expect(db.exec(`UPDATE "PayrollRun" SET "status" = 'VOID' WHERE "id" = 'run_1'`)).rejects.toMatchObject({ code: '23514' })
    await db.exec(`
      BEGIN;
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "sourceType", "reversesJournalEntryId", "reversalReason", "currencyProvenance", "description", "postedAt")
      VALUES ('payroll_reversal', 'tenant_1', 'USD', 42.12, 'USD', 42.12, 2, 1, 'SETTLEMENT_REVERSAL', 'payroll_paid', 'Payroll correction', 'DOCUMENT', 'Payroll reversal', '2026-10-08T00:00:00Z');
      INSERT INTO "JournalLine" ("id", "tenantId", "entryId", "accountId", "side", "amount", "baseAmount") VALUES
        ('payroll_reverse_cash', 'tenant_1', 'payroll_reversal', 'cash_1', 'DEBIT', 42.12, 42.12),
        ('payroll_reverse_clearing', 'tenant_1', 'payroll_reversal', 'payroll_1', 'CREDIT', 42.12, 42.12);
      UPDATE "PayrollRun" SET "status" = 'VOID', "voidReason" = 'Payroll correction' WHERE "id" = 'run_1';
      COMMIT;
    `)
    await expect(db.query(`UPDATE "PayrollRun" SET "status" = 'PAID' WHERE "id" = 'run_1'`)).rejects.toMatchObject({ code: '23514' })
    await expect(db.query(`UPDATE "PayrollLine" SET "net" = 1 WHERE "id" = 'line_1'`)).rejects.toMatchObject({ code: '23514' })
  })

  it('requires and accepts an exact linked reversal before voiding a reimbursed expense', async () => {
    await db.exec(`
      INSERT INTO "Tenant" ("id", "currency") VALUES ('tenant_1', 'USD');
      INSERT INTO "Expense" ("id", "tenantId", "amount", "currency", "status", "reimbursedAt") VALUES ('expense_void', 'tenant_1', 18.25, 'USD', 'REIMBURSED', '2026-10-07T00:00:00Z');
      INSERT INTO "LedgerAccount" VALUES
        ('cash_1', 'tenant_1', 'CASH_CLEARING', 'Manual cash', 'ASSET', 'USD'),
        ('reimbursement_1', 'tenant_1', 'REIMBURSEMENT_CLEARING', 'Reimbursement clearing', 'LIABILITY', 'USD');
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "sourceType", "expenseId", "currencyProvenance", "description", "postedAt")
      VALUES ('expense_paid', 'tenant_1', 'USD', 18.25, 'USD', 18.25, 2, 1, 'EXPENSE_REIMBURSEMENT', 'expense_void', 'DOCUMENT', 'Expense reimbursement', '2026-10-07T00:00:00Z');
      INSERT INTO "JournalLine" ("id", "tenantId", "entryId", "accountId", "side", "amount", "baseAmount") VALUES
        ('expense_paid_cash', 'tenant_1', 'expense_paid', 'cash_1', 'CREDIT', 18.25, 18.25),
        ('expense_paid_clearing', 'tenant_1', 'expense_paid', 'reimbursement_1', 'DEBIT', 18.25, 18.25);
    `)
    await expect(db.exec(`UPDATE "Expense" SET "status" = 'VOID' WHERE "id" = 'expense_void'`)).rejects.toMatchObject({ code: '23514' })
    await db.exec(`
      BEGIN;
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "sourceType", "reversesJournalEntryId", "reversalReason", "currencyProvenance", "description", "postedAt")
      VALUES ('expense_reversal', 'tenant_1', 'USD', 18.25, 'USD', 18.25, 2, 1, 'SETTLEMENT_REVERSAL', 'expense_paid', 'Refund received', 'DOCUMENT', 'Expense reversal', '2026-10-08T00:00:00Z');
      INSERT INTO "JournalLine" ("id", "tenantId", "entryId", "accountId", "side", "amount", "baseAmount") VALUES
        ('expense_reverse_cash', 'tenant_1', 'expense_reversal', 'cash_1', 'DEBIT', 18.25, 18.25),
        ('expense_reverse_clearing', 'tenant_1', 'expense_reversal', 'reimbursement_1', 'CREDIT', 18.25, 18.25);
      UPDATE "Expense" SET "status" = 'VOID', "voidReason" = 'Refund received' WHERE "id" = 'expense_void';
      COMMIT;
    `)
    await expect(db.query(`UPDATE "Expense" SET "status" = 'REIMBURSED' WHERE "id" = 'expense_void'`)).rejects.toMatchObject({ code: '23514' })
  })
})

describe('opening balance SQL enforcement', () => {
  it('accepts one balanced multi-account base-currency opening journal', async () => {
    await db.exec(`
      INSERT INTO "Tenant" ("id", "currency") VALUES ('opening_tenant', 'USD');
      INSERT INTO "LedgerAccount" VALUES
        ('opening_cash', 'opening_tenant', 'CASH', 'Cash', 'ASSET', 'USD'),
        ('opening_ar', 'opening_tenant', 'AR', 'Receivables', 'ASSET', 'USD'),
        ('opening_equity', 'opening_tenant', 'OPENING_EQUITY', 'Opening equity', 'EQUITY', 'USD');
      BEGIN;
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "sourceType", "currencyProvenance", "description", "actorId", "postedAt")
      VALUES ('opening_journal', 'opening_tenant', 'USD', 1200, 'USD', 1200, 2, 1, 'OPENING_BALANCE', 'MANUAL_BASE', 'Opening balances', 'admin_1', '2026-01-01T00:00:00Z');
      INSERT INTO "JournalLine" ("id", "tenantId", "entryId", "accountId", "side", "amount", "baseAmount") VALUES
        ('opening_line_cash', 'opening_tenant', 'opening_journal', 'opening_cash', 'DEBIT', 1000, 1000),
        ('opening_line_ar', 'opening_tenant', 'opening_journal', 'opening_ar', 'DEBIT', 200, 200),
        ('opening_line_equity', 'opening_tenant', 'opening_journal', 'opening_equity', 'CREDIT', 1200, 1200);
      COMMIT;
    `)
    expect((await db.query('SELECT "sourceType", "baseAmount"::text FROM "JournalEntry" WHERE "id" = $1', ['opening_journal'])).rows[0]).toEqual({ sourceType: 'OPENING_BALANCE', baseAmount: '1200.0000' })
    await expect(db.query(`
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "sourceType", "recognizesReceivableInvoiceId", "currencyProvenance", "description", "postedAt")
      VALUES ('predating_entry', 'opening_tenant', 'USD', 1, 'USD', 1, 2, 1, 'AR_RECOGNITION', 'old_invoice', 'DOCUMENT', 'Predates cutover', '2025-12-31T00:00:00Z')
    `)).rejects.toMatchObject({ code: '23514' })
  })

  it('rejects unbalanced opening lines and journals before the recorded cutover date', async () => {
    await db.exec(`
      INSERT INTO "Tenant" ("id", "currency") VALUES ('opening_tenant', 'USD');
      INSERT INTO "LedgerAccount" VALUES
        ('opening_cash', 'opening_tenant', 'CASH', 'Cash', 'ASSET', 'USD'),
        ('opening_equity', 'opening_tenant', 'OPENING_EQUITY', 'Opening equity', 'EQUITY', 'USD');
    `)
    await expect(db.exec(`
      BEGIN;
      INSERT INTO "JournalEntry" ("id", "tenantId", "currency", "amount", "baseCurrency", "baseAmount", "baseMinorUnitDigits", "fxRate", "sourceType", "currencyProvenance", "description", "postedAt")
      VALUES ('opening_bad', 'opening_tenant', 'USD', 100, 'USD', 100, 2, 1, 'OPENING_BALANCE', 'MANUAL_BASE', 'Bad opening', '2026-01-01T00:00:00Z');
      INSERT INTO "JournalLine" ("id", "tenantId", "entryId", "accountId", "side", "amount", "baseAmount") VALUES
        ('opening_bad_debit', 'opening_tenant', 'opening_bad', 'opening_cash', 'DEBIT', 100, 100),
        ('opening_bad_credit', 'opening_tenant', 'opening_bad', 'opening_equity', 'CREDIT', 90, 90);
      COMMIT;
    `)).rejects.toMatchObject({ code: '23514' })

  })
})
