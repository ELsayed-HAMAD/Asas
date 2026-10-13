import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../prisma/migrations/20261012040000_bank_statement_reconciliation/migration.sql', import.meta.url), 'utf8')

describe('bank statement reconciliation migration', () => {
  it('keeps imports tenant-unique and prevents cross-tenant or duplicate ledger matches', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TABLE "Tenant" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "JournalLine" ("id" TEXT NOT NULL PRIMARY KEY, "tenantId" TEXT NOT NULL);
        INSERT INTO "Tenant" ("id") VALUES ('tenant_a'), ('tenant_b');
        INSERT INTO "JournalLine" ("id", "tenantId") VALUES ('journal_a', 'tenant_a'), ('journal_b', 'tenant_b');
      `)
      await db.exec(migration)
      await db.exec(`INSERT INTO "BankStatementImport" ("id", "tenantId", "fileName", "contentHash") VALUES ('import_a', 'tenant_a', 'oct.csv', 'hash_a')`)
      await expect(db.exec(`INSERT INTO "BankStatementImport" ("id", "tenantId", "fileName", "contentHash") VALUES ('import_a2', 'tenant_a', 'copy.csv', 'hash_a')`)).rejects.toThrow()
      await db.exec(`INSERT INTO "BankStatementImport" ("id", "tenantId", "fileName", "contentHash") VALUES ('import_b', 'tenant_b', 'oct.csv', 'hash_a')`)
      await db.exec(`INSERT INTO "BankStatementLine" ("id", "tenantId", "importId", "fingerprint", "postedAt", "description", "currency", "amount", "matchedJournalLineId") VALUES ('line_a', 'tenant_a', 'import_a', 'row_1', '2026-10-12', 'Payroll', 'USD', 100, 'journal_a')`)
      await expect(db.exec(`INSERT INTO "BankStatementLine" ("id", "tenantId", "importId", "fingerprint", "postedAt", "description", "currency", "amount", "matchedJournalLineId") VALUES ('line_cross', 'tenant_a', 'import_a', 'row_2', '2026-10-12', 'Payroll', 'USD', 100, 'journal_b')`)).rejects.toThrow()
      await expect(db.exec(`INSERT INTO "BankStatementLine" ("id", "tenantId", "importId", "fingerprint", "postedAt", "description", "currency", "amount", "matchedJournalLineId") VALUES ('line_dup', 'tenant_a', 'import_a', 'row_3', '2026-10-12', 'Payroll', 'USD', 100, 'journal_a')`)).rejects.toThrow()
    } finally {
      await db.close()
    }
  }, 20_000)
})
