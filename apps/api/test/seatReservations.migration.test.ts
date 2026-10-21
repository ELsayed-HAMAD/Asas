import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../prisma/migrations/20261021100000_transactional_seat_reservations/migration.sql', import.meta.url),
  'utf8',
)

describe('Transactional seat reservation migration', () => {
  it('adds reservation references and a tenant-isolated reservation table', async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        CREATE TABLE "Tenant" ("id" TEXT PRIMARY KEY);
        CREATE TABLE "Member" ("id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL);
        CREATE TABLE "Invitation" ("id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL);
      `)
      await db.exec(migration)

      const references = await db.query<{ table_name: string; column_name: string }>(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE column_name = 'seatReservationId'
        ORDER BY table_name
      `)
      expect(references.rows).toEqual([
        { table_name: 'Invitation', column_name: 'seatReservationId' },
        { table_name: 'Member', column_name: 'seatReservationId' },
      ])

      const policies = await db.query<{ policyname: string }>(`
        SELECT policyname FROM pg_policies WHERE tablename = 'SeatReservation'
      `)
      expect(policies.rows).toEqual([{ policyname: 'asas_tenant_isolation' }])

      await db.exec(`INSERT INTO "Tenant" ("id") VALUES ('tenant_1')`)
      await db.exec(`INSERT INTO "SeatReservation" ("id", "tenantId", "purpose", "expiresAt") VALUES ('seat_1', 'tenant_1', 'INVITATION', NOW() + INTERVAL '10 minutes')`)
      await expect(db.exec(`INSERT INTO "SeatReservation" ("id", "tenantId", "purpose", "expiresAt") VALUES ('seat_2', 'missing_tenant', 'INVITATION', NOW() + INTERVAL '10 minutes')`)).rejects.toThrow()
    } finally {
      await db.close()
    }
  }, 20_000)
})
