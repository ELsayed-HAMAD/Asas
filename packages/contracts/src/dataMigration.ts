import { z } from 'zod'
import { dataMigrationEntitySchema, dataMigrationModuleSchema, dataMigrationProjectStatusSchema, dealStageSchema } from './enums.generated.js'
import { paginationMetaSchema, paginationQuerySchema } from './primitives/pagination.js'

export const dataMigrationImportJobSchema = z.object({
  id: z.string().min(1),
  entity: dataMigrationEntitySchema,
  status: z.literal('COMPLETED'),
  totalRows: z.number().int().nonnegative(),
  importedRows: z.number().int().nonnegative(),
  createdAt: z.string(),
  completedAt: z.string(),
})

export const dataMigrationStageBatchSchema = z.object({
  id: z.string().min(1),
  entity: dataMigrationEntitySchema,
  status: z.enum(['STAGED', 'COMPLETED']),
  sequence: z.number().int().positive(),
  totalRows: z.number().int().nonnegative(),
  stagedRows: z.number().int().nonnegative(),
  createdAt: z.string(),
})

export const dataMigrationProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sourceSystem: z.string().nullable(),
  modules: z.array(dataMigrationModuleSchema),
  status: dataMigrationProjectStatusSchema,
  targetCutoverAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  jobs: z.array(dataMigrationImportJobSchema).optional(),
  stagedBatches: z.array(dataMigrationStageBatchSchema).optional(),
})

export const dataMigrationProjectsResponseSchema = z.object({
  projects: z.array(dataMigrationProjectSchema),
})

export const dataMigrationProjectCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sourceSystem: z.string().trim().max(120).nullable().optional().transform(value => value === undefined ? undefined : value || null),
  modules: z.array(dataMigrationModuleSchema).min(1).max(5).refine(values => new Set(values).size === values.length, 'Choose each area only once'),
  targetCutoverAt: z.iso.datetime().nullable().optional(),
})

export const dataMigrationProjectUpdateSchema = dataMigrationProjectCreateSchema.partial().extend({
  modules: dataMigrationProjectCreateSchema.shape.modules.optional(),
})

export const crmCompanyImportRowSchema = z.object({
  sourceId: z.string().max(2_000),
  name: z.string().max(2_000),
  tier: z.string().max(2_000).optional(),
})

export const crmCompanyImportRequestSchema = z.object({
  companies: z.array(crmCompanyImportRowSchema).min(1).max(500),
})

export const dataMigrationRowIssueSchema = z.object({
  rowNumber: z.number().int().min(2),
  field: z.string().min(1),
  message: z.string().min(1),
})

export const crmCompanyImportValidationSchema = z.object({
  totalRows: z.number().int().min(1).max(500),
  validRows: z.number().int().min(0).max(500),
  alreadyImported: z.boolean(),
  issues: z.array(dataMigrationRowIssueSchema),
})

export const crmCompanyImportResponseSchema = z.object({
  imported: z.number().int().min(0).max(500),
  replayed: z.boolean(),
  job: dataMigrationImportJobSchema,
})

export const crmDealImportRowSchema = z.object({
  sourceId: z.string().max(2_000),
  name: z.string().max(2_000),
  stage: z.string().max(2_000),
  value: z.string().max(2_000).optional(),
  companySourceId: z.string().max(2_000).optional(),
  ownerEmail: z.string().max(2_000).optional(),
  winProbability: z.string().max(2_000).optional(),
  closeDate: z.string().max(2_000).optional(),
  actualCloseDate: z.string().max(2_000).optional(),
  sourceCreatedAt: z.string().max(2_000).optional(),
  productLine: z.string().max(2_000).optional(),
  forecastBucket: z.string().max(2_000).optional(),
})

export const crmDealImportRequestSchema = z.object({ deals: z.array(crmDealImportRowSchema).min(1).max(500) })

export const crmDealImportValidationSchema = z.object({
  totalRows: z.number().int().min(1).max(500),
  validRows: z.number().int().min(0).max(500),
  alreadyImported: z.boolean(),
  issues: z.array(dataMigrationRowIssueSchema),
})

export const crmDealImportResponseSchema = z.object({
  imported: z.number().int().min(0).max(500),
  replayed: z.boolean(),
  job: dataMigrationImportJobSchema,
})

export const inventoryProductImportRowSchema = z.object({
  sourceId: z.string().max(2_000),
  sku: z.string().max(2_000),
  name: z.string().max(2_000),
  salePrice: z.string().max(2_000),
  minThreshold: z.string().max(2_000).optional(),
  avgMonthlyUsage: z.string().max(2_000).optional(),
  leadTimeDays: z.string().max(2_000).optional(),
  warehouse: z.string().max(2_000).optional(),
  aisle: z.string().max(2_000).optional(),
  bin: z.string().max(2_000).optional(),
  sourceCreatedAt: z.string().max(2_000).optional(),
})

export const inventoryProductImportRequestSchema = z.object({ products: z.array(inventoryProductImportRowSchema).min(1).max(500) })

export const inventoryProductImportValidationSchema = z.object({
  totalRows: z.number().int().min(1).max(500),
  validRows: z.number().int().min(0).max(500),
  alreadyImported: z.boolean(),
  issues: z.array(dataMigrationRowIssueSchema),
})

export const inventoryProductImportResponseSchema = z.object({
  imported: z.number().int().min(0).max(500),
  replayed: z.boolean(),
  job: dataMigrationImportJobSchema,
})

export const inventoryOpeningStockImportRowSchema = z.object({
  sourceProductId: z.string().max(2_000),
  quantity: z.string().max(2_000),
  /**
   * Optional source acquisition cost per unit. Required for positive quantities when the
   * workspace has an active valuation policy; otherwise the row stays quantity-only.
   */
  unitCost: z.string().max(2_000).optional(),
  asOf: z.string().max(2_000),
})

export const inventoryOpeningStockImportRequestSchema = z.object({
  stock: z.array(inventoryOpeningStockImportRowSchema).min(1).max(500),
})

export const inventoryOpeningStockImportValidationSchema = z.object({
  totalRows: z.number().int().min(1).max(500),
  validRows: z.number().int().min(0).max(500),
  alreadyImported: z.boolean(),
  issues: z.array(dataMigrationRowIssueSchema),
})

export const inventoryOpeningStockImportResponseSchema = z.object({
  imported: z.number().int().min(0).max(500),
  replayed: z.boolean(),
  job: dataMigrationImportJobSchema,
})

export const inventorySupplierImportRowSchema = z.object({
  sourceId: z.string().max(2_000),
  name: z.string().max(2_000),
  sourceCreatedAt: z.string().max(2_000).optional(),
})

export const inventorySupplierImportRequestSchema = z.object({ suppliers: z.array(inventorySupplierImportRowSchema).min(1).max(500) })

export const inventoryProductSupplierImportRowSchema = z.object({
  sourceProductId: z.string().max(2_000),
  sourceSupplierId: z.string().max(2_000),
})

export const inventoryProductSupplierImportRequestSchema = z.object({ links: z.array(inventoryProductSupplierImportRowSchema).min(1).max(500) })

export const inventorySupplierImportValidationSchema = z.object({
  totalRows: z.number().int().min(1).max(500),
  validRows: z.number().int().min(0).max(500),
  alreadyImported: z.boolean(),
  issues: z.array(dataMigrationRowIssueSchema),
})

export const inventorySupplierImportResponseSchema = z.object({ imported: z.number().int().min(0).max(500), replayed: z.boolean(), job: dataMigrationImportJobSchema })
export const inventoryProductSupplierImportValidationSchema = inventorySupplierImportValidationSchema
export const inventoryProductSupplierImportResponseSchema = inventorySupplierImportResponseSchema

export type DataMigrationProject = z.infer<typeof dataMigrationProjectSchema>
export type DataMigrationImportJob = z.infer<typeof dataMigrationImportJobSchema>
export type DataMigrationProjectCreate = z.infer<typeof dataMigrationProjectCreateSchema>
export type DataMigrationProjectUpdate = z.infer<typeof dataMigrationProjectUpdateSchema>
export type CrmCompanyImportRow = z.infer<typeof crmCompanyImportRowSchema>
export type CrmDealImportRow = z.infer<typeof crmDealImportRowSchema>
export type InventoryProductImportRow = z.infer<typeof inventoryProductImportRowSchema>
export type InventoryOpeningStockImportRow = z.infer<typeof inventoryOpeningStockImportRowSchema>
export type InventorySupplierImportRow = z.infer<typeof inventorySupplierImportRowSchema>
export type InventoryProductSupplierImportRow = z.infer<typeof inventoryProductSupplierImportRowSchema>

export const financeVendorImportRowSchema = z.object({ sourceId: z.string().max(2_000), name: z.string().max(2_000) })
export const financeVendorImportRequestSchema = z.object({ vendors: z.array(financeVendorImportRowSchema).min(1).max(500) })
export const financeCustomerImportRowSchema = z.object({ sourceId: z.string().max(2_000), name: z.string().max(2_000), email: z.string().max(2_000).optional() })
export const financeCustomerImportRequestSchema = z.object({ customers: z.array(financeCustomerImportRowSchema).min(1).max(500) })
export const financeCounterpartyImportValidationSchema = z.object({
  totalRows: z.number().int().min(1).max(500),
  validRows: z.number().int().min(0).max(500),
  alreadyImported: z.boolean(),
  issues: z.array(dataMigrationRowIssueSchema),
})
export const financeCounterpartyImportResponseSchema = z.object({ imported: z.number().int().min(0).max(500), replayed: z.boolean(), job: dataMigrationImportJobSchema })
export type FinanceVendorImportRow = z.infer<typeof financeVendorImportRowSchema>
export type FinanceCustomerImportRow = z.infer<typeof financeCustomerImportRowSchema>

export const projectPortfolioImportRowSchema = z.object({
  sourceId: z.string().max(2_000),
  name: z.string().max(2_000),
  status: z.string().max(2_000),
  budget: z.string().max(2_000).optional(),
  currency: z.string().max(2_000).optional(),
  timeline: z.string().max(2_000).optional(),
  sourceCreatedAt: z.string().max(2_000).optional(),
})
export const projectPortfolioImportRequestSchema = z.object({ projects: z.array(projectPortfolioImportRowSchema).min(1).max(500) })
export const projectPortfolioImportValidationSchema = z.object({
  totalRows: z.number().int().min(1).max(500),
  validRows: z.number().int().min(0).max(500),
  alreadyImported: z.boolean(),
  issues: z.array(dataMigrationRowIssueSchema),
})
export const projectPortfolioImportResponseSchema = z.object({ imported: z.number().int().min(0).max(500), replayed: z.boolean(), job: dataMigrationImportJobSchema })
export type ProjectPortfolioImportRow = z.infer<typeof projectPortfolioImportRowSchema>

const migrationDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD dates')
const migrationAmountSchema = z.string().trim().min(1).max(64)
const migrationSourceIdSchema = z.string().trim().min(1).max(120)
const migrationCurrencySchema = z.string().trim().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code')

export const financeApOpenItemRowSchema = z.object({
  sourceId: migrationSourceIdSchema,
  vendorSourceId: migrationSourceIdSchema,
  invoiceNumber: z.string().trim().max(120).optional(),
  invoiceDate: migrationDateSchema,
  dueDate: migrationDateSchema.optional(),
  currency: migrationCurrencySchema,
  openAmount: migrationAmountSchema,
  originalAmount: migrationAmountSchema.optional(),
  paidAmount: migrationAmountSchema.optional(),
  status: z.enum(['PENDING', 'APPROVED', 'SCHEDULED']),
})
export const financeArOpenItemRowSchema = z.object({
  sourceId: migrationSourceIdSchema,
  customerSourceId: migrationSourceIdSchema,
  invoiceNumber: z.string().trim().max(120).optional(),
  invoiceDate: migrationDateSchema,
  dueDate: migrationDateSchema.optional(),
  currency: migrationCurrencySchema,
  openAmount: migrationAmountSchema,
  originalAmount: migrationAmountSchema.optional(),
  paidAmount: migrationAmountSchema.optional(),
  status: z.enum(['CURRENT', 'OVERDUE', 'IN_COLLECTIONS']),
})
export const financeApOpenItemsRequestSchema = z.object({ items: z.array(financeApOpenItemRowSchema).min(1).max(500) })
export const financeArOpenItemsRequestSchema = z.object({ items: z.array(financeArOpenItemRowSchema).min(1).max(500) })
export const financeOpeningBalanceLineSchema = z.object({
  code: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(160),
  kind: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
  side: z.enum(['DEBIT', 'CREDIT']),
  amount: migrationAmountSchema,
})
export const financeOpeningBalanceRequestSchema = z.object({
  asOf: migrationDateSchema,
  accountsReceivableControlTotal: migrationAmountSchema,
  accountsPayableControlTotal: migrationAmountSchema,
  lines: z.array(financeOpeningBalanceLineSchema).min(1).max(500),
})
export const financeStageValidationSchema = z.object({
  totalRows: z.number().int().min(1).max(500),
  validRows: z.number().int().min(0).max(500),
  alreadyStaged: z.boolean(),
  issues: z.array(dataMigrationRowIssueSchema),
})
export const financeStageBatchSchema = dataMigrationStageBatchSchema
export const financeStageResponseSchema = z.object({ batch: financeStageBatchSchema, replayed: z.boolean() })
export const financeReconciliationSchema = z.object({
  targetCutoverAt: migrationDateSchema.nullable(),
  workspaceCurrency: migrationCurrencySchema,
  state: z.enum(['INCOMPLETE', 'RECONCILIATION_REQUIRED', 'RECONCILED_PENDING_CUTOVER', 'CUTOVER_COMPLETED']),
  cutoverAvailable: z.literal(false),
  evidence: z.object({
    apRows: z.number().int().nonnegative(),
    eligibleApRows: z.number().int().nonnegative(),
    pendingApRows: z.number().int().nonnegative(),
    arRows: z.number().int().nonnegative(),
    trialBalanceRows: z.number().int().nonnegative(),
    activeJournalCount: z.number().int().nonnegative(),
    existingPayableInvoiceCount: z.number().int().nonnegative(),
    existingReceivableInvoiceCount: z.number().int().nonnegative(),
  }),
  balances: z.object({
    sourceApControl: migrationAmountSchema.nullable(),
    stagedEligibleApAtCutoverFx: migrationAmountSchema.nullable(),
    apDifference: migrationAmountSchema.nullable(),
    sourceArControl: migrationAmountSchema.nullable(),
    stagedArAtCutoverFx: migrationAmountSchema.nullable(),
    arDifference: migrationAmountSchema.nullable(),
    residualDebit: migrationAmountSchema.nullable(),
    residualCredit: migrationAmountSchema.nullable(),
  }),
  issues: z.array(z.object({ code: z.string(), message: z.string() })),
})
export const financeCutoverRequestSchema = z.object({ acknowledge: z.literal('I_CONFIRM_FINANCE_CUTOVER') })
export const financeCutoverResponseSchema = z.object({
  replayed: z.boolean(),
  cutoverAt: z.string(),
  openingJournalId: z.string(),
  importedPayables: z.number().int().nonnegative(),
  importedReceivables: z.number().int().nonnegative(),
  pendingPayablesNotRecognized: z.number().int().nonnegative(),
})
export const financeStageRecordsQuerySchema = paginationQuerySchema.extend({
  entity: z.enum(['FINANCE_AP_OPEN_ITEMS', 'FINANCE_AR_OPEN_ITEMS', 'FINANCE_OPENING_BALANCE']),
})
export const financeStageRecordSchema = z.object({
  id: z.string().min(1),
  entity: z.enum(['FINANCE_AP_OPEN_ITEMS', 'FINANCE_AR_OPEN_ITEMS', 'FINANCE_OPENING_BALANCE']),
  sourceId: z.string(),
  revision: z.number().int().positive(),
  isCurrent: z.boolean(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
})
export const financeStageRecordsResponseSchema = z.object({
  items: z.array(financeStageRecordSchema),
  pagination: paginationMetaSchema,
})
export type FinanceApOpenItemRow = z.infer<typeof financeApOpenItemRowSchema>
export type FinanceArOpenItemRow = z.infer<typeof financeArOpenItemRowSchema>
export type FinanceOpeningBalanceLine = z.infer<typeof financeOpeningBalanceLineSchema>
export type FinanceReconciliation = z.infer<typeof financeReconciliationSchema>
