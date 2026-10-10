-- Add accrual recognition journals and real AP/AR control accounts without backfilling history.
ALTER TABLE "JournalEntry"
  ADD COLUMN "recognizesPayableInvoiceId" TEXT,
  ADD COLUMN "recognizesReceivableInvoiceId" TEXT;
CREATE INDEX "JournalEntry_tenantId_recognizesPayableInvoiceId_idx" ON "JournalEntry"("tenantId", "recognizesPayableInvoiceId");
CREATE INDEX "JournalEntry_tenantId_recognizesReceivableInvoiceId_idx" ON "JournalEntry"("tenantId", "recognizesReceivableInvoiceId");
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_recognizesPayableInvoiceId_tenantId_fkey"
  FOREIGN KEY ("recognizesPayableInvoiceId", "tenantId") REFERENCES "PayableInvoice"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_recognizesReceivableInvoiceId_tenantId_fkey"
  FOREIGN KEY ("recognizesReceivableInvoiceId", "tenantId") REFERENCES "ReceivableInvoice"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
DECLARE constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname FROM pg_constraint WHERE conrelid = '"LedgerAccount"'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%kind%'
  LOOP EXECUTE format('ALTER TABLE "LedgerAccount" DROP CONSTRAINT %I', constraint_row.conname); END LOOP;
END;
$$;
ALTER TABLE "LedgerAccount" DROP CONSTRAINT IF EXISTS "LedgerAccount_kind_check";
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_kind_check" CHECK ("kind" IN ('ASSET', 'LIABILITY', 'EXPENSE', 'INCOME'));

ALTER TABLE "JournalEntry" DROP CONSTRAINT "JournalEntry_source_shape_check";
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_source_shape_check" CHECK (
  ("sourceType" = 'AP_PAYMENT' AND "payableInvoiceId" IS NOT NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'AR_COLLECTION' AND "receivableInvoiceId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'PAYROLL_PAYMENT' AND "payrollRunId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "expenseId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'EXPENSE_REIMBURSEMENT' AND "expenseId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'SETTLEMENT_REVERSAL' AND "reversesJournalEntryId" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(btrim("reversalReason")) > 0 AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL)
  OR ("sourceType" = 'AP_RECOGNITION' AND "recognizesPayableInvoiceId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'AR_RECOGNITION' AND "recognizesReceivableInvoiceId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
);

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
  cash_count BIGINT;
  account_count BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'JournalEntry' THEN entry_id = NEW."id"; ELSE entry_id = NEW."entryId"; END IF;
  SELECT * INTO entry_row FROM "JournalEntry" WHERE "id" = entry_id;
  SELECT count(*), COALESCE(sum("amount") FILTER (WHERE "side" = 'DEBIT'), 0), COALESCE(sum("amount") FILTER (WHERE "side" = 'CREDIT'), 0)
    INTO line_count, debit_total, credit_total FROM "JournalLine" WHERE "entryId" = entry_id;
  IF line_count <> 2 OR debit_total <> entry_row."amount" OR credit_total <> entry_row."amount" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Journal debits and credits must balance to the entry amount';
  END IF;
  IF EXISTS (SELECT 1 FROM "JournalLine" line JOIN "LedgerAccount" account ON account."id" = line."accountId"
             WHERE line."entryId" = entry_id AND account."currency" <> entry_row."currency") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Journal and account currencies must match';
  END IF;

  IF entry_row."sourceType" = 'SETTLEMENT_REVERSAL' THEN
    SELECT * INTO original FROM "JournalEntry" WHERE "id" = entry_row."reversesJournalEntryId" AND "tenantId" = entry_row."tenantId";
    IF original."sourceType" NOT IN ('AP_PAYMENT', 'AR_COLLECTION', 'AP_RECOGNITION', 'AR_RECOGNITION')
       OR entry_row."amount" IS DISTINCT FROM original."amount" OR entry_row."currency" IS DISTINCT FROM original."currency"
       OR entry_row."currencyProvenance" IS DISTINCT FROM original."currencyProvenance"
       OR EXISTS (SELECT 1 FROM "JournalLine" rev LEFT JOIN "JournalLine" src ON src."entryId" = original."id"
          AND src."accountId" = rev."accountId" AND src."amount" = rev."amount"
          AND src."side" = CASE rev."side" WHEN 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END
          WHERE rev."entryId" = entry_id AND src."id" IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Reversal must exactly offset one AP/AR entry';
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
     OR (source_amount IS DISTINCT FROM entry_row."amount" AND NOT EXISTS (SELECT 1 FROM "JournalEntry" rev WHERE rev."reversesJournalEntryId" = entry_id))
     OR (entry_row."sourceType" NOT IN ('AP_RECOGNITION', 'AR_RECOGNITION') AND source_paid_at IS DISTINCT FROM entry_row."postedAt")
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
      (entry_row."sourceType" = 'EXPENSE_REIMBURSEMENT' AND account."code" = 'REIMBURSEMENT_CLEARING' AND account."kind" = 'LIABILITY' AND line."side" = 'DEBIT'))
    INTO cash_count, account_count FROM "JournalLine" line JOIN "LedgerAccount" account ON account."id" = line."accountId" WHERE line."entryId" = entry_id;
  IF entry_row."sourceType" = 'AR_RECOGNITION' THEN
    IF cash_count <> 0 OR account_count <> 2 THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: AR recognition requires receivable debit and revenue credit'; END IF;
  ELSIF entry_row."sourceType" = 'AP_RECOGNITION' THEN
    IF cash_count <> 0 OR account_count <> 2 THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: AP recognition requires expense debit and payable credit'; END IF;
  ELSIF cash_count <> 1 OR account_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Settlement requires its cash and control accounts';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION asas_guard_recognized_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE has_active_recognition BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'PayableInvoice' THEN
    SELECT EXISTS (SELECT 1 FROM "JournalEntry" recognition WHERE recognition."tenantId" = OLD."tenantId"
      AND recognition."recognizesPayableInvoiceId" = OLD."id" AND recognition."sourceType" = 'AP_RECOGNITION'
      AND NOT EXISTS (SELECT 1 FROM "JournalEntry" reversal WHERE reversal."reversesJournalEntryId" = recognition."id")) INTO has_active_recognition;
    IF has_active_recognition AND ((NEW."amount" IS DISTINCT FROM OLD."amount" OR NEW."currency" IS DISTINCT FROM OLD."currency")
      OR (NEW."status"::text IN ('PENDING', 'REJECTED', 'VOID') AND NEW."status" IS DISTINCT FROM OLD."status")) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Reverse payable recognition before editing or leaving its approved state';
    END IF;
  ELSE
    SELECT EXISTS (SELECT 1 FROM "JournalEntry" recognition WHERE recognition."tenantId" = OLD."tenantId"
      AND recognition."recognizesReceivableInvoiceId" = OLD."id" AND recognition."sourceType" = 'AR_RECOGNITION'
      AND NOT EXISTS (SELECT 1 FROM "JournalEntry" reversal WHERE reversal."reversesJournalEntryId" = recognition."id")) INTO has_active_recognition;
    IF has_active_recognition AND ((NEW."amount" IS DISTINCT FROM OLD."amount" OR NEW."currency" IS DISTINCT FROM OLD."currency")
      OR (NEW."status"::text = 'VOID' AND NEW."status" IS DISTINCT FROM OLD."status")) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Reverse receivable recognition before changing its amount or voiding it';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "PayableInvoice_recognition_guard" BEFORE UPDATE ON "PayableInvoice" FOR EACH ROW EXECUTE FUNCTION asas_guard_recognized_invoice();
CREATE TRIGGER "ReceivableInvoice_recognition_guard" BEFORE UPDATE ON "ReceivableInvoice" FOR EACH ROW EXECUTE FUNCTION asas_guard_recognized_invoice();
