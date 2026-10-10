-- Preserve original denominations while adding a base-currency carrying value for future postings.
-- Existing journals remain nullable because their historical FX basis cannot be inferred safely.
ALTER TABLE "JournalEntry"
  ADD COLUMN "baseCurrency" TEXT,
  ADD COLUMN "baseAmount" DECIMAL(19,4),
  ADD COLUMN "baseMinorUnitDigits" INTEGER,
  ADD COLUMN "fxRate" DECIMAL(24,12),
  ADD COLUMN "exchangeRateId" TEXT,
  ADD CONSTRAINT "JournalEntry_baseAmount_check" CHECK ("baseAmount" IS NULL OR "baseAmount" >= 0),
  ADD CONSTRAINT "JournalEntry_fxRate_check" CHECK ("fxRate" IS NULL OR "fxRate" > 0);

ALTER TABLE "JournalLine"
  ADD COLUMN "baseAmount" DECIMAL(19,4),
  ADD CONSTRAINT "JournalLine_baseAmount_check" CHECK ("baseAmount" IS NULL OR "baseAmount" >= 0);

ALTER TABLE "LedgerAccount" DROP CONSTRAINT "LedgerAccount_tenantId_code_key";
CREATE UNIQUE INDEX "LedgerAccount_tenantId_code_currency_key" ON "LedgerAccount"("tenantId", "code", "currency");

CREATE UNIQUE INDEX "ExchangeRate_id_tenantId_key" ON "ExchangeRate"("id", "tenantId");
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_exchangeRateId_tenantId_fkey"
  FOREIGN KEY ("exchangeRateId", "tenantId") REFERENCES "ExchangeRate"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "JournalEntry_tenantId_exchangeRateId_idx" ON "JournalEntry"("tenantId", "exchangeRateId");

CREATE FUNCTION asas_require_fx_journal_basis() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."baseCurrency" IS NULL OR NEW."baseAmount" IS NULL OR NEW."baseMinorUnitDigits" IS NULL OR NEW."fxRate" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_FX_INTEGRITY: New journals require a recorded base amount and FX rate';
  END IF;
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
      AND rate."currency" = NEW."currency" AND rate."effectiveAt" <= NEW."postedAt"
      AND rate."rateToBase" = NEW."fxRate"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_FX_INTEGRITY: Journal FX quote must match its denomination and posting date';
  END IF;
  IF NEW."exchangeRateId" IS NULL AND NEW."fxRate" <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_FX_INTEGRITY: Base-currency journals must use a rate of one';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "JournalEntry_fx_basis_before_insert"
BEFORE INSERT ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION asas_require_fx_journal_basis();

-- New code must supply the historic base value for every line; old lines stay visibly unresolved.
CREATE FUNCTION asas_require_fx_journal_lines() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE entry_basis NUMERIC;
BEGIN
  SELECT "baseAmount" INTO entry_basis FROM "JournalEntry" WHERE "id" = NEW."entryId" AND "tenantId" = NEW."tenantId";
  IF entry_basis IS NOT NULL AND NEW."baseAmount" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_FX_INTEGRITY: New journal lines require a base amount';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "JournalLine_fx_basis_before_insert"
BEFORE INSERT ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION asas_require_fx_journal_lines();
