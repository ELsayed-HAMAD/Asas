import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../prisma/migrations/20261025110000_purchase_order_invoice_matching/migration.sql', import.meta.url),
  'utf8',
)

describe('purchase-order invoice matching migration', () => {
  it('adds tenant-safe links and enforces active-match shape and uniqueness', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TABLE "Tenant" ("id" TEXT PRIMARY KEY);
        CREATE TABLE "Vendor" (
          "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL
        );
        CREATE TABLE "PurchaseOrder" (
          "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL
        );
        CREATE TABLE "InventoryValuationEvent" (
          "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL,
          UNIQUE ("id", "tenantId")
        );
        CREATE TABLE "PayableInvoice" (
          "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL,
          UNIQUE ("id", "tenantId")
        );
        CREATE TABLE "JournalEntry" (
          "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL,
          UNIQUE ("id", "tenantId")
        );

        INSERT INTO "Tenant" VALUES ('tenant_1'), ('tenant_2');
        INSERT INTO "Vendor" VALUES ('vendor_1', 'tenant_1'), ('vendor_2', 'tenant_2');
        INSERT INTO "PurchaseOrder" VALUES
          ('po_1', 'tenant_1'),
          ('po_2', 'tenant_2');
        INSERT INTO "InventoryValuationEvent" VALUES
          ('event_1', 'tenant_1'),
          ('event_2', 'tenant_1'),
          ('event_3', 'tenant_2');
        INSERT INTO "PayableInvoice" VALUES
          ('bill_1', 'tenant_1'),
          ('bill_2', 'tenant_1'),
          ('bill_3', 'tenant_2');
        INSERT INTO "JournalEntry" VALUES
          ('journal_1', 'tenant_1'),
          ('journal_2', 'tenant_1'),
          ('journal_3', 'tenant_2');
      `)

      await db.exec(migration)

      const columns = await db.query<{ table_name: string; column_name: string }>(`
        SELECT "table_name", "column_name"
        FROM "information_schema"."columns"
        WHERE "table_name" IN ('PurchaseOrder', 'InventoryValuationEvent', 'PayableInvoice')
          AND "column_name" IN ('vendorId', 'purchaseOrderId')
        ORDER BY "table_name", "column_name"
      `)
      expect(columns.rows).toEqual([
        { table_name: 'InventoryValuationEvent', column_name: 'purchaseOrderId' },
        { table_name: 'PayableInvoice', column_name: 'purchaseOrderId' },
        { table_name: 'PurchaseOrder', column_name: 'vendorId' },
      ])

      await db.query('UPDATE "PurchaseOrder" SET "vendorId" = $1 WHERE "id" = $2', ['vendor_1', 'po_1'])
      await expect(db.query(
        'UPDATE "PurchaseOrder" SET "vendorId" = $1 WHERE "id" = $2',
        ['vendor_2', 'po_1'],
      )).rejects.toThrow()

      await db.query(
        `INSERT INTO "PurchaseOrderInvoiceMatch"
          ("id", "tenantId", "purchaseOrderId", "payableInvoiceId", "valuationEventId", "journalEntryId",
           "activePurchaseOrderId", "amount", "currency", "status", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', CURRENT_TIMESTAMP)`,
        ['match_1', 'tenant_1', 'po_1', 'bill_1', 'event_1', 'journal_1', 'po_1', '62.5000', 'USD'],
      )

      const stored = await db.query<{ amount: string; status: string; activePurchaseOrderId: string | null }>(
        `SELECT "amount"::text AS "amount", "status", "activePurchaseOrderId"
         FROM "PurchaseOrderInvoiceMatch" WHERE "id" = $1`,
        ['match_1'],
      )
      expect(stored.rows).toEqual([{ amount: '62.5000', status: 'ACTIVE', activePurchaseOrderId: 'po_1' }])

      // Only one active match may hold the same receipt. A reversed row releases the key.
      await expect(db.query(
        `INSERT INTO "PurchaseOrderInvoiceMatch"
          ("id", "tenantId", "purchaseOrderId", "payableInvoiceId", "valuationEventId", "journalEntryId",
           "activePurchaseOrderId", "amount", "currency", "status", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', CURRENT_TIMESTAMP)`,
        ['match_duplicate_active', 'tenant_1', 'po_1', 'bill_2', 'event_2', 'journal_2', 'po_1', '62.5000', 'USD'],
      )).rejects.toThrow()

      await db.query(
        `UPDATE "PurchaseOrderInvoiceMatch"
         SET "status" = 'REVERSED', "activePurchaseOrderId" = NULL, "reversedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1`,
        ['match_1'],
      )
      await db.query(
        `INSERT INTO "PurchaseOrderInvoiceMatch"
          ("id", "tenantId", "purchaseOrderId", "payableInvoiceId", "valuationEventId", "journalEntryId",
           "activePurchaseOrderId", "amount", "currency", "status", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', CURRENT_TIMESTAMP)`,
        ['match_replacement', 'tenant_1', 'po_1', 'bill_2', 'event_2', 'journal_2', 'po_1', '62.5000', 'USD'],
      )

      await expect(db.query(
        `INSERT INTO "PurchaseOrderInvoiceMatch"
          ("id", "tenantId", "purchaseOrderId", "payableInvoiceId", "valuationEventId", "journalEntryId",
           "activePurchaseOrderId", "amount", "currency", "status", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', CURRENT_TIMESTAMP)`,
        ['match_zero_amount', 'tenant_1', 'po_1', 'bill_1', 'event_1', 'journal_1', 'po_1', '0.0000', 'USD'],
      )).rejects.toThrow()

      await expect(db.query(
        `INSERT INTO "PurchaseOrderInvoiceMatch"
          ("id", "tenantId", "purchaseOrderId", "payableInvoiceId", "valuationEventId", "journalEntryId",
           "activePurchaseOrderId", "amount", "currency", "status", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', CURRENT_TIMESTAMP)`,
        ['match_bad_currency', 'tenant_1', 'po_1', 'bill_1', 'event_1', 'journal_1', 'po_1', '1.0000', 'US'],
      )).rejects.toThrow()

      await expect(db.query(
        `INSERT INTO "PurchaseOrderInvoiceMatch"
          ("id", "tenantId", "purchaseOrderId", "payableInvoiceId", "valuationEventId", "journalEntryId",
           "activePurchaseOrderId", "amount", "currency", "status", "reversedAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        ['match_bad_shape', 'tenant_1', 'po_1', 'bill_1', 'event_1', 'journal_1', 'po_1', '1.0000', 'USD'],
      )).rejects.toThrow()

      // Composite tenant foreign keys reject cross-tenant references even when both IDs exist.
      await expect(db.query(
        `INSERT INTO "PurchaseOrderInvoiceMatch"
          ("id", "tenantId", "purchaseOrderId", "payableInvoiceId", "valuationEventId", "journalEntryId",
           "activePurchaseOrderId", "amount", "currency", "status", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', CURRENT_TIMESTAMP)`,
        ['match_cross_tenant', 'tenant_2', 'po_1', 'bill_3', 'event_3', 'journal_3', 'po_1', '1.0000', 'USD'],
      )).rejects.toThrow()

      // A referenced active match keeps its receipt and bill from being deleted.
      await expect(db.query('DELETE FROM "PurchaseOrder" WHERE "id" = $1', ['po_1'])).rejects.toThrow()
      await expect(db.query('DELETE FROM "PayableInvoice" WHERE "id" = $1', ['bill_2'])).rejects.toThrow()
    } finally {
      await db.close()
    }
  })
})
