import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.waitReady
  await db.exec(`
    CREATE TABLE "PurchaseOrder" (
      "id" TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'DRAFT',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  const migration = readFileSync(
    new URL('../prisma/migrations/20261021010000_purchase_order_concurrency_and_status_gating/migration.sql', import.meta.url),
    'utf8',
  )
  await db.exec(migration)
}, 30000)

afterAll(async () => {
  await db?.close()
})

describe('PurchaseOrder status machine database trigger', () => {
  it('allows inserting draft purchase orders', async () => {
    await db.query(
      'INSERT INTO "PurchaseOrder" ("id", "tenantId", "status") VALUES ($1, $2, $3)',
      ['po_1', 'tenant_1', 'DRAFT'],
    )
    const row = (await db.query<{ status: string }>('SELECT "status" FROM "PurchaseOrder" WHERE "id" = $1', ['po_1'])).rows[0]
    expect(row?.status).toBe('DRAFT')
  })

  it('rejects transitioning directly from DRAFT to RECEIVED at the database level', async () => {
    await db.query(
      'INSERT INTO "PurchaseOrder" ("id", "tenantId", "status") VALUES ($1, $2, $3)',
      ['po_unapproved', 'tenant_1', 'DRAFT'],
    )
    await expect(
      db.query('UPDATE "PurchaseOrder" SET "status" = $1 WHERE "id" = $2', ['RECEIVED', 'po_unapproved']),
    ).rejects.toThrowError(/must be APPROVED before receiving/)
  })

  it('allows transitioning from DRAFT to APPROVED', async () => {
    await db.query(
      'UPDATE "PurchaseOrder" SET "status" = $1, "approvedAt" = NOW() WHERE "id" = $2',
      ['APPROVED', 'po_1'],
    )
    const row = (await db.query<{ status: string; approvedAt: Date | null }>('SELECT "status", "approvedAt" FROM "PurchaseOrder" WHERE "id" = $1', ['po_1'])).rows[0]
    expect(row?.status).toBe('APPROVED')
    expect(row?.approvedAt).not.toBeNull()
  })

  it('allows transitioning from APPROVED to RECEIVED', async () => {
    await db.query(
      'UPDATE "PurchaseOrder" SET "status" = $1, "receivedAt" = NOW() WHERE "id" = $2',
      ['RECEIVED', 'po_1'],
    )
    const row = (await db.query<{ status: string; receivedAt: Date | null }>('SELECT "status", "receivedAt" FROM "PurchaseOrder" WHERE "id" = $1', ['po_1'])).rows[0]
    expect(row?.status).toBe('RECEIVED')
    expect(row?.receivedAt).not.toBeNull()
  })

  it('strictly rejects any modification of an already RECEIVED purchase order', async () => {
    await expect(
      db.query('UPDATE "PurchaseOrder" SET "status" = $1 WHERE "id" = $2', ['DRAFT', 'po_1']),
    ).rejects.toThrowError(/already received and cannot change status/)

    await expect(
      db.query('UPDATE "PurchaseOrder" SET "status" = $1 WHERE "id" = $2', ['CANCELLED', 'po_1']),
    ).rejects.toThrowError(/already received and cannot change status/)
  })

  it('allows transitioning DRAFT to CANCELLED, and rejects modifying CANCELLED orders', async () => {
    await db.query(
      'INSERT INTO "PurchaseOrder" ("id", "tenantId", "status") VALUES ($1, $2, $3)',
      ['po_cancel', 'tenant_1', 'DRAFT'],
    )
    await db.query('UPDATE "PurchaseOrder" SET "status" = $1 WHERE "id" = $2', ['CANCELLED', 'po_cancel'])

    const row = (await db.query<{ status: string }>('SELECT "status" FROM "PurchaseOrder" WHERE "id" = $1', ['po_cancel'])).rows[0]
    expect(row?.status).toBe('CANCELLED')

    await expect(
      db.query('UPDATE "PurchaseOrder" SET "status" = $1 WHERE "id" = $2', ['APPROVED', 'po_cancel']),
    ).rejects.toThrowError(/cancelled and cannot change status/)
  })

  it('allows transitioning APPROVED to CANCELLED', async () => {
    await db.query(
      'INSERT INTO "PurchaseOrder" ("id", "tenantId", "status") VALUES ($1, $2, $3)',
      ['po_approved_cancel', 'tenant_1', 'DRAFT'],
    )
    await db.query('UPDATE "PurchaseOrder" SET "status" = $1 WHERE "id" = $2', ['APPROVED', 'po_approved_cancel'])
    await db.query('UPDATE "PurchaseOrder" SET "status" = $1 WHERE "id" = $2', ['CANCELLED', 'po_approved_cancel'])

    const row = (await db.query<{ status: string }>('SELECT "status" FROM "PurchaseOrder" WHERE "id" = $1', ['po_approved_cancel'])).rows[0]
    expect(row?.status).toBe('CANCELLED')
  })
})

