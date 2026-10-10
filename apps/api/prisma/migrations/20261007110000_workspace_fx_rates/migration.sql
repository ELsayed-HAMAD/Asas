CREATE TABLE "ExchangeRate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "rateToBase" DECIMAL(24,12) NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'MANUAL' CHECK ("source" = 'MANUAL'),
  "reference" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExchangeRate_rateToBase_check" CHECK ("rateToBase" > 0),
  CONSTRAINT "ExchangeRate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExchangeRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ExchangeRate_tenantId_currency_effectiveAt_key" ON "ExchangeRate"("tenantId", "currency", "effectiveAt");
CREATE INDEX "ExchangeRate_tenantId_currency_effectiveAt_idx" ON "ExchangeRate"("tenantId", "currency", "effectiveAt");

CREATE FUNCTION asas_lock_currency_for_exchange_rate() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE base_currency TEXT;
BEGIN
  SELECT "currency" INTO base_currency FROM "Tenant" WHERE "id" = NEW."tenantId" FOR UPDATE;
  IF base_currency IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'ASAS_FX_INTEGRITY: Workspace does not exist';
  END IF;
  IF NEW."currency" = base_currency THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_FX_INTEGRITY: The workspace base currency does not need an FX rate';
  END IF;
  UPDATE "Tenant" SET "currencyLockedAt" = COALESCE("currencyLockedAt", CURRENT_TIMESTAMP) WHERE "id" = NEW."tenantId";
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ExchangeRate_lock_currency_before_insert"
BEFORE INSERT ON "ExchangeRate"
FOR EACH ROW EXECUTE FUNCTION asas_lock_currency_for_exchange_rate();

CREATE FUNCTION asas_exchange_rate_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ASAS_FX_INTEGRITY: FX quotes are append-only; add a new effective quote instead';
END;
$$;

CREATE TRIGGER "ExchangeRate_append_only"
BEFORE UPDATE OR DELETE ON "ExchangeRate"
FOR EACH ROW EXECUTE FUNCTION asas_exchange_rate_append_only();
