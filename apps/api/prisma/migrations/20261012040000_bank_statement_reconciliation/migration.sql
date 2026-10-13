CREATE TABLE "BankStatementImport" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankStatementImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankStatementLine" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "importId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "postedAt" DATE NOT NULL,
  "description" TEXT NOT NULL,
  "reference" TEXT,
  "currency" TEXT NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "matchedJournalLineId" TEXT,
  "matchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JournalLine_id_tenantId_key" ON "JournalLine"("id", "tenantId");
CREATE UNIQUE INDEX "BankStatementImport_tenantId_contentHash_key" ON "BankStatementImport"("tenantId", "contentHash");
CREATE UNIQUE INDEX "BankStatementImport_id_tenantId_key" ON "BankStatementImport"("id", "tenantId");
CREATE INDEX "BankStatementImport_tenantId_createdAt_idx" ON "BankStatementImport"("tenantId", "createdAt");
CREATE UNIQUE INDEX "BankStatementLine_id_tenantId_key" ON "BankStatementLine"("id", "tenantId");
CREATE UNIQUE INDEX "BankStatementLine_importId_fingerprint_key" ON "BankStatementLine"("importId", "fingerprint");
CREATE UNIQUE INDEX "BankStatementLine_matchedJournalLineId_tenantId_key" ON "BankStatementLine"("matchedJournalLineId", "tenantId");
CREATE INDEX "BankStatementLine_tenantId_postedAt_idx" ON "BankStatementLine"("tenantId", "postedAt");
CREATE INDEX "BankStatementLine_importId_matchedAt_idx" ON "BankStatementLine"("importId", "matchedAt");

ALTER TABLE "BankStatementImport"
  ADD CONSTRAINT "BankStatementImport_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BankStatementLine"
  ADD CONSTRAINT "BankStatementLine_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "BankStatementLine_importId_tenantId_fkey"
  FOREIGN KEY ("importId", "tenantId") REFERENCES "BankStatementImport"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "BankStatementLine_matchedJournalLineId_tenantId_fkey"
  FOREIGN KEY ("matchedJournalLineId", "tenantId") REFERENCES "JournalLine"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
