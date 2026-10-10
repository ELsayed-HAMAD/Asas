-- Opening balances are an explicit base-currency journal, posted once at the ledger cutover.
DO $$
DECLARE constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname FROM pg_constraint WHERE conrelid = '"LedgerAccount"'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%kind%'
  LOOP EXECUTE format('ALTER TABLE "LedgerAccount" DROP CONSTRAINT %I', constraint_row.conname); END LOOP;
END;
$$;
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_kind_check"
  CHECK ("kind" IN ('ASSET', 'LIABILITY', 'EQUITY', 'EXPENSE', 'INCOME'));

ALTER TABLE "JournalEntry" DROP CONSTRAINT "JournalEntry_source_shape_check";
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_source_shape_check" CHECK (
  ("sourceType" = 'AP_PAYMENT' AND "payableInvoiceId" IS NOT NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'AR_COLLECTION' AND "receivableInvoiceId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'PAYROLL_PAYMENT' AND "payrollRunId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "expenseId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'EXPENSE_REIMBURSEMENT' AND "expenseId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'SETTLEMENT_REVERSAL' AND "reversesJournalEntryId" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(btrim("reversalReason")) > 0 AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL)
  OR ("sourceType" = 'AP_RECOGNITION' AND "recognizesPayableInvoiceId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'AR_RECOGNITION' AND "recognizesReceivableInvoiceId" IS NOT NULL AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
  OR ("sourceType" = 'OPENING_BALANCE' AND "payableInvoiceId" IS NULL AND "receivableInvoiceId" IS NULL AND "payrollRunId" IS NULL AND "expenseId" IS NULL AND "recognizesPayableInvoiceId" IS NULL AND "recognizesReceivableInvoiceId" IS NULL AND "reversesJournalEntryId" IS NULL AND "reversalReason" IS NULL)
);

CREATE UNIQUE INDEX "JournalEntry_one_opening_balance_per_tenant"
  ON "JournalEntry" ("tenantId") WHERE "sourceType" = 'OPENING_BALANCE';

-- Serialize journal inserts per workspace and establish a single earliest cutover date.
CREATE OR REPLACE FUNCTION asas_guard_opening_balance_cutover() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cutover TIMESTAMP(3);
BEGIN
  PERFORM 1 FROM "Tenant" WHERE "id" = NEW."tenantId" FOR UPDATE;
  IF NEW."sourceType" = 'OPENING_BALANCE' THEN
    IF EXISTS (SELECT 1 FROM "JournalEntry" WHERE "tenantId" = NEW."tenantId") THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_OPENING_BALANCE: Opening balances must be posted before every other journal';
    END IF;
  ELSE
    SELECT "postedAt" INTO cutover FROM "JournalEntry"
      WHERE "tenantId" = NEW."tenantId" AND "sourceType" = 'OPENING_BALANCE';
    IF cutover IS NOT NULL AND NEW."postedAt" < cutover THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_OPENING_BALANCE: New journals cannot predate the opening-balance cutover';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "JournalEntry_opening_balance_cutover" BEFORE INSERT ON "JournalEntry"
  FOR EACH ROW EXECUTE FUNCTION asas_guard_opening_balance_cutover();

-- Extend the existing deferred validator without duplicating the source-settlement rules.
DO $$
DECLARE
  definition TEXT;
  old_count_check TEXT := 'IF line_count NOT IN (2, 3) OR debit_total <> entry_row."amount" OR credit_total <> entry_row."amount" THEN';
  new_count_check TEXT := 'IF (entry_row."sourceType" = ''OPENING_BALANCE'' AND (line_count < 2 OR line_count > 100)) OR (entry_row."sourceType" <> ''OPENING_BALANCE'' AND line_count NOT IN (2, 3)) OR debit_total <> entry_row."amount" OR credit_total <> entry_row."amount" THEN';
  old_branch TEXT := 'IF entry_row."sourceType" = ''SETTLEMENT_REVERSAL'' THEN';
  new_branch TEXT := 'IF entry_row."sourceType" = ''OPENING_BALANCE'' THEN
    IF entry_row."currencyProvenance" <> ''MANUAL_BASE'' OR entry_row."currency" <> entry_row."baseCurrency" OR entry_row."fxRate" <> 1 OR entry_row."exchangeRateId" IS NOT NULL
       OR base_debit_total <> entry_row."baseAmount" OR base_credit_total <> entry_row."baseAmount"
       OR EXISTS (SELECT 1 FROM "JournalLine" WHERE "entryId" = entry_id AND ("amount" <= 0 OR "baseAmount" IS DISTINCT FROM "amount")) THEN
      RAISE EXCEPTION USING ERRCODE = ''23514'', MESSAGE = ''ASAS_OPENING_BALANCE: Opening journal must be positive, balanced, and denominated in workspace base currency'';
    END IF;
    RETURN NULL;
  END IF;

  IF entry_row."sourceType" = ''SETTLEMENT_REVERSAL'' THEN';
BEGIN
  SELECT pg_get_functiondef('asas_validate_settlement_journal()'::regprocedure) INTO definition;
  IF position(old_count_check IN definition) = 0 OR position(old_branch IN definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate expected integrity-check fragments in asas_validate_settlement_journal';
  END IF;
  definition := replace(definition, old_count_check, new_count_check);
  definition := replace(definition, old_branch, new_branch);
  EXECUTE definition;
END;
$$;
