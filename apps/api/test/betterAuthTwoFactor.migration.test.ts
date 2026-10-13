import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../prisma/migrations/20261012010000_better_auth_two_factor/migration.sql', import.meta.url), 'utf8')

describe('Better Auth two-factor migration', () => {
  it('adds the disabled-by-default user flag and cascading TOTP storage', async () => {
    const db = new PGlite()
    try {
      await db.exec('CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY);')
      await db.exec(migration)

      const columns = await db.query<{ column_name: string; column_default: string | null; is_nullable: string }>(
        `SELECT column_name, column_default, is_nullable FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'twoFactorEnabled'`,
      )
      expect(columns.rows).toEqual([{ column_name: 'twoFactorEnabled', column_default: 'false', is_nullable: 'NO' }])

      await db.exec(`INSERT INTO "User" ("id") VALUES ('user_1')`)
      await db.exec(`INSERT INTO "TwoFactor" ("id", "userId", "secret", "backupCodes") VALUES ('factor_1', 'user_1', 'secret', 'codes')`)
      const factors = await db.query<{ verified: boolean; failedVerificationCount: number; lockedUntil: Date | null }>(
        `SELECT "verified", "failedVerificationCount", "lockedUntil" FROM "TwoFactor" WHERE "id" = 'factor_1'`,
      )
      expect(factors.rows).toEqual([{ verified: true, failedVerificationCount: 0, lockedUntil: null }])

      await db.exec(`DELETE FROM "User" WHERE "id" = 'user_1'`)
      const remaining = await db.query(`SELECT "id" FROM "TwoFactor"`)
      expect(remaining.rows).toEqual([])
    } finally {
      await db.close()
    }
  }, 20_000)
})
