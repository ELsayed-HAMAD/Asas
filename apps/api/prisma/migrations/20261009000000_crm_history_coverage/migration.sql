-- Establish an explicit history boundary, then snapshot each current deal's stage at that
-- instant. Earlier stage history is incomplete for legacy deals, so comparisons before this
-- boundary must remain unavailable instead of presenting a fabricated count.
CREATE TABLE "CrmHistoryCoverage" (
  "tenantId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmHistoryCoverage_pkey" PRIMARY KEY ("tenantId"),
  CONSTRAINT "CrmHistoryCoverage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SettlementHistoryCoverage" (
  "tenantId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SettlementHistoryCoverage_pkey" PRIMARY KEY ("tenantId"),
  CONSTRAINT "SettlementHistoryCoverage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "DealStageHistory" ADD COLUMN "isBaseline" BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX "DealStageHistory_tenantId_dealId_occurredAt_id_idx"
  ON "DealStageHistory" ("tenantId", "dealId", "occurredAt" DESC, "id" DESC);

INSERT INTO "CrmHistoryCoverage" ("tenantId", "startsAt")
SELECT "id", CURRENT_TIMESTAMP AT TIME ZONE 'UTC' FROM "Tenant";

INSERT INTO "SettlementHistoryCoverage" ("tenantId", "startsAt")
SELECT "id", CURRENT_TIMESTAMP AT TIME ZONE 'UTC' FROM "Tenant";

INSERT INTO "DealStageHistory" (
  "id", "tenantId", "dealId", "fromStage", "toStage", "occurredAt",
  "actorId", "ownerEmployeeId", "value", "isBaseline"
)
SELECT
  'c' || substr(md5(deal."tenantId" || ':' || deal."id"), 1, 24),
  deal."tenantId", deal."id", NULL, deal."stage", coverage."startsAt",
  NULL, deal."ownerEmployeeId", deal."value", TRUE
FROM "Deal" AS deal
JOIN "CrmHistoryCoverage" AS coverage ON coverage."tenantId" = deal."tenantId";

CREATE FUNCTION create_crm_history_coverage_for_tenant() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "CrmHistoryCoverage" ("tenantId", "startsAt")
  VALUES (NEW."id", CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
  ON CONFLICT ("tenantId") DO NOTHING;
  INSERT INTO "SettlementHistoryCoverage" ("tenantId", "startsAt")
  VALUES (NEW."id", CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
  ON CONFLICT ("tenantId") DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Tenant_crm_history_coverage_insert"
  AFTER INSERT ON "Tenant"
  FOR EACH ROW EXECUTE FUNCTION create_crm_history_coverage_for_tenant();
