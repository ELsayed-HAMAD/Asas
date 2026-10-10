-- Record new manually confirmed AP/AR cash settlements. Do not manufacture legacy postings.
CREATE TABLE "LedgerAccount" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('ASSET', 'LIABILITY')),
  "currency" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("tenantId", "code"), UNIQUE ("id", "tenantId")
);
CREATE TABLE "JournalEntry" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "currency" TEXT NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL CHECK ("amount" >= 0),
  "sourceType" TEXT NOT NULL,
  "payableInvoiceId" TEXT,
  "receivableInvoiceId" TEXT,
  "currencyProvenance" TEXT NOT NULL CHECK ("currencyProvenance" IN ('DOCUMENT', 'WORKSPACE_FALLBACK')),
  "description" TEXT NOT NULL,
  "actorId" TEXT,
  "postedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("id", "tenantId"),
  UNIQUE ("tenantId", "payableInvoiceId"), UNIQUE ("tenantId", "receivableInvoiceId"),
  FOREIGN KEY ("payableInvoiceId", "tenantId") REFERENCES "PayableInvoice"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("receivableInvoiceId", "tenantId") REFERENCES "ReceivableInvoice"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (("sourceType" = 'AP_PAYMENT' AND "payableInvoiceId" IS NOT NULL AND "receivableInvoiceId" IS NULL)
      OR ("sourceType" = 'AR_COLLECTION' AND "receivableInvoiceId" IS NOT NULL AND "payableInvoiceId" IS NULL))
);
CREATE TABLE "JournalLine" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "side" TEXT NOT NULL CHECK ("side" IN ('DEBIT', 'CREDIT')),
  "amount" DECIMAL(19,4) NOT NULL CHECK ("amount" >= 0),
  FOREIGN KEY ("entryId", "tenantId") REFERENCES "JournalEntry"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("accountId", "tenantId") REFERENCES "LedgerAccount"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "JournalEntry_tenantId_postedAt_idx" ON "JournalEntry"("tenantId", "postedAt");
CREATE INDEX "JournalLine_tenantId_accountId_idx" ON "JournalLine"("tenantId", "accountId");
CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");
CREATE TRIGGER "LedgerAccount_currency_integrity" BEFORE INSERT OR UPDATE ON "LedgerAccount" FOR EACH ROW EXECUTE FUNCTION asas_snapshot_record_currency();
CREATE TRIGGER "JournalEntry_currency_integrity" BEFORE INSERT OR UPDATE ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION asas_snapshot_record_currency();

CREATE FUNCTION asas_immutable_posting() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Posted journals are append-only; use a future explicit reversal workflow';
END;
$$;
CREATE TRIGGER "JournalEntry_append_only" BEFORE UPDATE OR DELETE ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION asas_immutable_posting();
CREATE TRIGGER "JournalLine_append_only" BEFORE UPDATE OR DELETE ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION asas_immutable_posting();

CREATE FUNCTION asas_guard_account_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."code" IS DISTINCT FROM OLD."code" OR NEW."kind" IS DISTINCT FROM OLD."kind"
     OR NEW."currency" IS DISTINCT FROM OLD."currency" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Account identity cannot be relabeled';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "LedgerAccount_identity" BEFORE UPDATE ON "LedgerAccount" FOR EACH ROW EXECUTE FUNCTION asas_guard_account_identity();

CREATE FUNCTION asas_validate_settlement_journal() RETURNS trigger LANGUAGE plpgsql AS $$
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
  ELSE
    SELECT "amount", "currency", "status"::text, "paidAt" INTO source_amount, source_currency, source_status, source_paid_at
    FROM "ReceivableInvoice" WHERE "id" = entry_row."receivableInvoiceId" AND "tenantId" = entry_row."tenantId";
  END IF;
  IF source_status IS DISTINCT FROM 'PAID' OR source_amount IS DISTINCT FROM entry_row."amount"
     OR source_paid_at IS DISTINCT FROM entry_row."postedAt"
     OR (source_currency IS NOT NULL AND source_currency <> entry_row."currency")
     OR (source_currency IS NULL AND entry_row."currencyProvenance" <> 'WORKSPACE_FALLBACK')
     OR (source_currency IS NOT NULL AND entry_row."currencyProvenance" <> 'DOCUMENT') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Journal must match its paid source and denomination provenance';
  END IF;

  SELECT count(*) FILTER (WHERE account."code" = 'CASH_CLEARING' AND account."kind" = 'ASSET'
                          AND line."side" = CASE WHEN entry_row."sourceType" = 'AP_PAYMENT' THEN 'CREDIT' ELSE 'DEBIT' END),
         count(*) FILTER (WHERE (entry_row."sourceType" = 'AP_PAYMENT' AND account."code" = 'DISBURSEMENT_CLEARING' AND account."kind" = 'ASSET' AND line."side" = 'DEBIT')
                             OR (entry_row."sourceType" = 'AR_COLLECTION' AND account."code" = 'RECEIPT_CLEARING' AND account."kind" = 'LIABILITY' AND line."side" = 'CREDIT'))
    INTO cash_count, clearing_count
    FROM "JournalLine" line JOIN "LedgerAccount" account ON account."id" = line."accountId" WHERE line."entryId" = entry_id;
  IF cash_count <> 1 OR clearing_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: Cash settlement requires the correct cash and unclassified clearing sides';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "JournalEntry_balanced" AFTER INSERT ON "JournalEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION asas_validate_settlement_journal();
CREATE CONSTRAINT TRIGGER "JournalLine_balanced" AFTER INSERT ON "JournalLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION asas_validate_settlement_journal();

CREATE FUNCTION asas_guard_paid_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status"::text = 'PAID' AND
    (NEW."status" IS DISTINCT FROM OLD."status" OR NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."paidAt" IS DISTINCT FROM OLD."paidAt" OR NEW."currency" IS DISTINCT FROM OLD."currency"
     OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."id" IS DISTINCT FROM OLD."id") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_JOURNAL_INTEGRITY: A paid source cannot be rewritten or reopened';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "PayableInvoice_paid_source" BEFORE UPDATE ON "PayableInvoice" FOR EACH ROW EXECUTE FUNCTION asas_guard_paid_source();
CREATE TRIGGER "ReceivableInvoice_paid_source" BEFORE UPDATE ON "ReceivableInvoice" FOR EACH ROW EXECUTE FUNCTION asas_guard_paid_source();
