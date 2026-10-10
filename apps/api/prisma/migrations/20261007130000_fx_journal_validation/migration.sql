-- A legacy reversal keeps unknown historic FX basis unknown; all new postings carry a basis.
CREATE OR REPLACE FUNCTION asas_require_fx_journal_basis() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE original "JournalEntry"%ROWTYPE;
BEGIN
  IF NEW."sourceType" = 'SETTLEMENT_REVERSAL' THEN
    SELECT * INTO original FROM "JournalEntry"
      WHERE "id" = NEW."reversesJournalEntryId" AND "tenantId" = NEW."tenantId";
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_FX_INTEGRITY: Reversal source must exist';
    END IF;
    IF original."baseAmount" IS NULL THEN
      IF NEW."baseCurrency" IS NOT NULL OR NEW."baseAmount" IS NOT NULL OR NEW."baseMinorUnitDigits" IS NOT NULL
         OR NEW."fxRate" IS NOT NULL OR NEW."exchangeRateId" IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_FX_INTEGRITY: Legacy reversal cannot invent an FX basis';
      END IF;
      RETURN NEW;
    END IF;
    IF NEW."baseCurrency" IS DISTINCT FROM original."baseCurrency"
       OR NEW."baseAmount" IS DISTINCT FROM original."baseAmount"
       OR NEW."baseMinorUnitDigits" IS DISTINCT FROM original."baseMinorUnitDigits"
       OR NEW."fxRate" IS DISTINCT FROM original."fxRate"
       OR NEW."exchangeRateId" IS DISTINCT FROM original."exchangeRateId" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_FX_INTEGRITY: Reversal must preserve the original FX basis';
    END IF;
  ELSIF NEW."baseCurrency" IS NULL OR NEW."baseAmount" IS NULL OR NEW."baseMinorUnitDigits" IS NULL OR NEW."fxRate" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_FX_INTEGRITY: New journals require a recorded base amount and FX rate';
  END IF;
  IF NEW."baseAmount" IS NULL THEN RETURN NEW; END IF;
  IF NEW."baseMinorUnitDigits" < 0 OR NEW."baseMinorUnitDigits" > 8
     OR NEW."baseAmount" IS DISTINCT FROM round(NEW."amount" * NEW."fxRate", NEW."baseMinorUnitDigits") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_FX_INTEGRITY: Base amount must match the recorded rate and currency precision';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Tenant" WHERE "id" = NEW."tenantId" AND "currency" = NEW."baseCurrency") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_FX_INTEGRITY: Journal base currency must match its locked workspace denomination';
  END IF;
  IF NEW."exchangeRateId" IS NULL AND NEW."currency" <> NEW."baseCurrency" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_FX_INTEGRITY: Foreign-currency journals must reference the effective FX quote';
  END IF;
  IF NEW."exchangeRateId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ExchangeRate" rate WHERE rate."id" = NEW."exchangeRateId" AND rate."tenantId" = NEW."tenantId"
      AND rate."currency" = NEW."currency" AND rate."effectiveAt" <= NEW."postedAt" AND rate."rateToBase" = NEW."fxRate"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_FX_INTEGRITY: Journal FX quote must match its denomination and posting date';
  END IF;
  IF NEW."exchangeRateId" IS NULL AND NEW."fxRate" <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_FX_INTEGRITY: Base-currency journals must use a rate of one';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION asas_require_fx_journal_lines() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE entry_row "JournalEntry"%ROWTYPE; original "JournalEntry"%ROWTYPE;
BEGIN
  SELECT * INTO entry_row FROM "JournalEntry" WHERE "id" = NEW."entryId" AND "tenantId" = NEW."tenantId";
  IF entry_row."baseAmount" IS NOT NULL AND NEW."baseAmount" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_FX_INTEGRITY: Valued journal lines require a base amount';
  END IF;
  IF entry_row."baseAmount" IS NULL THEN
    SELECT * INTO original FROM "JournalEntry" WHERE "id" = entry_row."reversesJournalEntryId" AND "tenantId" = NEW."tenantId";
    IF original."baseAmount" IS NOT NULL OR NEW."baseAmount" IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_FX_INTEGRITY: Journal line FX basis must match its entry';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Replace the settlement validator so it balances both transaction and base-currency amounts.
-- The first failed deployment created this unused function before hitting the duplicate trigger.
DROP FUNCTION IF EXISTS asas_reject_posted_journal_mutation();
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
    IF original."sourceType" NOT IN ('AP_PAYMENT', 'AR_COLLECTION', 'AP_RECOGNITION', 'AR_RECOGNITION')
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
      (entry_row."sourceType" = 'EXPENSE_REIMBURSEMENT' AND account."code" = 'REIMBURSEMENT_CLEARING' AND account."kind" = 'LIABILITY' AND line."side" = 'DEBIT')),
    count(*) FILTER (WHERE account."code" IN ('FX_GAIN', 'FX_LOSS')
      AND ((account."code" = 'FX_GAIN' AND account."kind" = 'INCOME' AND line."side" = 'CREDIT')
        OR (account."code" = 'FX_LOSS' AND account."kind" = 'EXPENSE' AND line."side" = 'DEBIT')))
    INTO cash_count, account_count, fx_count FROM "JournalLine" line JOIN "LedgerAccount" account ON account."id" = line."accountId" WHERE line."entryId" = entry_id;
  IF entry_row."sourceType" = 'AR_RECOGNITION' THEN
    IF cash_count <> 0 OR account_count <> 2 OR fx_count <> 0 OR line_count <> 2 THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: AR recognition requires receivable debit and revenue credit'; END IF;
  ELSIF entry_row."sourceType" = 'AP_RECOGNITION' THEN
    IF cash_count <> 0 OR account_count <> 2 OR fx_count <> 0 OR line_count <> 2 THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: AP recognition requires expense debit and payable credit'; END IF;
  ELSIF entry_row."sourceType" IN ('AP_PAYMENT', 'AR_COLLECTION') THEN
    IF cash_count <> 1 OR account_count <> 1 OR fx_count > 1 OR line_count <> 2 + fx_count THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: AP/AR settlement requires cash, control and optional FX account'; END IF;
  ELSIF cash_count <> 1 OR account_count <> 1 OR fx_count <> 0 OR line_count <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Settlement requires its cash and control accounts';
  END IF;
  RETURN NULL;
END;
$$;
