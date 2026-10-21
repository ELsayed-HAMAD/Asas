import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('notification ownership migration', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE TABLE "Notification" (
        "id" TEXT PRIMARY KEY,
        "tenantId" TEXT NOT NULL,
        "userId" TEXT,
        "title" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'INFO',
        "link" TEXT,
        "read" BOOLEAN NOT NULL DEFAULT FALSE,
        "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "Member" (
        "tenantId" TEXT NOT NULL,
        "userId" TEXT NOT NULL
      );
      INSERT INTO "Member" ("tenantId", "userId") VALUES
        ('tenant_a', 'user_a'), ('tenant_a', 'user_b');
      INSERT INTO "Notification" ("id", "tenantId", "userId", "title", "message", "read") VALUES
        ('shared', 'tenant_a', NULL, 'Shared', 'Previously shared', FALSE),
        ('orphan', 'tenant_without_members', NULL, 'Orphan', 'No recipient', FALSE),
        ('personal', 'tenant_a', 'user_a', 'Personal', 'Keep as-is', TRUE);
    `)
    const migration = readFileSync(
      new URL('../prisma/migrations/20261021080000_user_scoped_notifications/migration.sql', import.meta.url),
      'utf8',
    )
    await db.exec(migration)
  })

  afterAll(async () => {
    await db.close()
  })

  it('fans shared records out to tenant members, preserves personal records, and removes recipientless rows', async () => {
    const rows = await db.query<{ id: string; userId: string; title: string; read: boolean }>(
      'SELECT "id", "userId", "title", "read" FROM "Notification" ORDER BY "title", "userId"',
    )
    expect(rows.rows).toHaveLength(3)
    expect(rows.rows.filter(row => row.title === 'Shared').map(({ userId, read }) => ({ userId, read }))).toEqual([
      { userId: 'user_a', read: false },
      { userId: 'user_b', read: false },
    ])
    expect(rows.rows.find(row => row.id === 'personal')).toMatchObject({ userId: 'user_a', read: true })

    const nullable = await db.query<{ nullable: string | null }>(
      `SELECT is_nullable AS nullable FROM information_schema.columns
       WHERE table_name = 'Notification' AND column_name = 'userId'`,
    )
    expect(nullable.rows[0]?.nullable).toBe('NO')
  })
})
