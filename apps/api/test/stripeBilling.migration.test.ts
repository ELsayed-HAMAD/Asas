import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../prisma/migrations/20261012020000_stripe_billing/migration.sql', import.meta.url), 'utf8')

describe('Stripe billing migration', () => {
  it('adds optional Stripe linkage and an idempotent webhook event table', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TABLE "Tenant" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "Subscription" ("id" TEXT NOT NULL PRIMARY KEY);
        CREATE TABLE "BillingInvoice" ("id" TEXT NOT NULL PRIMARY KEY);
      `)
      await db.exec(migration)
      const tenantColumns = await db.query<{ column_name: string; is_nullable: string }>(
        `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'Tenant' AND column_name = 'stripeCustomerId'`,
      )
      expect(tenantColumns.rows).toEqual([{ column_name: 'stripeCustomerId', is_nullable: 'YES' }])
      await db.exec(`INSERT INTO "Tenant" ("id", "stripeCustomerId") VALUES ('tenant_1', 'cus_1')`)
      await db.exec(`INSERT INTO "StripeWebhookEvent" ("id", "type") VALUES ('evt_1', 'customer.subscription.updated')`)
      await expect(db.exec(`INSERT INTO "StripeWebhookEvent" ("id", "type") VALUES ('evt_1', 'customer.subscription.updated')`)).rejects.toThrow()
    } finally {
      await db.close()
    }
  }, 20_000)
})
