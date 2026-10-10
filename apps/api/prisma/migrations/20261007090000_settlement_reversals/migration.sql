-- Preserve posted AP/AR settlements and correct them with an immutable opposite journal.
ALTER TABLE "JournalEntry"
  ADD COLUMN "reversesJournalEntryId" TEXT,
  ADD COLUMN "reversalReason" TEXT;
CREATE UNIQUE INDEX "JournalEntry_reversesJournalEntryId_key" ON "JournalEntry"("reversesJournalEntryId");
CREATE UNIQUE INDEX "JournalEntry_reversesJournalEntryId_tenantId_key" ON "JournalEntry"("reversesJournalEntryId", "tenantId");
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversesJournalEntryId_tenantId_fkey"
  FOREIGN KEY ("reversesJournalEntryId", "tenantId") REFERENCES "JournalEntry"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JournalEntry" DROP CONSTRAINT "JournalEntry_source_shape_check";
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_source_shape_check" CHECK (
  ("sourceType" = 'AP_PAYMENT' AND "payableInvoiceId" IS NOT NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'AR_COLLECTION' AND "receivableInvoiceId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'PAYROLL_PAYMENT' AND "payrollRunId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "expenseId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'EXPENSE_REIMBURSEMENT' AND "expenseId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'SETTLEMENT_REVERSAL' AND "reversesJournalEntryId" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(btrim("reversalReason")) > 0 AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL)
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
  clearing_count BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'JournalEntry' THEN entry_id = NEW."id"; ELSE entry_id = NEW."entryId"; END IF;
  SELECT * INTO entry_row FROM "JournalEntry" WHERE "id" = entry_id;
  SELECT count(*), COALESCE(sum("amount") FILTER (WHERE "side" = 'DEBIT'), 0),
                  COALESCE(sum("amount") FILTER (WHERE "side" = 'CREDIT'), 0)
    INTO line_count, debit_total, credit_total FROM "JournalLine" WHERE "entryId" = entry_id;
  IF line_count <> 2 OR debit_total <> entry_row."amount" OR credit_total <> entry_row."amount" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Settlement debits and credits must equal the source amount';
  END IF;
  IF EXISTS (SELECT 1 FROM "JournalLine" line JOIN "LedgerAccount" account ON account."id" = line."accountId"
             WHERE line."entryId" = entry_id AND account."currency" <> entry_row."currency") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Journal and account currencies must match';
  END IF;

  IF entry_row."sourceType" = 'SETTLEMENT_REVERSAL' THEN
    SELECT * INTO original FROM "JournalEntry" WHERE "id" = entry_row."reversesJournalEntryId" AND "tenantId" = entry_row."tenantId";
    IF original."sourceType" NOT IN ('AP_PAYMENT', 'AR_COLLECTION')
       OR entry_row."amount" IS DISTINCT FROM original."amount"
       OR entry_row."currency" IS DISTINCT FROM original."currency"
       OR entry_row."currencyProvenance" IS DISTINCT FROM original."currencyProvenance"
       OR NOT EXISTS (SELECT 1 FROM "JournalLine" WHERE "entryId" = original."id")
       OR EXISTS (
         SELECT 1 FROM "JournalLine" rev
         LEFT JOIN "JournalLine" source ON source."entryId" = original."id" AND source."accountId" = rev."accountId"
           AND source."amount" = rev."amount" AND source."side" = CASE rev."side" WHEN 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END
         WHERE rev."entryId" = entry_id AND source."id" IS NULL
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Reversal must exactly offset one AP/AR settlement';
    END IF;
    IF (original."sourceType" = 'AP_PAYMENT' AND NOT EXISTS (SELECT 1 FROM "PayableInvoice" WHERE "id" = original."payableInvoiceId" AND "tenantId" = entry_row."tenantId" AND "status"::text = 'VOID'))
       OR (original."sourceType" = 'AR_COLLECTION' AND NOT EXISTS (SELECT 1 FROM "ReceivableInvoice" WHERE "id" = original."receivableInvoiceId" AND "tenantId" = entry_row."tenantId" AND "status"::text = 'VOID')) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Reversed settlement source must be void';
    END IF;
    RETURN NULL;
  END IF;

  IF entry_row."sourceType" = 'AP_PAYMENT' THEN
    SELECT "amount", "currency", "status"::text, "paidAt" INTO source_amount, source_currency, source_status, source_paid_at
    FROM "PayableInvoice" WHERE "id" = entry_row."payableInvoiceId" AND "tenantId" = entry_row."tenantId";
  ELSIF entry_row."sourceType" = 'AR_COLLECTION' THEN
    SELECT "amount", "currency", "status"::text, "paidAt" INTO source_amount, source_currency, source_status, source_paid_at
    FROM "ReceivableInvoice" WHERE "id" = entry_row."receivableInvoiceId" AND "tenantId" = entry_row."tenantId";
  ELSIF entry_row."sourceType" = 'PAYROLL_PAYMENT' THEN
    SELECT COALESCE(sum(line."net"), 0), run."currency", run."status"::text, run."paidAt"
      INTO source_amount, source_currency, source_status, source_paid_at
    FROM "PayrollRun" run LEFT JOIN "PayrollLine" line ON line."payrollRunId" = run."id" AND line."tenantId" = run."tenantId"
    WHERE run."id" = entry_row."payrollRunId" AND run."tenantId" = entry_row."tenantId" GROUP BY run."id";
  ELSE
    SELECT "amount", "currency", "status"::text, "reimbursedAt" INTO source_amount, source_currency, source_status, source_paid_at
    FROM "Expense" WHERE "id" = entry_row."expenseId" AND "tenantId" = entry_row."tenantId";
  END IF;
  IF (entry_row."sourceType" = 'EXPENSE_REIMBURSEMENT' AND source_status IS DISTINCT FROM 'REIMBURSED')
     OR (entry_row."sourceType" <> 'EXPENSE_REIMBURSEMENT' AND source_status IS DISTINCT FROM 'PAID'
       AND NOT (source_status = 'VOID' AND EXISTS (SELECT 1 FROM "JournalEntry" reversal WHERE reversal."reversesJournalEntryId" = entry_id)))
     OR source_amount IS DISTINCT FROM entry_row."amount" OR source_paid_at IS DISTINCT FROM entry_row."postedAt"
     OR (source_currency IS NOT NULL AND source_currency <> entry_row."currency")
     OR (source_currency IS NULL AND entry_row."currencyProvenance" <> 'WORKSPACE_FALLBACK')
     OR (source_currency IS NOT NULL AND entry_row."currencyProvenance" <> 'DOCUMENT') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Journal must match its settled source and denomination provenance';
  END IF;

  SELECT count(*) FILTER (WHERE account."code" = 'CASH_CLEARING' AND account."kind" = 'ASSET'
                          AND line."side" = CASE WHEN entry_row."sourceType" = 'AR_COLLECTION' THEN 'DEBIT' ELSE 'CREDIT' END),
         count(*) FILTER (WHERE (entry_row."sourceType" = 'AP_PAYMENT' AND account."code" = 'DISBURSEMENT_CLEARING' AND account."kind" = 'ASSET' AND line."side" = 'DEBIT')
                             OR (entry_row."sourceType" = 'AR_COLLECTION' AND account."code" = 'RECEIPT_CLEARING' AND account."kind" = 'LIABILITY' AND line."side" = 'CREDIT')
                             OR (entry_row."sourceType" = 'PAYROLL_PAYMENT' AND account."code" = 'PAYROLL_CLEARING' AND account."kind" = 'LIABILITY' AND line."side" = 'DEBIT')
                             OR (entry_row."sourceType" = 'EXPENSE_REIMBURSEMENT' AND account."code" = 'REIMBURSEMENT_CLEARING' AND account."kind" = 'LIABILITY' AND line."side" = 'DEBIT'))
    INTO cash_count, clearing_count FROM "JournalLine" line JOIN "LedgerAccount" account ON account."id" = line."accountId" WHERE line."entryId" = entry_id;
  IF cash_count <> 1 OR clearing_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Settlement requires the correct cash and clearing sides';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION asas_guard_paid_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original_entry_id TEXT;
BEGIN
  IF OLD."status"::text = 'PAID' THEN
    IF NEW."status"::text = 'VOID' THEN
      IF NEW."amount" IS DISTINCT FROM OLD."amount" OR NEW."paidAt" IS DISTINCT FROM OLD."paidAt"
         OR NEW."currency" IS DISTINCT FROM OLD."currency" OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."id" IS DISTINCT FROM OLD."id" THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: A reversed source cannot be rewritten';
      END IF;
      IF TG_TABLE_NAME = 'PayableInvoice' THEN
        SELECT "id" INTO original_entry_id FROM "JournalEntry" WHERE "payableInvoiceId" = OLD."id" AND "tenantId" = OLD."tenantId" AND "sourceType" = 'AP_PAYMENT';
      ELSE
        SELECT "id" INTO original_entry_id FROM "JournalEntry" WHERE "receivableInvoiceId" = OLD."id" AND "tenantId" = OLD."tenantId" AND "sourceType" = 'AR_COLLECTION';
      END IF;
      IF original_entry_id IS NULL OR NOT EXISTS (SELECT 1 FROM "JournalEntry" WHERE "reversesJournalEntryId" = original_entry_id AND "tenantId" = OLD."tenantId") THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: A paid source requires a posted reversal before voiding';
      END IF;
    ELSIF NEW."status" IS DISTINCT FROM OLD."status" OR NEW."amount" IS DISTINCT FROM OLD."amount"
       OR NEW."paidAt" IS DISTINCT FROM OLD."paidAt" OR NEW."currency" IS DISTINCT FROM OLD."currency"
       OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."id" IS DISTINCT FROM OLD."id" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: A paid source cannot be rewritten or reopened';
    END IF;
  ELSIF OLD."status"::text = 'VOID' THEN
    IF TG_TABLE_NAME = 'PayableInvoice' THEN
      SELECT original."id" INTO original_entry_id FROM "JournalEntry" original JOIN "JournalEntry" reversal
        ON reversal."reversesJournalEntryId" = original."id" AND reversal."tenantId" = original."tenantId"
       WHERE original."payableInvoiceId" = OLD."id" AND original."tenantId" = OLD."tenantId";
    ELSE
      SELECT original."id" INTO original_entry_id FROM "JournalEntry" original JOIN "JournalEntry" reversal
        ON reversal."reversesJournalEntryId" = original."id" AND reversal."tenantId" = original."tenantId"
       WHERE original."receivableInvoiceId" = OLD."id" AND original."tenantId" = OLD."tenantId";
    END IF;
    IF original_entry_id IS NOT NULL AND (NEW."status" IS DISTINCT FROM OLD."status" OR NEW."amount" IS DISTINCT FROM OLD."amount"
       OR NEW."paidAt" IS DISTINCT FROM OLD."paidAt" OR NEW."currency" IS DISTINCT FROM OLD."currency"
       OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."id" IS DISTINCT FROM OLD."id") THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: A reversed source cannot be rewritten or reopened';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS "PayableInvoice_paid_source" ON "PayableInvoice";
CREATE TRIGGER "PayableInvoice_paid_source" BEFORE UPDATE ON "PayableInvoice" FOR EACH ROW EXECUTE FUNCTION asas_guard_paid_source();
DROP TRIGGER IF EXISTS "ReceivableInvoice_paid_source" ON "ReceivableInvoice";
CREATE TRIGGER "ReceivableInvoice_paid_source" BEFORE UPDATE ON "ReceivableInvoice" FOR EACH ROW EXECUTE FUNCTION asas_guard_paid_source();
