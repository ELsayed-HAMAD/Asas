-- Lock the current reporting denomination, without guessing legacy record currencies.
ALTER TABLE "Tenant" ADD COLUMN "currencyLockedAt" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN "currency" TEXT;
ALTER TABLE "PayableInvoice" ADD COLUMN "currency" TEXT;
ALTER TABLE "ReceivableInvoice" ADD COLUMN "currency" TEXT;
ALTER TABLE "Expense" ADD COLUMN "currency" TEXT;
ALTER TABLE "LedgerTransaction" ADD COLUMN "currency" TEXT;
ALTER TABLE "CashFlowSnapshot" ADD COLUMN "currency" TEXT;
ALTER TABLE "Deal" ADD COLUMN "currency" TEXT;
ALTER TABLE "SalesQuota" ADD COLUMN "currency" TEXT;
ALTER TABLE "ForecastSnapshot" ADD COLUMN "currency" TEXT;
ALTER TABLE "Product" ADD COLUMN "currency" TEXT;
ALTER TABLE "Project" ADD COLUMN "currency" TEXT;

UPDATE "Tenant" AS tenant SET "currencyLockedAt" = CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Employee" WHERE "tenantId" = tenant."id" AND "salary" IS NOT NULL)
   OR EXISTS (SELECT 1 FROM "PayrollRun" WHERE "tenantId" = tenant."id")
   OR EXISTS (SELECT 1 FROM "PayableInvoice" WHERE "tenantId" = tenant."id")
   OR EXISTS (SELECT 1 FROM "ReceivableInvoice" WHERE "tenantId" = tenant."id")
   OR EXISTS (SELECT 1 FROM "Expense" WHERE "tenantId" = tenant."id")
   OR EXISTS (SELECT 1 FROM "LedgerTransaction" WHERE "tenantId" = tenant."id")
   OR EXISTS (SELECT 1 FROM "CashFlowSnapshot" WHERE "tenantId" = tenant."id")
   OR EXISTS (SELECT 1 FROM "Deal" WHERE "tenantId" = tenant."id")
   OR EXISTS (SELECT 1 FROM "SalesQuota" WHERE "tenantId" = tenant."id")
   OR EXISTS (SELECT 1 FROM "ForecastSnapshot" WHERE "tenantId" = tenant."id")
   OR EXISTS (SELECT 1 FROM "Product" WHERE "tenantId" = tenant."id")
   OR EXISTS (SELECT 1 FROM "Project" WHERE "tenantId" = tenant."id");

CREATE FUNCTION asas_guard_workspace_currency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."currencyLockedAt" IS NOT NULL THEN
    IF NEW."currency" IS DISTINCT FROM OLD."currency"
       OR NEW."currencyLockedAt" IS DISTINCT FROM OLD."currencyLockedAt" THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'ASAS_CURRENCY_LOCKED: Base currency is fixed once monetary data exists';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Tenant_currency_integrity" BEFORE UPDATE ON "Tenant"
FOR EACH ROW EXECUTE FUNCTION asas_guard_workspace_currency();

CREATE FUNCTION asas_snapshot_record_currency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  base_currency TEXT;
  locked_at TIMESTAMP(3);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
       OR NEW."currency" IS DISTINCT FROM OLD."currency" THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'ASAS_CURRENCY_CONFLICT: Monetary record currency and workspace cannot be relabeled';
    END IF;
  END IF;

  -- Salary-free employee records do not establish a monetary denomination.
  IF TG_TABLE_NAME = 'Employee' AND to_jsonb(NEW)->>'salary' IS NULL AND NEW."currency" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "currency", "currencyLockedAt" INTO base_currency, locked_at
  FROM "Tenant" WHERE "id" = NEW."tenantId";
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Monetary record workspace does not exist';
  END IF;

  -- First money write and settings changes serialize on the same Tenant row.
  -- Already locked workspaces need no extra row UPDATE on each stock/payroll mutation.
  IF locked_at IS NULL THEN
    UPDATE "Tenant" SET "currencyLockedAt" = COALESCE("currencyLockedAt", CURRENT_TIMESTAMP)
    WHERE "id" = NEW."tenantId"
    RETURNING "currency" INTO base_currency;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."currency" IS NOT NULL AND NEW."currency" <> base_currency THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'ASAS_CURRENCY_CONFLICT: Prepared currency differs from the workspace base currency';
    END IF;
    NEW."currency" = COALESCE(NEW."currency", base_currency);
  ELSIF TG_TABLE_NAME = 'Employee' AND to_jsonb(OLD)->>'salary' IS NULL THEN
    -- The first salary assignment has a known current denomination.
    NEW."currency" = COALESCE(NEW."currency", base_currency);
  END IF;
  -- Preserve unknown legacy currency and previously snapshotted foreign currency on UPDATE.
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Employee_currency_integrity" BEFORE INSERT OR UPDATE ON "Employee" FOR EACH ROW EXECUTE FUNCTION asas_snapshot_record_currency();
CREATE TRIGGER "PayrollRun_currency_integrity" BEFORE INSERT OR UPDATE ON "PayrollRun" FOR EACH ROW EXECUTE FUNCTION asas_snapshot_record_currency();
CREATE TRIGGER "PayableInvoice_currency_integrity" BEFORE INSERT OR UPDATE ON "PayableInvoice" FOR EACH ROW EXECUTE FUNCTION asas_snapshot_record_currency();
CREATE TRIGGER "ReceivableInvoice_currency_integrity" BEFORE INSERT OR UPDATE ON "ReceivableInvoice" FOR EACH ROW EXECUTE FUNCTION asas_snapshot_record_currency();
CREATE TRIGGER "Expense_currency_integrity" BEFORE INSERT OR UPDATE ON "Expense" FOR EACH ROW EXECUTE FUNCTION asas_snapshot_record_currency();
CREATE TRIGGER "LedgerTransaction_currency_integrity" BEFORE INSERT OR UPDATE ON "LedgerTransaction" FOR EACH ROW EXECUTE FUNCTION asas_snapshot_record_currency();
CREATE TRIGGER "CashFlowSnapshot_currency_integrity" BEFORE INSERT OR UPDATE ON "CashFlowSnapshot" FOR EACH ROW EXECUTE FUNCTION asas_snapshot_record_currency();
CREATE TRIGGER "Deal_currency_integrity" BEFORE INSERT OR UPDATE ON "Deal" FOR EACH ROW EXECUTE FUNCTION asas_snapshot_record_currency();
CREATE TRIGGER "SalesQuota_currency_integrity" BEFORE INSERT OR UPDATE ON "SalesQuota" FOR EACH ROW EXECUTE FUNCTION asas_snapshot_record_currency();
CREATE TRIGGER "ForecastSnapshot_currency_integrity" BEFORE INSERT OR UPDATE ON "ForecastSnapshot" FOR EACH ROW EXECUTE FUNCTION asas_snapshot_record_currency();
CREATE TRIGGER "Product_currency_integrity" BEFORE INSERT OR UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION asas_snapshot_record_currency();
CREATE TRIGGER "Project_currency_integrity" BEFORE INSERT OR UPDATE ON "Project" FOR EACH ROW EXECUTE FUNCTION asas_snapshot_record_currency();
