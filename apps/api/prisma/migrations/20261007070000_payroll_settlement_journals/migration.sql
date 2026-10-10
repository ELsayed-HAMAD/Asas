-- Post manually confirmed payroll payments as immutable cash settlement journals.
ALTER TABLE "PayrollRun"
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "paidById" TEXT;
CREATE UNIQUE INDEX "PayrollRun_id_tenantId_key" ON "PayrollRun"("id", "tenantId");

ALTER TABLE "JournalEntry" ADD COLUMN "payrollRunId" TEXT;
CREATE UNIQUE INDEX "JournalEntry_tenantId_payrollRunId_key" ON "JournalEntry"("tenantId", "payrollRunId");
ALTER TABLE "JournalEntry"
  ADD CONSTRAINT "JournalEntry_payrollRunId_tenantId_fkey"
  FOREIGN KEY ("payrollRunId", "tenantId") REFERENCES "PayrollRun"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Replace only the prior source-shape check; amount and currency checks remain intact.
DO $$
DECLARE constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = '"JournalEntry"'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%"sourceType"%'
  LOOP
    EXECUTE format('ALTER TABLE "JournalEntry" DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END;
$$;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_source_shape_check" CHECK (
  ("sourceType" = 'AP_PAYMENT' AND "payableInvoiceId" IS NOT NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL)
  OR ("sourceType" = 'AR_COLLECTION' AND "receivableInvoiceId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "payrollRunId" IS NULL)
  OR ("sourceType" = 'PAYROLL_PAYMENT' AND "payrollRunId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL)
);

CREATE OR REPLACE FUNCTION asas_validate_settlement_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  entry_id TEXT;
  entry_row "JournalEntry"%ROWTYPE;
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

  IF entry_row."sourceType" = 'AP_PAYMENT' THEN
    SELECT "amount", "currency", "status"::text, "paidAt" INTO source_amount, source_currency, source_status, source_paid_at
    FROM "PayableInvoice" WHERE "id" = entry_row."payableInvoiceId" AND "tenantId" = entry_row."tenantId";
  ELSIF entry_row."sourceType" = 'AR_COLLECTION' THEN
    SELECT "amount", "currency", "status"::text, "paidAt" INTO source_amount, source_currency, source_status, source_paid_at
    FROM "ReceivableInvoice" WHERE "id" = entry_row."receivableInvoiceId" AND "tenantId" = entry_row."tenantId";
  ELSE
    SELECT COALESCE(sum(line."net"), 0), run."currency", run."status"::text, run."paidAt"
      INTO source_amount, source_currency, source_status, source_paid_at
    FROM "PayrollRun" run LEFT JOIN "PayrollLine" line ON line."payrollRunId" = run."id" AND line."tenantId" = run."tenantId"
    WHERE run."id" = entry_row."payrollRunId" AND run."tenantId" = entry_row."tenantId"
    GROUP BY run."id";
  END IF;
  IF source_status IS DISTINCT FROM 'PAID' OR source_amount IS DISTINCT FROM entry_row."amount"
     OR source_paid_at IS DISTINCT FROM entry_row."postedAt"
     OR (source_currency IS NOT NULL AND source_currency <> entry_row."currency")
     OR (source_currency IS NULL AND entry_row."currencyProvenance" <> 'WORKSPACE_FALLBACK')
     OR (source_currency IS NOT NULL AND entry_row."currencyProvenance" <> 'DOCUMENT') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Journal must match its paid source and denomination provenance';
  END IF;

  SELECT count(*) FILTER (WHERE account."code" = 'CASH_CLEARING' AND account."kind" = 'ASSET'
                          AND line."side" = CASE WHEN entry_row."sourceType" = 'AR_COLLECTION' THEN 'DEBIT' ELSE 'CREDIT' END),
         count(*) FILTER (WHERE (entry_row."sourceType" = 'AP_PAYMENT' AND account."code" = 'DISBURSEMENT_CLEARING' AND account."kind" = 'ASSET' AND line."side" = 'DEBIT')
                             OR (entry_row."sourceType" = 'AR_COLLECTION' AND account."code" = 'RECEIPT_CLEARING' AND account."kind" = 'LIABILITY' AND line."side" = 'CREDIT')
                             OR (entry_row."sourceType" = 'PAYROLL_PAYMENT' AND account."code" = 'PAYROLL_CLEARING' AND account."kind" = 'LIABILITY' AND line."side" = 'DEBIT'))
    INTO cash_count, clearing_count
    FROM "JournalLine" line JOIN "LedgerAccount" account ON account."id" = line."accountId" WHERE line."entryId" = entry_id;
  IF cash_count <> 1 OR clearing_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Settlement requires the correct cash and clearing sides';
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION asas_guard_paid_payroll() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status"::text = 'PAID' AND
    (NEW."status" IS DISTINCT FROM OLD."status" OR NEW."paidAt" IS DISTINCT FROM OLD."paidAt"
     OR NEW."paidById" IS DISTINCT FROM OLD."paidById" OR NEW."currency" IS DISTINCT FROM OLD."currency"
     OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."id" IS DISTINCT FROM OLD."id") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: A paid payroll run cannot be rewritten or reopened';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "PayrollRun_paid_source" BEFORE UPDATE ON "PayrollRun" FOR EACH ROW EXECUTE FUNCTION asas_guard_paid_payroll();

CREATE FUNCTION asas_guard_paid_payroll_lines() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  run_id TEXT;
  line_id TEXT;
  prior_run_id TEXT;
  run_status TEXT;
BEGIN
  IF TG_TABLE_NAME = 'PayrollLine' THEN
    run_id = CASE WHEN TG_OP = 'DELETE' THEN OLD."payrollRunId" ELSE NEW."payrollRunId" END;
    IF TG_OP <> 'INSERT' THEN prior_run_id = OLD."payrollRunId"; END IF;
  ELSE
    line_id = CASE WHEN TG_OP = 'DELETE' THEN OLD."payrollLineId" ELSE NEW."payrollLineId" END;
    SELECT "payrollRunId" INTO run_id FROM "PayrollLine" WHERE "id" = line_id;
    IF TG_OP <> 'INSERT' THEN
      SELECT "payrollRunId" INTO prior_run_id FROM "PayrollLine" WHERE "id" = OLD."payrollLineId";
    END IF;
  END IF;
  SELECT "status"::text INTO run_status FROM "PayrollRun" WHERE "id" = run_id;
  IF run_status = 'PAID' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Paid payroll lines cannot be rewritten';
  END IF;
  IF prior_run_id IS NOT NULL THEN
    SELECT "status"::text INTO run_status FROM "PayrollRun" WHERE "id" = prior_run_id;
    IF run_status = 'PAID' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Paid payroll lines cannot be rewritten';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
CREATE TRIGGER "PayrollLine_paid_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PayrollLine" FOR EACH ROW EXECUTE FUNCTION asas_guard_paid_payroll_lines();
CREATE TRIGGER "PayrollTaxLine_paid_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PayrollTaxLine" FOR EACH ROW EXECUTE FUNCTION asas_guard_paid_payroll_lines();
