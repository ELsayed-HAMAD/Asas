import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../prisma/migrations/20261012030000_stripe_payment_method_sync/migration.sql', import.meta.url), 'utf8')

describe('Stripe payment method sync migration', () => {
  it('adds nullable Stripe IDs and enforces uniqueness while preserving existing rows', async () => {
    const db = new PGlite()
    try {
      await db.exec(`CREATE TABLE "PaymentMethod" ("id" TEXT NOT NULL PRIMARY KEY, "tenantId" TEXT NOT NULL)`)
      await db.exec(`INSERT INTO "PaymentMethod" ("id", "tenantId") VALUES ('legacy_1', 'tenant_1')`)
      await db.exec(migration)
      const rows = await db.query<{ id: string; stripePaymentMethodId: string | null }>(
        `SELECT "id", "stripePaymentMethodId" FROM "PaymentMethod"`,
      )
      expect(rows.rows).toEqual([{ id: 'legacy_1', stripePaymentMethodId: null }])
      await db.exec(`INSERT INTO "PaymentMethod" ("id", "tenantId", "stripePaymentMethodId") VALUES ('card_1', 'tenant_1', 'pm_1')`)
      await expect(db.exec(`INSERT INTO "PaymentMethod" ("id", "tenantId", "stripePaymentMethodId") VALUES ('card_2', 'tenant_1', 'pm_1')`)).rejects.toThrow()
    } finally {
      await db.close()
    }
  }, 20_000)
})
