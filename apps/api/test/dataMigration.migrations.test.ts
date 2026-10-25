import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const projectMigration = readFileSync(new URL('../prisma/migrations/20261023030000_data_migration_projects/migration.sql', import.meta.url), 'utf8')
const crmEntityMigration = readFileSync(new URL('../prisma/migrations/20261023040000_add_crm_company_migration_entity/migration.sql', import.meta.url), 'utf8')
const crosswalkMigration = readFileSync(new URL('../prisma/migrations/20261023050000_data_migration_source_crosswalks/migration.sql', import.meta.url), 'utf8')
const crmDealMigration = readFileSync(new URL('../prisma/migrations/20261023060000_add_crm_deal_migration_entity/migration.sql', import.meta.url), 'utf8')
const inventoryProductMigration = readFileSync(new URL('../prisma/migrations/20261023070000_add_inventory_product_migration_entity/migration.sql', import.meta.url), 'utf8')
const financeCounterpartyMigration = readFileSync(new URL('../prisma/migrations/20261023080000_add_finance_counterparty_migration_entities/migration.sql', import.meta.url), 'utf8')
const projectPortfolioMigration = readFileSync(new URL('../prisma/migrations/20261023090000_add_project_migration_entity/migration.sql', import.meta.url), 'utf8')
const inventoryOpeningStockMigration = readFileSync(new URL('../prisma/migrations/20261023100000_add_inventory_opening_stock_migration_entity/migration.sql', import.meta.url), 'utf8')
const inventorySupplierMigration = readFileSync(new URL('../prisma/migrations/20261023110000_add_inventory_supplier_migration_entities/migration.sql', import.meta.url), 'utf8')
const financeStagingMigration = readFileSync(new URL('../prisma/migrations/20261023120000_finance_migration_staging/migration.sql', import.meta.url), 'utf8')
const financeSourceAmountsMigration = readFileSync(new URL('../prisma/migrations/20261023130000_finance_source_open_item_amounts/migration.sql', import.meta.url), 'utf8')
const financeReceivableDateMigration = readFileSync(new URL('../prisma/migrations/20261024100000_finance_migration_cutover/migration.sql', import.meta.url), 'utf8')
const inventoryValuationMigration = readFileSync(new URL('../prisma/migrations/20261024130000_inventory_valuation_ledger/migration.sql', import.meta.url), 'utf8')
const onboardingMigrationProjectResumeMigration = readFileSync(new URL('../prisma/migrations/20261024140000_onboarding_migration_project_resume/migration.sql', import.meta.url), 'utf8')

describe('company data migration schema', () => {
  it('applies the additive migrations and enforces project, idempotency, and source crosswalk constraints', async () => {
    const db = new PGlite()
    try {
      await db.exec('CREATE TABLE "Tenant" ("id" TEXT PRIMARY KEY)')
      await db.exec(projectMigration)
      await db.exec(crmEntityMigration)
      await db.exec(crosswalkMigration)
      await db.exec(crmDealMigration)
      await db.exec(inventoryProductMigration)
      await db.exec(financeCounterpartyMigration)
      await db.exec(projectPortfolioMigration)
      await db.exec(inventoryOpeningStockMigration)
      await db.exec(inventorySupplierMigration)
      await db.exec(financeStagingMigration)
      await db.query('INSERT INTO "Tenant" ("id") VALUES ($1), ($2)', ['tenant-1', 'tenant-2'])
      await db.query(
        'INSERT INTO "DataMigrationProject" ("id", "tenantId", "name", "modules", "createdBy", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        ['project-1', 'tenant-1', 'Company migration', '{CRM}', 'owner-1'],
      )
      await db.query(
        'INSERT INTO "DataMigrationImportJob" ("id", "tenantId", "projectId", "entity", "idempotencyKey", "requestHash", "totalRows", "importedRows", "createdBy") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        ['job-2', 'tenant-1', 'project-1', 'INVENTORY_PRODUCTS', 'hash-2', 'hash-2', 1, 1, 'owner-1'],
      )
      await db.query(
        'INSERT INTO "DataMigrationImportJob" ("id", "tenantId", "projectId", "entity", "idempotencyKey", "requestHash", "totalRows", "importedRows", "createdBy") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        ['job-3', 'tenant-1', 'project-1', 'FINANCE_CUSTOMERS', 'hash-3', 'hash-3', 1, 1, 'owner-1'],
      )
      await db.query(
        'INSERT INTO "DataMigrationImportJob" ("id", "tenantId", "projectId", "entity", "idempotencyKey", "requestHash", "totalRows", "importedRows", "createdBy") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        ['job-4', 'tenant-1', 'project-1', 'PROJECTS_PROJECTS', 'hash-4', 'hash-4', 1, 1, 'owner-1'],
      )
      await db.query(
        'INSERT INTO "DataMigrationImportJob" ("id", "tenantId", "projectId", "entity", "idempotencyKey", "requestHash", "totalRows", "importedRows", "createdBy") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        ['job-5', 'tenant-1', 'project-1', 'INVENTORY_OPENING_STOCK', 'hash-5', 'hash-5', 1, 1, 'owner-1'],
      )
      await db.query(
        'INSERT INTO "DataMigrationImportJob" ("id", "tenantId", "projectId", "entity", "idempotencyKey", "requestHash", "totalRows", "importedRows", "createdBy") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        ['job-6', 'tenant-1', 'project-1', 'INVENTORY_SUPPLIERS', 'hash-6', 'hash-6', 1, 1, 'owner-1'],
      )
      await db.query(
        'INSERT INTO "DataMigrationImportJob" ("id", "tenantId", "projectId", "entity", "idempotencyKey", "requestHash", "totalRows", "importedRows", "createdBy") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        ['job-7', 'tenant-1', 'project-1', 'INVENTORY_PRODUCT_SUPPLIERS', 'hash-7', 'hash-7', 1, 1, 'owner-1'],
      )
      await db.query(
        'INSERT INTO "DataMigrationImportJob" ("id", "tenantId", "projectId", "entity", "idempotencyKey", "requestHash", "totalRows", "importedRows", "createdBy") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        ['job-1', 'tenant-1', 'project-1', 'CRM_COMPANIES', 'hash-1', 'hash-1', 1, 1, 'owner-1'],
      )
      await db.query(
        'INSERT INTO "DataMigrationRecordLink" ("id", "tenantId", "projectId", "importJobId", "sourceEntity", "sourceId", "targetEntity", "targetId") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        ['link-1', 'tenant-1', 'project-1', 'job-1', 'CRM_COMPANIES', 'legacy-co-1', 'CRM_COMPANIES', 'asas-co-1'],
      )

      await db.query(
        'INSERT INTO "DataMigrationStageBatch" ("id", "tenantId", "projectId", "entity", "idempotencyKey", "requestHash", "totalRows", "stagedRows", "createdBy") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        ['stage-1', 'tenant-1', 'project-1', 'FINANCE_AP_OPEN_ITEMS', 'hash-ap-1', 'hash-ap-1', 1, 1, 'owner-1'],
      )
      await db.query(
        'INSERT INTO "DataMigrationStagedRecord" ("id", "tenantId", "projectId", "batchId", "entity", "sourceId", "payload") VALUES ($1, $2, $3, $4, $5, $6, $7)',
        ['staged-ap-1', 'tenant-1', 'project-1', 'stage-1', 'FINANCE_AP_OPEN_ITEMS', 'legacy-ap-1', JSON.stringify({ openAmount: '100.00' })],
      )
      const staged = await db.query<{ sourceId: string; payload: { openAmount: string } }>('SELECT "sourceId", "payload" FROM "DataMigrationStagedRecord" WHERE "batchId" = $1', ['stage-1'])
      expect(staged.rows).toEqual([{ sourceId: 'legacy-ap-1', payload: { openAmount: '100.00' } }])
      await expect(db.query(
        'INSERT INTO "DataMigrationStagedRecord" ("id", "tenantId", "projectId", "batchId", "entity", "sourceId", "payload") VALUES ($1, $2, $3, $4, $5, $6, $7)',
        ['staged-ap-2', 'tenant-1', 'project-1', 'stage-1', 'FINANCE_AP_OPEN_ITEMS', 'legacy-ap-1', JSON.stringify({ openAmount: '90.00' })],
      )).rejects.toThrow()

      const links = await db.query<{ sourceId: string; targetId: string }>('SELECT "sourceId", "targetId" FROM "DataMigrationRecordLink" WHERE "tenantId" = $1', ['tenant-1'])
      expect(links.rows).toEqual([{ sourceId: 'legacy-co-1', targetId: 'asas-co-1' }])
      await expect(db.query(
        'INSERT INTO "DataMigrationRecordLink" ("id", "tenantId", "projectId", "importJobId", "sourceEntity", "sourceId", "targetEntity", "targetId") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        ['link-2', 'tenant-1', 'project-1', 'job-1', 'CRM_COMPANIES', 'legacy-co-1', 'CRM_COMPANIES', 'asas-co-2'],
      )).rejects.toThrow()
    } finally {
      await db.close()
    }
  })
})

describe('Finance source open-item amount migration', () => {
  it('adds nullable source totals without changing existing invoice amounts', async () => {
    const db = new PGlite()
    try {
      await db.exec('CREATE TABLE "PayableInvoice" ("id" TEXT PRIMARY KEY, "amount" DECIMAL(19,4) NOT NULL)')
      await db.exec('CREATE TABLE "ReceivableInvoice" ("id" TEXT PRIMARY KEY, "amount" DECIMAL(19,4) NOT NULL)')
      await db.query('INSERT INTO "PayableInvoice" ("id", "amount") VALUES ($1, $2)', ['ap-1', '80.00'])
      await db.query('INSERT INTO "ReceivableInvoice" ("id", "amount") VALUES ($1, $2)', ['ar-1', '60.00'])
      await db.exec(financeSourceAmountsMigration)
      const payables = await db.query('SELECT "amount", "sourceOriginalAmount", "sourcePaidAmount" FROM "PayableInvoice" WHERE "id" = $1', ['ap-1'])
      const receivables = await db.query('SELECT "amount", "sourceOriginalAmount", "sourcePaidAmount" FROM "ReceivableInvoice" WHERE "id" = $1', ['ar-1'])
      expect(payables.rows).toEqual([{ amount: '80.0000', sourceOriginalAmount: null, sourcePaidAmount: null }])
      expect(receivables.rows).toEqual([{ amount: '60.0000', sourceOriginalAmount: null, sourcePaidAmount: null }])
    } finally {
      await db.close()
    }
  })
})

describe('Finance migration cutover schema', () => {
  it('adds a source document date to receivables without changing existing invoice balances', async () => {
    const db = new PGlite()
    try {
      await db.exec('CREATE TABLE "ReceivableInvoice" ("id" TEXT PRIMARY KEY, "amount" DECIMAL(19,4) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)')
      await db.query('INSERT INTO "ReceivableInvoice" ("id", "amount") VALUES ($1, $2)', ['ar-existing', '125.50'])
      await db.exec(financeReceivableDateMigration)
      const existing = await db.query('SELECT "amount", "date" IS NOT NULL AS "hasDate" FROM "ReceivableInvoice" WHERE "id" = $1', ['ar-existing'])
      expect(existing.rows).toEqual([{ amount: '125.5000', hasDate: true }])
      await db.query('INSERT INTO "ReceivableInvoice" ("id", "amount", "date") VALUES ($1, $2, $3)', ['ar-migrated', '80.00', '2026-09-15T00:00:00.000Z'])
      const migrated = await db.query('SELECT "amount", "date"::text AS "date" FROM "ReceivableInvoice" WHERE "id" = $1', ['ar-migrated'])
      expect(migrated.rows[0]).toEqual({ amount: '80.0000', date: '2026-09-15 00:00:00' })
    } finally {
      await db.close()
    }
  })
})

describe('Inventory valuation schema', () => {
  it('applies additively and enforces tenant-safe, nonnegative valuation records', async () => {
    const db = new PGlite()
    try {
      await db.exec('CREATE TABLE "Tenant" ("id" TEXT PRIMARY KEY)')
      await db.exec('CREATE TABLE "Product" ("id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, CONSTRAINT "Product_id_tenantId_key" UNIQUE ("id", "tenantId"))')
      await db.exec('CREATE TABLE "StockMovement" ("id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "productId" TEXT NOT NULL, CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE)')
      await db.exec('CREATE TABLE "JournalEntry" ("id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, CONSTRAINT "JournalEntry_id_tenantId_key" UNIQUE ("id", "tenantId"))')
      await db.exec(inventoryValuationMigration)
      await db.query('INSERT INTO "Tenant" ("id") VALUES ($1)', ['tenant-1'])
      await db.query('INSERT INTO "Product" ("id", "tenantId") VALUES ($1, $2)', ['product-1', 'tenant-1'])
      await db.query('INSERT INTO "StockMovement" ("id", "tenantId", "productId") VALUES ($1, $2, $3)', ['movement-1', 'tenant-1', 'product-1'])
      await expect(db.query('INSERT INTO "StockMovement" ("id", "tenantId", "productId") VALUES ($1, $2, $3)', ['movement-cross-tenant', 'tenant-2', 'product-1'])).rejects.toThrow()
      await db.query('INSERT INTO "InventoryValuationBalance" ("id", "tenantId", "productId", "currency", "onHandQuantity", "inventoryValue", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)', ['balance-1', 'tenant-1', 'product-1', 'USD', 3, '30.00'])
      await db.query('INSERT INTO "InventoryValuationConfig" ("tenantId", "costingMethod", "updatedAt") VALUES ($1, $2, CURRENT_TIMESTAMP)', ['tenant-1', 'FIFO'])
      await db.query('INSERT INTO "InventoryValuationAccountMapping" ("id", "tenantId", "currency", "inventoryAssetAccountCode", "costOfGoodsSoldAccountCode", "goodsReceivedNotInvoicedAccountCode", "adjustmentExpenseAccountCode", "adjustmentGainAccountCode", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)', ['map-1', 'tenant-1', 'USD', '1300', '5000', '2100', '5100', '4100'])
      const accountMapping = await db.query<{ inventoryAssetAccountCode: string }>('SELECT "inventoryAssetAccountCode" FROM "InventoryValuationAccountMapping" WHERE "tenantId" = $1 AND "currency" = $2', ['tenant-1', 'USD'])
      expect(accountMapping.rows).toEqual([{ inventoryAssetAccountCode: '1300' }])
      await expect(db.query('INSERT INTO "InventoryValuationAccountMapping" ("id", "tenantId", "currency", "inventoryAssetAccountCode", "costOfGoodsSoldAccountCode", "goodsReceivedNotInvoicedAccountCode", "adjustmentExpenseAccountCode", "adjustmentGainAccountCode", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)', ['map-2', 'tenant-1', 'USD', '1300', '5000', '2100', '5100', '4100'])).rejects.toThrow()
      await expect(db.query('INSERT INTO "InventoryCostLayer" ("id", "tenantId", "productId", "sourceMovementId", "currency", "originalQuantity", "remainingQuantity", "originalValue", "remainingValue", "receivedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP)', ['layer-cross-tenant', 'tenant-2', 'product-1', 'movement-1', 'USD', 3, 3, '30', '30'])).rejects.toThrow()
      await expect(db.query('INSERT INTO "InventoryValuationBalance" ("id", "tenantId", "productId", "currency", "onHandQuantity", "inventoryValue", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)', ['balance-negative', 'tenant-1', 'product-1', 'USD', -1, '0'])).rejects.toThrow()
      await expect(db.query('INSERT INTO "InventoryCostLayer" ("id", "tenantId", "productId", "sourceMovementId", "currency", "originalQuantity", "remainingQuantity", "originalValue", "remainingValue", "receivedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP)', ['layer-empty-value', 'tenant-1', 'product-1', 'movement-1', 'USD', 3, 0, '30', '1'])).rejects.toThrow()
    } finally {
      await db.close()
    }
  })
})

describe('onboarding migration project retry schema', () => {
  it('preserves existing project rows and adds an explicit onboarding origin marker', async () => {
    const db = new PGlite()
    try {
      await db.exec('CREATE TABLE "DataMigrationProject" ("id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "name" TEXT NOT NULL, "status" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)')
      await db.query('INSERT INTO "DataMigrationProject" ("id", "tenantId", "name", "status") VALUES ($1, $2, $3, $4)', ['existing', 'tenant-1', 'Existing migration', 'PLANNING'])
      await db.exec(onboardingMigrationProjectResumeMigration)
      const oldProject = await db.query('SELECT "name", "createdDuringOnboarding" FROM "DataMigrationProject" WHERE "id" = $1', ['existing'])
      expect(oldProject.rows).toEqual([{ name: 'Existing migration', createdDuringOnboarding: false }])
      await db.query('INSERT INTO "DataMigrationProject" ("id", "tenantId", "name", "status", "createdDuringOnboarding") VALUES ($1,$2,$3,$4,$5)', ['onboarding', 'tenant-1', 'Onboarding migration', 'IN_PROGRESS', true])
      const onboardingProject = await db.query('SELECT "createdDuringOnboarding" FROM "DataMigrationProject" WHERE "id" = $1', ['onboarding'])
      expect(onboardingProject.rows).toEqual([{ createdDuringOnboarding: true }])
    } finally {
      await db.close()
    }
  })
})
