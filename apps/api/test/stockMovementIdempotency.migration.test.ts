import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../prisma/migrations/20261026100000_stock_movement_idempotency/migration.sql', import.meta.url),
  'utf8',
)

describe('stock movement idempotency migration', () => {
  it('adds paired request fields and enforces tenant-scoped request-key uniqueness', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TABLE "StockMovement" (
          "id" TEXT PRIMARY KEY,
          "tenantId" TEXT NOT NULL,
          "productId" TEXT NOT NULL,
          "delta" INTEGER NOT NULL,
          "note" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO "StockMovement" ("id", "tenantId", "productId", "delta")
        VALUES ('legacy_1', 'tenant_1', 'product_1', 1);
      `)

      await db.exec(migration)

      const columns = await db.query<{ column_name: string; is_nullable: string }>(`
        SELECT "column_name", "is_nullable"
        FROM "information_schema"."columns"
        WHERE "table_name" = 'StockMovement'
          AND "column_name" IN ('requestKey', 'requestHash')
        ORDER BY "column_name"
      `)
      expect(columns.rows).toEqual([
        { column_name: 'requestHash', is_nullable: 'YES' },
        { column_name: 'requestKey', is_nullable: 'YES' },
      ])

      const legacy = await db.query<{ requestKey: string | null; requestHash: string | null }>(
        'SELECT "requestKey", "requestHash" FROM "StockMovement" WHERE "id" = $1',
        ['legacy_1'],
      )
      expect(legacy.rows).toEqual([{ requestKey: null, requestHash: null }])

      await db.query(
        `INSERT INTO "StockMovement" ("id", "tenantId", "productId", "delta", "requestKey", "requestHash")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['move_1', 'tenant_1', 'product_1', 2, 'request-1', 'hash-1'],
      )

      await expect(db.query(
        `INSERT INTO "StockMovement" ("id", "tenantId", "productId", "delta", "requestKey", "requestHash")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['move_duplicate', 'tenant_1', 'product_1', 2, 'request-1', 'hash-1'],
      )).rejects.toThrow()

      // The key is tenant-scoped, so the same client value can exist in another workspace.
      await db.query(
        `INSERT INTO "StockMovement" ("id", "tenantId", "productId", "delta", "requestKey", "requestHash")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['move_2', 'tenant_2', 'product_2', 2, 'request-1', 'hash-1'],
      )

      // Multiple unkeyed system movements remain valid; the pair must be present together.
      await db.query(
        `INSERT INTO "StockMovement" ("id", "tenantId", "productId", "delta")
         VALUES ($1, $2, $3, $4)`,
        ['system_1', 'tenant_1', 'product_1', 5],
      )
      await db.query(
        `INSERT INTO "StockMovement" ("id", "tenantId", "productId", "delta")
         VALUES ($1, $2, $3, $4)`,
        ['system_2', 'tenant_1', 'product_1', 5],
      )
      await expect(db.query(
        `INSERT INTO "StockMovement" ("id", "tenantId", "productId", "delta", "requestKey")
         VALUES ($1, $2, $3, $4, $5)`,
        ['unpaired', 'tenant_1', 'product_1', 1, 'request-unpaired'],
      )).rejects.toThrow()
    } finally {
      await db.close()
    }
  })
})
