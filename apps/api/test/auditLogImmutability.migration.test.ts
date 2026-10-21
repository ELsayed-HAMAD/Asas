import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.waitReady

  await db.exec(`
    CREATE TABLE "Tenant" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL
    );

    CREATE TABLE "AuditLog" (
      "id" TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "actorId" TEXT,
      "action" TEXT NOT NULL,
      "targetType" TEXT,
      "targetId" TEXT,
      "metadata" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const migration = readFileSync(
    new URL('../prisma/migrations/20261021040000_audit_immutability_and_platform_hardening/migration.sql', import.meta.url),
    'utf8',
  )
  await db.exec(migration)
}, 30000)

afterAll(async () => {
  await db?.close()
})

describe('Findings 22, 23 & L1: Database-Level Audit Log Immutability', () => {
  it('allows inserting audit log entries without restriction', async () => {
    await db.query(
      'INSERT INTO "AuditLog" ("id", "tenantId", "action", "metadata") VALUES ($1, $2, $3, $4)',
      ['audit_1', 'tenant_alpha', 'member.role.updated', '{"role":"ADMIN"}'],
    )

    const res = await db.query<{ id: string; action: string }>('SELECT "id", "action" FROM "AuditLog" WHERE "id" = $1', ['audit_1'])
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0]?.action).toBe('member.role.updated')
  })

  it('rejects UPDATE statements on AuditLog with ASAS_AUDIT_LOG_IMMUTABILITY', async () => {
    await expect(
      db.query('UPDATE "AuditLog" SET "action" = $1 WHERE "id" = $2', ['tampered.action', 'audit_1']),
    ).rejects.toThrow(/ASAS_AUDIT_LOG_IMMUTABILITY/)
  })

  it('rejects DELETE statements on AuditLog with ASAS_AUDIT_LOG_IMMUTABILITY', async () => {
    await expect(
      db.query('DELETE FROM "AuditLog" WHERE "id" = $1', ['audit_1']),
    ).rejects.toThrow(/ASAS_AUDIT_LOG_IMMUTABILITY/)
  })

  it('allows DELETE on AuditLog during compliant tenant purge with allow_tenant_purge enabled', async () => {
    await db.exec("SET asas.allow_tenant_purge = 'on'")
    await db.query('DELETE FROM "AuditLog" WHERE "id" = $1', ['audit_1'])
    await db.exec("SET asas.allow_tenant_purge = 'off'")

    const res = await db.query('SELECT * FROM "AuditLog" WHERE "id" = $1', ['audit_1'])
    expect(res.rows).toHaveLength(0)
  })
})

