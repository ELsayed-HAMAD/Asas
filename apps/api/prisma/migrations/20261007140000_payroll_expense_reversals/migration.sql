-- Paid payroll and reimbursed expenses can only be voided after an exact linked journal reversal.
ALTER TYPE "PayrollRunStatus" ADD VALUE IF NOT EXISTS 'VOID';
ALTER TYPE "ExpenseStatus" ADD VALUE IF NOT EXISTS 'VOID';

ALTER TABLE "PayrollRun"
  ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "voidedById" TEXT,
  ADD COLUMN IF NOT EXISTS "voidReason" TEXT;
ALTER TABLE "Expense"
  ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "voidedById" TEXT,
  ADD COLUMN IF NOT EXISTS "voidReason" TEXT;

-- Extend the existing exact reversal validator's source whitelist without replacing its FX,
-- line-offset, and source-integrity checks. Accept an already-extended definition on safe retry.
DO $$
DECLARE
  function_definition TEXT;
  old_clause TEXT := $needle$original."sourceType" NOT IN ('AP_PAYMENT', 'AR_COLLECTION', 'AP_RECOGNITION', 'AR_RECOGNITION')$needle$;
  new_clause TEXT := $replacement$original."sourceType" NOT IN ('AP_PAYMENT', 'AR_COLLECTION', 'AP_RECOGNITION', 'AR_RECOGNITION', 'PAYROLL_PAYMENT', 'EXPENSE_REIMBURSEMENT')$replacement$;
BEGIN
  function_definition := pg_get_functiondef('asas_validate_settlement_journal()'::regprocedure);
  IF position(old_clause IN function_definition) > 0 THEN
    EXECUTE replace(function_definition, old_clause, new_clause);
  ELSIF position(new_clause IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate the expected reversal-source validation clause';
  END IF;
END;
$$;

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
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS "JournalEntry_payroll_expense_reversal" ON "JournalEntry";
CREATE CONSTRAINT TRIGGER "JournalEntry_payroll_expense_reversal"
  AFTER INSERT ON "JournalEntry" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION asas_validate_payroll_expense_reversal();

CREATE OR REPLACE FUNCTION asas_guard_paid_payroll() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status"::text = 'PAID' AND
    (NEW."status" IS DISTINCT FROM OLD."status" OR NEW."paidAt" IS DISTINCT FROM OLD."paidAt"
     OR NEW."paidById" IS DISTINCT FROM OLD."paidById" OR NEW."currency" IS DISTINCT FROM OLD."currency"
     OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."id" IS DISTINCT FROM OLD."id") THEN
    IF NEW."status"::text = 'VOID' AND EXISTS (
      SELECT 1 FROM "JournalEntry" original JOIN "JournalEntry" reversal
        ON reversal."reversesJournalEntryId" = original."id" AND reversal."tenantId" = original."tenantId"
      WHERE original."tenantId" = OLD."tenantId" AND original."payrollRunId" = OLD."id"
        AND original."sourceType" = 'PAYROLL_PAYMENT' AND reversal."sourceType" = 'SETTLEMENT_REVERSAL'
    ) THEN RETURN NEW; END IF;
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: A paid payroll run requires a linked reversal before voiding';
  END IF;
  IF OLD."status"::text = 'VOID' AND (NEW."status" IS DISTINCT FROM OLD."status"
     OR NEW."paidAt" IS DISTINCT FROM OLD."paidAt" OR NEW."paidById" IS DISTINCT FROM OLD."paidById"
     OR NEW."currency" IS DISTINCT FROM OLD."currency" OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."id" IS DISTINCT FROM OLD."id") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: A void payroll run cannot be reopened or relabeled';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION asas_guard_paid_payroll_lines() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE run_id TEXT; line_id TEXT; prior_run_id TEXT; run_status TEXT;
BEGIN
  IF TG_TABLE_NAME = 'PayrollLine' THEN
    run_id = CASE WHEN TG_OP = 'DELETE' THEN OLD."payrollRunId" ELSE NEW."payrollRunId" END;
    IF TG_OP <> 'INSERT' THEN prior_run_id = OLD."payrollRunId"; END IF;
  ELSE
    line_id = CASE WHEN TG_OP = 'DELETE' THEN OLD."payrollLineId" ELSE NEW."payrollLineId" END;
    SELECT "payrollRunId" INTO run_id FROM "PayrollLine" WHERE "id" = line_id;
    IF TG_OP <> 'INSERT' THEN SELECT "payrollRunId" INTO prior_run_id FROM "PayrollLine" WHERE "id" = OLD."payrollLineId"; END IF;
  END IF;
  SELECT "status"::text INTO run_status FROM "PayrollRun" WHERE "id" = run_id;
  IF run_status IN ('PAID', 'VOID') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Paid or void payroll lines cannot be rewritten';
  END IF;
  IF prior_run_id IS NOT NULL THEN
    SELECT "status"::text INTO run_status FROM "PayrollRun" WHERE "id" = prior_run_id;
    IF run_status IN ('PAID', 'VOID') THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Paid or void payroll lines cannot be rewritten';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION asas_guard_reimbursed_expense() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status"::text = 'REIMBURSED' AND
    (NEW."status" IS DISTINCT FROM OLD."status" OR NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."reimbursedAt" IS DISTINCT FROM OLD."reimbursedAt" OR NEW."reimbursedById" IS DISTINCT FROM OLD."reimbursedById"
     OR NEW."currency" IS DISTINCT FROM OLD."currency" OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."id" IS DISTINCT FROM OLD."id") THEN
    IF NEW."status"::text = 'VOID' AND EXISTS (
      SELECT 1 FROM "JournalEntry" original JOIN "JournalEntry" reversal
        ON reversal."reversesJournalEntryId" = original."id" AND reversal."tenantId" = original."tenantId"
      WHERE original."tenantId" = OLD."tenantId" AND original."expenseId" = OLD."id"
        AND original."sourceType" = 'EXPENSE_REIMBURSEMENT' AND reversal."sourceType" = 'SETTLEMENT_REVERSAL'
    ) THEN RETURN NEW; END IF;
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: A reimbursed expense requires a linked reversal before voiding';
  END IF;
  IF OLD."status"::text = 'VOID' AND (NEW."status" IS DISTINCT FROM OLD."status"
     OR NEW."amount" IS DISTINCT FROM OLD."amount" OR NEW."reimbursedAt" IS DISTINCT FROM OLD."reimbursedAt"
     OR NEW."reimbursedById" IS DISTINCT FROM OLD."reimbursedById" OR NEW."currency" IS DISTINCT FROM OLD."currency"
     OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."id" IS DISTINCT FROM OLD."id") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: A void expense cannot be reopened or relabeled';
  END IF;
  RETURN NEW;
END;
$$;
