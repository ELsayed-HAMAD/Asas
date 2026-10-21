-- AlterTable: Employee bank credentials
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankRoutingNumber" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankAccountNumber" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankAccountType" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankIban" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankBic" TEXT;

-- AlterTable: PayrollRun maker-checker
ALTER TABLE "PayrollRun" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "PayrollRun" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "PayrollRun" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;

-- AlterTable: JournalEntry payroll and expense recognition links
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "recognizesPayrollRunId" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "recognizesExpenseId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_tenantId_recognizesPayrollRunId_key" ON "JournalEntry"("tenantId", "recognizesPayrollRunId");
CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_tenantId_recognizesExpenseId_key" ON "JournalEntry"("tenantId", "recognizesExpenseId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'JournalEntry_recognizesPayrollRunId_tenantId_fkey'
  ) THEN
    ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_recognizesPayrollRunId_tenantId_fkey"
      FOREIGN KEY ("recognizesPayrollRunId", "tenantId") REFERENCES "PayrollRun"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'JournalEntry_recognizesExpenseId_tenantId_fkey'
  ) THEN
    ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_recognizesExpenseId_tenantId_fkey"
      FOREIGN KEY ("recognizesExpenseId", "tenantId") REFERENCES "Expense"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END;
$$;

-- Replace JournalEntry_source_shape_check to support payroll and expense recognition
ALTER TABLE "JournalEntry" DROP CONSTRAINT IF EXISTS "JournalEntry_source_shape_check";
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_source_shape_check" CHECK (
  ("sourceType" = 'AP_PAYMENT' AND "payableInvoiceId" IS NOT NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL AND "recognizesPayrollRunId" IS NULL AND "recognizesExpenseId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'AR_COLLECTION' AND "receivableInvoiceId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL AND "recognizesPayrollRunId" IS NULL AND "recognizesExpenseId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'PAYROLL_PAYMENT' AND "payrollRunId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "expenseId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL AND "recognizesPayrollRunId" IS NULL AND "recognizesExpenseId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'EXPENSE_REIMBURSEMENT' AND "expenseId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL AND "recognizesPayrollRunId" IS NULL AND "recognizesExpenseId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'SETTLEMENT_REVERSAL' AND "reversesJournalEntryId" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(btrim("reversalReason")) > 0 AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL AND "recognizesPayrollRunId" IS NULL AND "recognizesExpenseId" IS NULL)
  OR ("sourceType" = 'AP_RECOGNITION' AND "recognizesPayableInvoiceId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL AND "recognizesPayrollRunId" IS NULL AND "recognizesExpenseId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'AR_RECOGNITION' AND "recognizesReceivableInvoiceId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "recognizesPayrollRunId" IS NULL AND "recognizesExpenseId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'PAYROLL_RECOGNITION' AND "recognizesPayrollRunId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL AND "recognizesExpenseId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'EXPENSE_RECOGNITION' AND "recognizesExpenseId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL AND "recognizesPayrollRunId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'OPENING_BALANCE' AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL AND "recognizesPayrollRunId" IS NULL AND "recognizesExpenseId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
);

-- Update trigger function for settlement and recognition validation
CREATE OR REPLACE FUNCTION asas_validate_settlement_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  entry_id TEXT;
  entry_row "JournalEntry"%ROWTYPE;
  original "JournalEntry"%ROWTYPE;
  source_amount NUMERIC;
  source_currency TEXT;
  source_status TEXT;
  source_paid_at TIMESTAMP(3);
  line_count BIGINT;
  debit_total NUMERIC;
  credit_total NUMERIC;
  base_debit_total NUMERIC;
  base_credit_total NUMERIC;
  cash_count BIGINT;
  account_count BIGINT;
  fx_count BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'JournalEntry' THEN entry_id = NEW."id"; ELSE entry_id = NEW."entryId"; END IF;
  SELECT * INTO entry_row FROM "JournalEntry" WHERE "id" = entry_id;
  SELECT count(*), COALESCE(sum("amount") FILTER (WHERE "side" = 'DEBIT'), 0), COALESCE(sum("amount") FILTER (WHERE "side" = 'CREDIT'), 0),
    COALESCE(sum("baseAmount") FILTER (WHERE "side" = 'DEBIT'), 0), COALESCE(sum("baseAmount") FILTER (WHERE "side" = 'CREDIT'), 0)
    INTO line_count, debit_total, credit_total, base_debit_total, base_credit_total FROM "JournalLine" WHERE "entryId" = entry_id;
  IF line_count NOT IN (2, 3) OR debit_total <> entry_row."amount" OR credit_total <> entry_row."amount" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Journal debits and credits must balance to the entry amount';
  END IF;
  IF entry_row."baseAmount" IS NOT NULL AND (base_debit_total <> entry_row."baseAmount" OR base_credit_total <> entry_row."baseAmount") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_FX_INTEGRITY: Journal base debits and credits must balance to its base amount';
  END IF;
  IF entry_row."baseAmount" IS NULL AND EXISTS (SELECT 1 FROM "JournalLine" WHERE "entryId" = entry_id AND "baseAmount" IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_FX_INTEGRITY: Unvalued journal cannot contain valued lines';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "JournalLine" line JOIN "LedgerAccount" account ON account."id" = line."accountId"
    WHERE line."entryId" = entry_id AND NOT (
      (account."code" IN ('FX_GAIN', 'FX_LOSS') AND account."currency" = entry_row."baseCurrency")
      OR (account."code" NOT IN ('FX_GAIN', 'FX_LOSS') AND account."currency" = entry_row."currency")
    )
  ) THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Journal account denomination is invalid'; END IF;

  IF entry_row."sourceType" = 'SETTLEMENT_REVERSAL' THEN
    SELECT * INTO original FROM "JournalEntry" WHERE "id" = entry_row."reversesJournalEntryId" AND "tenantId" = entry_row."tenantId";
    IF original."sourceType" NOT IN ('AP_PAYMENT', 'AR_COLLECTION', 'AP_RECOGNITION', 'AR_RECOGNITION', 'PAYROLL_PAYMENT', 'EXPENSE_REIMBURSEMENT', 'PAYROLL_RECOGNITION', 'EXPENSE_RECOGNITION')
       OR entry_row."amount" IS DISTINCT FROM original."amount" OR entry_row."currency" IS DISTINCT FROM original."currency"
       OR entry_row."currencyProvenance" IS DISTINCT FROM original."currencyProvenance"
       OR entry_row."baseCurrency" IS DISTINCT FROM original."baseCurrency" OR entry_row."baseAmount" IS DISTINCT FROM original."baseAmount"
       OR entry_row."fxRate" IS DISTINCT FROM original."fxRate" OR entry_row."exchangeRateId" IS DISTINCT FROM original."exchangeRateId"
       OR line_count <> (SELECT count(*) FROM "JournalLine" WHERE "entryId" = original."id")
       OR EXISTS (SELECT 1 FROM "JournalLine" rev LEFT JOIN "JournalLine" src ON src."entryId" = original."id"
          AND src."accountId" = rev."accountId" AND src."amount" = rev."amount" AND src."baseAmount" IS NOT DISTINCT FROM rev."baseAmount"
          AND src."side" = CASE rev."side" WHEN 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END
          WHERE rev."entryId" = entry_id AND src."id" IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Reversal must exactly offset its source entry';
    END IF;
    IF original."sourceType" IN ('AP_PAYMENT', 'AR_COLLECTION') AND NOT (
      (original."sourceType" = 'AP_PAYMENT' AND EXISTS (SELECT 1 FROM "PayableInvoice" WHERE "id" = original."payableInvoiceId" AND "tenantId" = entry_row."tenantId" AND "status"::text = 'VOID'))
      OR (original."sourceType" = 'AR_COLLECTION' AND EXISTS (SELECT 1 FROM "ReceivableInvoice" WHERE "id" = original."receivableInvoiceId" AND "tenantId" = entry_row."tenantId" AND "status"::text = 'VOID'))
    ) THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: A reversed settlement requires a void source'; END IF;
    RETURN NULL;
  END IF;

  IF entry_row."sourceType" = 'AP_PAYMENT' THEN
    SELECT "amount", "currency", "status"::text, "paidAt" INTO source_amount, source_currency, source_status, source_paid_at FROM "PayableInvoice" WHERE "id" = entry_row."payableInvoiceId" AND "tenantId" = entry_row."tenantId";
  ELSIF entry_row."sourceType" = 'AR_COLLECTION' THEN
    SELECT "amount", "currency", "status"::text, "paidAt" INTO source_amount, source_currency, source_status, source_paid_at FROM "ReceivableInvoice" WHERE "id" = entry_row."receivableInvoiceId" AND "tenantId" = entry_row."tenantId";
  ELSIF entry_row."sourceType" = 'AP_RECOGNITION' THEN
    SELECT "amount", "currency", "status"::text, "approvedAt" INTO source_amount, source_currency, source_status, source_paid_at FROM "PayableInvoice" WHERE "id" = entry_row."recognizesPayableInvoiceId" AND "tenantId" = entry_row."tenantId";
  ELSIF entry_row."sourceType" = 'AR_RECOGNITION' THEN
    SELECT "amount", "currency", "status"::text, "createdAt" INTO source_amount, source_currency, source_status, source_paid_at FROM "ReceivableInvoice" WHERE "id" = entry_row."recognizesReceivableInvoiceId" AND "tenantId" = entry_row."tenantId";
  ELSIF entry_row."sourceType" = 'PAYROLL_PAYMENT' THEN
    SELECT COALESCE(sum(line."net"), 0), run."currency", run."status"::text, run."paidAt" INTO source_amount, source_currency, source_status, source_paid_at
      FROM "PayrollRun" run LEFT JOIN "PayrollLine" line ON line."payrollRunId" = run."id" AND line."tenantId" = run."tenantId"
      WHERE run."id" = entry_row."payrollRunId" AND run."tenantId" = entry_row."tenantId" GROUP BY run."id";
  ELSIF entry_row."sourceType" = 'PAYROLL_RECOGNITION' THEN
    SELECT COALESCE(sum(line."net"), 0), run."currency", run."status"::text, run."approvedAt" INTO source_amount, source_currency, source_status, source_paid_at
      FROM "PayrollRun" run LEFT JOIN "PayrollLine" line ON line."payrollRunId" = run."id" AND line."tenantId" = run."tenantId"
      WHERE run."id" = entry_row."recognizesPayrollRunId" AND run."tenantId" = entry_row."tenantId" GROUP BY run."id";
  ELSIF entry_row."sourceType" = 'EXPENSE_RECOGNITION' THEN
    SELECT "amount", "currency", "status"::text, "approvedAt" INTO source_amount, source_currency, source_status, source_paid_at FROM "Expense" WHERE "id" = entry_row."recognizesExpenseId" AND "tenantId" = entry_row."tenantId";
  ELSE
    SELECT "amount", "currency", "status"::text, "reimbursedAt" INTO source_amount, source_currency, source_status, source_paid_at FROM "Expense" WHERE "id" = entry_row."expenseId" AND "tenantId" = entry_row."tenantId";
  END IF;

  IF (entry_row."sourceType" IN ('AP_PAYMENT', 'AR_COLLECTION', 'PAYROLL_PAYMENT') AND source_status IS DISTINCT FROM 'PAID'
       AND NOT (source_status = 'VOID' AND EXISTS (SELECT 1 FROM "JournalEntry" rev WHERE rev."reversesJournalEntryId" = entry_id)))
     OR (entry_row."sourceType" = 'EXPENSE_REIMBURSEMENT' AND source_status IS DISTINCT FROM 'REIMBURSED')
     OR (entry_row."sourceType" = 'AP_RECOGNITION' AND source_status NOT IN ('APPROVED', 'SCHEDULED', 'PAID')
       AND NOT EXISTS (SELECT 1 FROM "JournalEntry" rev WHERE rev."reversesJournalEntryId" = entry_id))
     OR (entry_row."sourceType" = 'AR_RECOGNITION' AND source_status NOT IN ('CURRENT', 'OVERDUE', 'PAID')
       AND NOT EXISTS (SELECT 1 FROM "JournalEntry" rev WHERE rev."reversesJournalEntryId" = entry_id))
     OR (entry_row."sourceType" = 'PAYROLL_RECOGNITION' AND source_status NOT IN ('APPROVED', 'PAID')
       AND NOT EXISTS (SELECT 1 FROM "JournalEntry" rev WHERE rev."reversesJournalEntryId" = entry_id))
     OR (entry_row."sourceType" = 'EXPENSE_RECOGNITION' AND source_status NOT IN ('APPROVED', 'REIMBURSED')
       AND NOT EXISTS (SELECT 1 FROM "JournalEntry" rev WHERE rev."reversesJournalEntryId" = entry_id))
     OR (source_amount IS DISTINCT FROM entry_row."amount" AND NOT EXISTS (SELECT 1 FROM "JournalEntry" rev WHERE rev."reversesJournalEntryId" = entry_id))
     OR (entry_row."sourceType" NOT IN ('AP_RECOGNITION', 'AR_RECOGNITION', 'PAYROLL_RECOGNITION', 'EXPENSE_RECOGNITION') AND source_paid_at IS DISTINCT FROM entry_row."postedAt")
     OR (source_currency IS NOT NULL AND source_currency <> entry_row."currency" AND NOT EXISTS (SELECT 1 FROM "JournalEntry" rev WHERE rev."reversesJournalEntryId" = entry_id))
     OR (source_currency IS NULL AND entry_row."currencyProvenance" <> 'WORKSPACE_FALLBACK' AND NOT EXISTS (SELECT 1 FROM "JournalEntry" rev WHERE rev."reversesJournalEntryId" = entry_id))
     OR (source_currency IS NOT NULL AND entry_row."currencyProvenance" <> 'DOCUMENT' AND NOT EXISTS (SELECT 1 FROM "JournalEntry" rev WHERE rev."reversesJournalEntryId" = entry_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Journal must match its source amount, state and denomination';
  END IF;

  SELECT count(*) FILTER (WHERE account."code" = 'CASH_CLEARING' AND account."kind" = 'ASSET'
         AND line."side" = CASE WHEN entry_row."sourceType" IN ('AR_COLLECTION', 'AR_RECOGNITION') THEN 'DEBIT' ELSE 'CREDIT' END),
    count(*) FILTER (WHERE
      (entry_row."sourceType" = 'AP_PAYMENT' AND account."code" = 'ACCOUNTS_PAYABLE' AND account."kind" = 'LIABILITY' AND line."side" = 'DEBIT') OR
      (entry_row."sourceType" = 'AR_COLLECTION' AND account."code" = 'ACCOUNTS_RECEIVABLE' AND account."kind" = 'ASSET' AND line."side" = 'CREDIT') OR
      (entry_row."sourceType" = 'AP_RECOGNITION' AND account."code" = 'UNCLASSIFIED_EXPENSE' AND account."kind" = 'EXPENSE' AND line."side" = 'DEBIT') OR
      (entry_row."sourceType" = 'AP_RECOGNITION' AND account."code" = 'ACCOUNTS_PAYABLE' AND account."kind" = 'LIABILITY' AND line."side" = 'CREDIT') OR
      (entry_row."sourceType" = 'AR_RECOGNITION' AND account."code" = 'ACCOUNTS_RECEIVABLE' AND account."kind" = 'ASSET' AND line."side" = 'DEBIT') OR
      (entry_row."sourceType" = 'AR_RECOGNITION' AND account."code" = 'UNCLASSIFIED_REVENUE' AND account."kind" = 'INCOME' AND line."side" = 'CREDIT') OR
      (entry_row."sourceType" = 'PAYROLL_PAYMENT' AND account."code" = 'PAYROLL_CLEARING' AND account."kind" = 'LIABILITY' AND line."side" = 'DEBIT') OR
      (entry_row."sourceType" = 'PAYROLL_RECOGNITION' AND account."code" = 'UNCLASSIFIED_EXPENSE' AND account."kind" = 'EXPENSE' AND line."side" = 'DEBIT') OR
      (entry_row."sourceType" = 'PAYROLL_RECOGNITION' AND account."code" = 'PAYROLL_CLEARING' AND account."kind" = 'LIABILITY' AND line."side" = 'CREDIT') OR
      (entry_row."sourceType" = 'EXPENSE_RECOGNITION' AND account."code" = 'UNCLASSIFIED_EXPENSE' AND account."kind" = 'EXPENSE' AND line."side" = 'DEBIT') OR
      (entry_row."sourceType" = 'EXPENSE_RECOGNITION' AND account."code" = 'REIMBURSEMENT_CLEARING' AND account."kind" = 'LIABILITY' AND line."side" = 'CREDIT') OR
      (entry_row."sourceType" = 'EXPENSE_REIMBURSEMENT' AND account."code" = 'REIMBURSEMENT_CLEARING' AND account."kind" = 'LIABILITY' AND line."side" = 'DEBIT')),
    count(*) FILTER (WHERE account."code" IN ('FX_GAIN', 'FX_LOSS')
      AND ((account."code" = 'FX_GAIN' AND account."kind" = 'INCOME' AND line."side" = 'CREDIT')
        OR (account."code" = 'FX_LOSS' AND account."kind" = 'EXPENSE' AND line."side" = 'DEBIT')))
    INTO cash_count, account_count, fx_count FROM "JournalLine" line JOIN "LedgerAccount" account ON account."id" = line."accountId" WHERE line."entryId" = entry_id;
  IF entry_row."sourceType" = 'AR_RECOGNITION' THEN
    IF cash_count <> 0 OR account_count <> 2 OR fx_count <> 0 OR line_count <> 2 THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: AR recognition requires receivable debit and revenue credit'; END IF;
  ELSIF entry_row."sourceType" = 'AP_RECOGNITION' THEN
    IF cash_count <> 0 OR account_count <> 2 OR fx_count <> 0 OR line_count <> 2 THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: AP recognition requires expense debit and payable credit'; END IF;
  ELSIF entry_row."sourceType" = 'PAYROLL_RECOGNITION' THEN
    IF cash_count <> 0 OR account_count <> 2 OR fx_count <> 0 OR line_count <> 2 THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Payroll recognition requires expense debit and payroll clearing credit'; END IF;
  ELSIF entry_row."sourceType" = 'EXPENSE_RECOGNITION' THEN
    IF cash_count <> 0 OR account_count <> 2 OR fx_count <> 0 OR line_count <> 2 THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Expense recognition requires expense debit and reimbursement clearing credit'; END IF;
  ELSIF entry_row."sourceType" IN ('AP_PAYMENT', 'AR_COLLECTION') THEN
    IF cash_count <> 1 OR account_count <> 1 OR fx_count > 1 OR line_count <> 2 + fx_count THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: AP/AR settlement requires cash, control and optional FX account'; END IF;
  ELSIF cash_count <> 1 OR account_count <> 1 OR fx_count <> 0 OR line_count <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Settlement requires its cash and control accounts';
  END IF;
  RETURN NULL;
END;
$$;

-- Update reversal validator trigger function
CREATE OR REPLACE FUNCTION asas_validate_payroll_expense_reversal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original "JournalEntry"%ROWTYPE; source_status TEXT;
BEGIN
  IF NEW."sourceType" <> 'SETTLEMENT_REVERSAL' THEN RETURN NULL; END IF;
  SELECT * INTO original FROM "JournalEntry"
    WHERE "id" = NEW."reversesJournalEntryId" AND "tenantId" = NEW."tenantId";
  IF original."sourceType" = 'PAYROLL_PAYMENT' THEN
    SELECT "status"::text INTO source_status FROM "PayrollRun"
      WHERE "id" = original."payrollRunId" AND "tenantId" = NEW."tenantId";
    IF source_status IS DISTINCT FROM 'VOID' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: A reversed payroll payment requires a void payroll run';
    END IF;
  ELSIF original."sourceType" = 'EXPENSE_REIMBURSEMENT' THEN
    SELECT "status"::text INTO source_status FROM "Expense"
      WHERE "id" = original."expenseId" AND "tenantId" = NEW."tenantId";
    IF source_status IS DISTINCT FROM 'VOID' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: A reversed reimbursement requires a void expense';
    END IF;
  ELSIF original."sourceType" = 'PAYROLL_RECOGNITION' THEN
    SELECT "status"::text INTO source_status FROM "PayrollRun"
      WHERE "id" = original."recognizesPayrollRunId" AND "tenantId" = NEW."tenantId";
    IF source_status IS DISTINCT FROM 'VOID' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: A reversed payroll recognition requires a void payroll run';
    END IF;
  ELSIF original."sourceType" = 'EXPENSE_RECOGNITION' THEN
    SELECT "status"::text INTO source_status FROM "Expense"
      WHERE "id" = original."recognizesExpenseId" AND "tenantId" = NEW."tenantId";
    IF source_status NOT IN ('VOID', 'REJECTED') THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: A reversed expense recognition requires a void or rejected expense';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- Backfill EmployeeSalaryHistory for existing employees with salary but missing history
INSERT INTO "EmployeeSalaryHistory" ("id", "tenantId", "employeeId", "salary", "salaryBasis", "currency", "effectiveFrom", "createdAt")
SELECT 
  'backfill_' || e."id",
  e."tenantId",
  e."id",
  e."salary",
  COALESCE(e."salaryBasis", 'MONTHLY'),
  COALESCE(e."currency", t."currency"),
  COALESCE(e."hiredAt"::date, CURRENT_DATE),
  CURRENT_TIMESTAMP
FROM "Employee" e
JOIN "Tenant" t ON t."id" = e."tenantId"
WHERE e."salary" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "EmployeeSalaryHistory" h
    WHERE h."employeeId" = e."id" AND h."tenantId" = e."tenantId"
  );

