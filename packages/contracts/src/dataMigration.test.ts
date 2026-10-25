import { describe, expect, it } from 'vitest'
import { crmCompanyImportRequestSchema, crmDealImportRequestSchema, dataMigrationProjectCreateSchema, dataMigrationProjectUpdateSchema, inventoryProductImportRequestSchema, inventoryOpeningStockImportRequestSchema, inventorySupplierImportRequestSchema, inventoryProductSupplierImportRequestSchema, financeCustomerImportRequestSchema, financeVendorImportRequestSchema, projectPortfolioImportRequestSchema, financeApOpenItemsRequestSchema, financeArOpenItemsRequestSchema, financeOpeningBalanceRequestSchema } from './dataMigration.js'

describe('data migration project contract', () => {
  it('accepts a company-wide plan with independent module scopes', () => {
    expect(dataMigrationProjectCreateSchema.parse({
      name: 'Acme company migration',
      sourceSystem: 'Legacy ERP',
      modules: ['HR', 'CRM', 'FINANCE', 'INVENTORY', 'PROJECTS'],
    })).toMatchObject({ name: 'Acme company migration', modules: ['HR', 'CRM', 'FINANCE', 'INVENTORY', 'PROJECTS'] })
  })

  it('rejects empty or repeated module scopes', () => {
    expect(dataMigrationProjectCreateSchema.safeParse({ name: 'No scope', modules: [] }).success).toBe(false)
    expect(dataMigrationProjectCreateSchema.safeParse({ name: 'Repeated scope', modules: ['CRM', 'CRM'] }).success).toBe(false)
  })

  it('allows clearing optional source and cutover planning fields', () => {
    expect(dataMigrationProjectUpdateSchema.parse({ sourceSystem: '', targetCutoverAt: null })).toEqual({ sourceSystem: null, targetCutoverAt: null })
  })

  it('bounds CRM company batches while letting row validation return actionable issues', () => {
    expect(crmCompanyImportRequestSchema.parse({ companies: [{ sourceId: '', name: '' }] }).companies).toHaveLength(1)
    expect(crmCompanyImportRequestSchema.safeParse({ companies: Array.from({ length: 501 }, () => ({ sourceId: 'x', name: 'Company' })) }).success).toBe(false)
  })

  it('bounds deal migration batches while leaving conditional business rules to row validation', () => {
    expect(crmDealImportRequestSchema.parse({ deals: [{ sourceId: 'legacy-1', name: 'Renewal', stage: 'CLOSED_WON', actualCloseDate: '' }] }).deals).toHaveLength(1)
    expect(crmDealImportRequestSchema.safeParse({ deals: Array.from({ length: 501 }, () => ({ sourceId: 'x', name: 'Deal', stage: 'LEADS' })) }).success).toBe(false)
  })

  it('bounds Inventory product batches without treating them as stock quantity or valuation imports', () => {
    expect(inventoryProductImportRequestSchema.parse({ products: [{ sourceId: 'item-1', sku: 'SKU-1', name: 'Filter', salePrice: '10.25' }] }).products).toHaveLength(1)
    expect(inventoryProductImportRequestSchema.safeParse({ products: Array.from({ length: 501 }, () => ({ sourceId: 'x', sku: 'SKU', name: 'Item', salePrice: '0' })) }).success).toBe(false)
  })

  it('keeps opening stock as a separate product-dependent migration with optional source cost', () => {
    expect(inventoryOpeningStockImportRequestSchema.parse({ stock: [{ sourceProductId: 'item-1', quantity: '240', asOf: '2026-09-30' }] }).stock).toHaveLength(1)
    expect(inventoryOpeningStockImportRequestSchema.parse({
      stock: [{ sourceProductId: 'item-1', quantity: '240', unitCost: '12.50', asOf: '2026-09-30' }],
    }).stock[0]?.unitCost).toBe('12.50')
    expect(inventoryOpeningStockImportRequestSchema.safeParse({ stock: Array.from({ length: 501 }, () => ({ sourceProductId: 'x', quantity: '0', asOf: '2026-01-01' })) }).success).toBe(false)
  })

  it('keeps Inventory suppliers and product associations as separately bounded imports', () => {
    expect(inventorySupplierImportRequestSchema.parse({ suppliers: [{ sourceId: 'supplier-1', name: 'Northstar' }] }).suppliers).toHaveLength(1)
    expect(inventoryProductSupplierImportRequestSchema.parse({ links: [{ sourceProductId: 'item-1', sourceSupplierId: 'supplier-1' }] }).links).toHaveLength(1)
    expect(inventoryProductSupplierImportRequestSchema.safeParse({ links: Array.from({ length: 501 }, () => ({ sourceProductId: 'item-1', sourceSupplierId: 'supplier-1' })) }).success).toBe(false)
  })

  it('keeps Finance customers and vendors as separate bounded master-data imports', () => {
    expect(financeCustomerImportRequestSchema.parse({ customers: [{ sourceId: 'cust-1', name: 'Northstar', email: 'billing@example.com' }] }).customers).toHaveLength(1)
    expect(financeVendorImportRequestSchema.parse({ vendors: [{ sourceId: 'vendor-1', name: 'Industrial Supply' }] }).vendors).toHaveLength(1)
    expect(financeCustomerImportRequestSchema.safeParse({ customers: Array.from({ length: 501 }, () => ({ sourceId: 'x', name: 'Customer' })) }).success).toBe(false)
  })

  it('defines distinct, bounded Finance open-item batches with preserved source balances and status', () => {
    expect(financeApOpenItemsRequestSchema.parse({ items: [{ sourceId: 'ap-1', vendorSourceId: 'vendor-1', invoiceDate: '2026-08-01', currency: 'USD', openAmount: '80.00', originalAmount: '100.00', paidAmount: '20.00', status: 'APPROVED' }] }).items).toHaveLength(1)
    expect(financeArOpenItemsRequestSchema.parse({ items: [{ sourceId: 'ar-1', customerSourceId: 'customer-1', invoiceDate: '2026-08-01', currency: 'EUR', openAmount: '80.00', status: 'OVERDUE' }] }).items).toHaveLength(1)
    expect(financeApOpenItemsRequestSchema.safeParse({ items: Array.from({ length: 501 }, () => ({ sourceId: 'ap', vendorSourceId: 'v', invoiceDate: '2026-08-01', currency: 'USD', openAmount: '1', status: 'PENDING' })) }).success).toBe(false)
    expect(financeArOpenItemsRequestSchema.safeParse({ items: [{ sourceId: 'ar-2', customerSourceId: 'customer-1', invoiceDate: '2026-08-01', currency: 'US', openAmount: '80', status: 'PAID' }] }).success).toBe(false)
  })

  it('accepts only bounded trial-balance staging payloads with an explicit snapshot date', () => {
    expect(financeOpeningBalanceRequestSchema.parse({ asOf: '2026-09-30', accountsReceivableControlTotal: '0', accountsPayableControlTotal: '0', lines: [{ code: 'CASH', name: 'Cash', kind: 'ASSET', side: 'DEBIT', amount: '100.00' }, { code: 'CAPITAL', name: 'Capital', kind: 'EQUITY', side: 'CREDIT', amount: '100.00' }] }).lines).toHaveLength(2)
    expect(financeOpeningBalanceRequestSchema.safeParse({ asOf: '2026-09-30', accountsReceivableControlTotal: '0', accountsPayableControlTotal: '0', lines: Array.from({ length: 501 }, (_, index) => ({ code: `A${index}`, name: 'Account', kind: 'ASSET', side: 'DEBIT', amount: '1' })) }).success).toBe(false)
  })

  it('bounds project portfolio batches while leaving status and currency checks row-addressable', () => {
    expect(projectPortfolioImportRequestSchema.parse({ projects: [{ sourceId: 'project-1', name: 'Warehouse', status: 'legacy-active', budget: '10', currency: 'EUR' }] }).projects).toHaveLength(1)
    expect(projectPortfolioImportRequestSchema.safeParse({ projects: Array.from({ length: 501 }, () => ({ sourceId: 'x', name: 'Project', status: 'PLANNING' })) }).success).toBe(false)
  })
})
