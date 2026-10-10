import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Genuine PostgreSQL SQL/PLpgSQL in isolated memory, with the relevant pre-migration columns.
// PGlite has one connection: these tests verify triggers/rollback, not multi-session races.
const tables = ['Employee', 'PayrollRun', 'PayableInvoice', 'ReceivableInvoice', 'Expense', 'LedgerTransaction', 'CashFlowSnapshot', 'Deal', 'SalesQuota', 'ForecastSnapshot', 'Product', 'Project'] as const
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.waitReady
  await db.exec('CREATE TABLE "Tenant" ("id" TEXT PRIMARY KEY, "currency" TEXT NOT NULL);')
  for (const table of tables) {
    await db.exec(`CREATE TABLE "${table}" (
      "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id"),
      "amount" NUMERIC DEFAULT 0, "salary" NUMERIC ${table === 'PayrollRun' ? ', "currency" TEXT' : ''}
    );`)
  }
  await db.exec(`
    INSERT INTO "Tenant" VALUES ('legacy', 'USD'), ('legacy_foreign', 'JPY');
    INSERT INTO "PayableInvoice" ("id", "tenantId", "amount") VALUES ('legacy_invoice', 'legacy', 12.3456);
    INSERT INTO "Expense" ("id", "tenantId", "amount") VALUES ('legacy_expense', 'legacy', 10.1234);
    INSERT INTO "PayrollRun" ("id", "tenantId", "amount", "currency") VALUES ('foreign_payroll', 'legacy_foreign', 12.345, 'KWD');
  `)
  const migration = readFileSync(new URL('../prisma/migrations/20261007050000_workspace_currency_integrity/migration.sql', import.meta.url), 'utf8')
  await db.exec(migration)
}, 30000)

afterAll(async () => { await db?.close() })

async function createTenant(id: string, currency = 'USD') {
  await db.query('INSERT INTO "Tenant" ("id", "currency") VALUES ($1, $2)', [id, currency])
}
async function tenant(id: string) {
  return (await db.query<{ currency: string; currencyLockedAt: Date | null }>('SELECT "currency", "currencyLockedAt" FROM "Tenant" WHERE "id" = $1', [id])).rows[0]!
}

describe('workspace currency SQL enforcement', () => {
  it('locks populated workspaces without backfilling or rounding legacy currency/amounts', async () => {
    expect((await tenant('legacy')).currencyLockedAt).not.toBeNull()
    expect((await db.query('SELECT "currency", "amount"::text AS amount FROM "PayableInvoice" WHERE "id" = $1', ['legacy_invoice'])).rows[0]).toEqual({ currency: null, amount: '12.3456' })
    await expect(db.query('UPDATE "Tenant" SET "currency" = $1 WHERE "id" = $2', ['EUR', 'legacy'])).rejects.toMatchObject({ code: '23514' })
  })
  it('permits currency selection in a genuinely empty workspace', async () => {
    await createTenant('empty')
    await db.query('UPDATE "Tenant" SET "currency" = $1 WHERE "id" = $2', ['JPY', 'empty'])
    expect(await tenant('empty')).toEqual({ currency: 'JPY', currencyLockedAt: null })
  })
  it.each(tables)('snapshots and locks the first monetary %s record', async table => {
    const id = `first_${table}`
    await createTenant(id)
    await db.query(`INSERT INTO "${table}" ("id", "tenantId", "amount", "salary") VALUES ($1, $1, 123.45, 123.45)`, [id])
    expect((await db.query(`SELECT "currency", "amount"::text AS amount FROM "${table}" WHERE "id" = $1`, [id])).rows[0]).toEqual({ currency: 'USD', amount: '123.45' })
    expect((await tenant(id)).currencyLockedAt).not.toBeNull()
    await expect(db.query('UPDATE "Tenant" SET "currency" = $1 WHERE "id" = $2', ['EUR', id])).rejects.toMatchObject({ code: '23514' })
    // An identical-currency settings update is valid.
    await db.query('UPDATE "Tenant" SET "currency" = $1 WHERE "id" = $2', ['USD', id])
  })
  it.each(tables)('rolls back a %s insertion prepared for a different denomination', async table => {
    const id = `wrong_${table}`
    await createTenant(id, 'JPY')
    await expect(db.query(`INSERT INTO "${table}" ("id", "tenantId", "currency", "salary") VALUES ($1, $1, $2, 10)`, [id, 'USD'])).rejects.toMatchObject({ code: '23514' })
    expect((await tenant(id)).currencyLockedAt).toBeNull()
    expect((await db.query(`SELECT "id" FROM "${table}" WHERE "id" = $1`, [id])).rows).toEqual([])
  })
  it('does not establish denomination for a salary-free employee, but does on first salary assignment', async () => {
    await createTenant('no_salary')
    await db.query('INSERT INTO "Employee" ("id", "tenantId") VALUES ($1, $1)', ['no_salary'])
    expect((await tenant('no_salary')).currencyLockedAt).toBeNull()
    await db.query('UPDATE "Tenant" SET "currency" = $1 WHERE "id" = $2', ['EUR', 'no_salary'])
    await db.query('UPDATE "Employee" SET "salary" = 100 WHERE "id" = $1', ['no_salary'])
    expect((await db.query('SELECT "currency" FROM "Employee" WHERE "id" = $1', ['no_salary'])).rows[0]).toEqual({ currency: 'EUR' })
    expect((await tenant('no_salary')).currencyLockedAt).not.toBeNull()
  })
  it('does not erase or move an established lock, including after deleting records', async () => {
    await db.query('DELETE FROM "CashFlowSnapshot" WHERE "id" = $1', ['first_CashFlowSnapshot'])
    await expect(db.query('UPDATE "Tenant" SET "currencyLockedAt" = NULL WHERE "id" = $1', ['first_CashFlowSnapshot'])).rejects.toMatchObject({ code: '23514' })
    await expect(db.query('UPDATE "Tenant" SET "currencyLockedAt" = CURRENT_TIMESTAMP WHERE "id" = $1', ['first_CashFlowSnapshot'])).rejects.toMatchObject({ code: '23514' })
    await expect(db.query('UPDATE "Tenant" SET "currency" = $1 WHERE "id" = $2', ['EUR', 'first_CashFlowSnapshot'])).rejects.toMatchObject({ code: '23514' })
  })
  it('protects snapshot currency and tenant identity from direct SQL relabeling', async () => {
    await expect(db.query('UPDATE "Deal" SET "currency" = $1 WHERE "id" = $2', ['EUR', 'first_Deal'])).rejects.toMatchObject({ code: '23514' })
    await expect(db.query('UPDATE "Deal" SET "tenantId" = $1 WHERE "id" = $2', ['empty', 'first_Deal'])).rejects.toMatchObject({ code: '23514' })
  })
  it('retains a previously recorded foreign payroll currency when editing other fields', async () => {
    await db.query('UPDATE "PayrollRun" SET "amount" = 20.123 WHERE "id" = $1', ['foreign_payroll'])
    expect((await db.query('SELECT "currency", "amount"::text AS amount FROM "PayrollRun" WHERE "id" = $1', ['foreign_payroll'])).rows[0]).toEqual({ currency: 'KWD', amount: '20.123' })
  })
  it('keeps unknown legacy record currency null on ordinary updates', async () => {
    await db.query('UPDATE "Expense" SET "amount" = 20.1234 WHERE "id" = $1', ['legacy_expense'])
    expect((await db.query('SELECT "currency", "amount"::text AS amount FROM "Expense" WHERE "id" = $1', ['legacy_expense'])).rows[0]).toEqual({ currency: null, amount: '20.1234' })
  })
})
