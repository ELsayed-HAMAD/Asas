import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../prisma/migrations/20261023000000_backfill_product_stock_movements/migration.sql', import.meta.url),
  'utf8',
)

describe('product stock movement backfill migration', () => {
  it('preserves legacy stock as an opening movement without changing existing history', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TABLE "Product" (
          "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "stock" INTEGER NOT NULL,
          "createdAt" TIMESTAMP NOT NULL
        );
        CREATE TABLE "StockMovement" (
          "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "productId" TEXT NOT NULL,
          "delta" INTEGER NOT NULL, "note" TEXT, "createdAt" TIMESTAMP NOT NULL
        );
        INSERT INTO "Product" VALUES
          ('legacy_nonzero', 'tenant_1', 12, '2026-01-01 00:00:00'),
          ('legacy_zero', 'tenant_1', 0, '2026-01-02 00:00:00'),
          ('existing_history', 'tenant_1', 9, '2026-01-03 00:00:00');
        INSERT INTO "StockMovement" VALUES
          ('prior_move', 'tenant_1', 'existing_history', 4, 'prior receipt', '2026-01-04 00:00:00');
      `)

      await db.exec(migration)

      const result = await db.query<{ productId: string; delta: number; note: string }>(
        'SELECT "productId", "delta", "note" FROM "StockMovement" ORDER BY "productId"',
      )
      expect(result.rows).toEqual([
        { productId: 'existing_history', delta: 4, note: 'prior receipt' },
        { productId: 'legacy_nonzero', delta: 12, note: 'Opening stock balance (migration backfill)' },
      ])
    } finally {
      await db.close()
    }
  })
})
