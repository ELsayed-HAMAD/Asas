import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../prisma/migrations/20261025100000_receivable_inventory_lines/migration.sql', import.meta.url),
  'utf8',
)

describe('receivable inventory line migration', () => {
  it('applies additively and enforces tenant-safe links, uniqueness, and reversal shape', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TABLE "Tenant" ("id" TEXT PRIMARY KEY);
        CREATE TABLE "ReceivableInvoice" (
          "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL,
          UNIQUE ("id", "tenantId")
        );
        CREATE TABLE "Product" (
          "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL,
          UNIQUE ("id", "tenantId")
        );
        CREATE TABLE "StockMovement" (
          "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL,
          UNIQUE ("id", "tenantId")
        );
        CREATE TABLE "InventoryValuationEvent" (
          "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL,
          UNIQUE ("id", "tenantId")
        );
        CREATE TABLE "JournalEntry" (
          "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL,
          UNIQUE ("id", "tenantId")
        );
        INSERT INTO "Tenant" VALUES ('tenant_1');
        INSERT INTO "ReceivableInvoice" VALUES ('invoice_1', 'tenant_1');
        INSERT INTO "Product" VALUES ('product_1', 'tenant_1'), ('product_2', 'tenant_1');
        INSERT INTO "StockMovement" VALUES
          ('movement_issue', 'tenant_1'),
          ('movement_return', 'tenant_1'),
          ('movement_extra', 'tenant_1');
        INSERT INTO "InventoryValuationEvent" VALUES
          ('event_issue', 'tenant_1'),
          ('event_return', 'tenant_1'),
          ('event_extra', 'tenant_1');
        INSERT INTO "JournalEntry" VALUES ('journal_issue', 'tenant_1'), ('journal_return', 'tenant_1');
      `)

      await db.exec(migration)

      await db.query(
        `INSERT INTO "ReceivableInventoryLine"
          ("id", "tenantId", "invoiceId", "productId", "quantity", "currency", "costValue",
           "stockMovementId", "valuationEventId", "journalEntryId", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)`,
        ['line_1', 'tenant_1', 'invoice_1', 'product_1', 2, 'USD', '22.0000', 'movement_issue', 'event_issue', 'journal_issue'],
      )

      const stored = await db.query<{ quantity: number; costValue: string; reversedAt: string | null }>(
        'SELECT "quantity", "costValue"::text AS "costValue", "reversedAt" FROM "ReceivableInventoryLine" WHERE "id" = $1',
        ['line_1'],
      )
      expect(stored.rows).toEqual([{ quantity: 2, costValue: '22.0000', reversedAt: null }])

      await expect(db.query(
        `INSERT INTO "ReceivableInventoryLine"
          ("id", "tenantId", "invoiceId", "productId", "quantity", "currency", "costValue",
           "stockMovementId", "valuationEventId", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)`,
        ['line_duplicate_product', 'tenant_1', 'invoice_1', 'product_1', 1, 'USD', '11.0000', 'movement_extra', 'event_extra'],
      )).rejects.toThrow()

      await expect(db.query(
        `INSERT INTO "ReceivableInventoryLine"
          ("id", "tenantId", "invoiceId", "productId", "quantity", "currency", "costValue",
           "stockMovementId", "valuationEventId", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)`,
        ['line_zero_quantity', 'tenant_1', 'invoice_1', 'product_2', 0, 'USD', '0.0000', 'movement_extra', 'event_extra'],
      )).rejects.toThrow()

      await expect(db.query(
        `INSERT INTO "ReceivableInventoryLine"
          ("id", "tenantId", "invoiceId", "productId", "quantity", "currency", "costValue",
           "stockMovementId", "valuationEventId", "reversedAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        ['line_partial_reversal', 'tenant_1', 'invoice_1', 'product_2', 1, 'USD', '11.0000', 'movement_extra', 'event_extra'],
      )).rejects.toThrow()

      await db.query(
        `UPDATE "ReceivableInventoryLine"
         SET "reversedAt" = CURRENT_TIMESTAMP,
             "reversalStockMovementId" = $2,
             "reversalValuationEventId" = $3,
             "reversalJournalEntryId" = $4
         WHERE "id" = $1`,
        ['line_1', 'movement_return', 'event_return', 'journal_return'],
      )
      const reversed = await db.query<{ reversalStockMovementId: string; reversalValuationEventId: string }>(
        'SELECT "reversalStockMovementId", "reversalValuationEventId" FROM "ReceivableInventoryLine" WHERE "id" = $1',
        ['line_1'],
      )
      expect(reversed.rows).toEqual([{
        reversalStockMovementId: 'movement_return',
        reversalValuationEventId: 'event_return',
      }])
    } finally {
      await db.close()
    }
  })
})
