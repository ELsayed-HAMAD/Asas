/**
 * Inventory valuation contracts — company costing policy, explicit GL account mappings, and the
 * subledger reconciliation report.
 *
 * These schemas deliberately carry no default account codes and no default cost. A workspace
 * either has a configured policy with real ledger accounts or it has no financial inventory
 * valuation; there is no silent fallback that would value stock from its selling price.
 */
import { z } from 'zod'
import { idSchema, isoDateSchema, isoDateTimeSchema, boundedText } from '../primitives/ids.js'
import { currencyCodeSchema, decimalStringSchema } from '../primitives/money.js'
import { collection } from '../primitives/pagination.js'
import {
  inventoryCostingMethodSchema,
  inventoryCostReasonSchema,
  type InventoryCostingMethod,
  type InventoryCostReason,
} from '../enums.generated.js'

/** Reasons a manual outbound movement may use; opening and purchase receipt are inbound-only. */
export const inventoryIssueReasonSchema = z.enum([
  'SALE',
  'CONSUMPTION',
  'DAMAGE',
  'COUNT_ADJUSTMENT',
  'SUPPLIER_RETURN',
])
export type InventoryIssueReason = z.infer<typeof inventoryIssueReasonSchema>

export const ledgerAccountKindSchema = z.enum(['ASSET', 'LIABILITY', 'EXPENSE', 'INCOME', 'EQUITY'])
export type LedgerAccountKind = z.infer<typeof ledgerAccountKindSchema>

const accountCodeSchema = boundedText(32).regex(
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
  'Account codes may contain letters, digits, dots, underscores, and hyphens',
)

export const inventoryValuationAccountInputSchema = z.object({
  code: accountCodeSchema,
  name: boundedText(120),
})
export type InventoryValuationAccountInput = z.infer<typeof inventoryValuationAccountInputSchema>

export const inventoryValuationAccountsInputSchema = z.object({
  /** Balance-sheet control account debited when stock is received and credited when issued. */
  inventoryAsset: inventoryValuationAccountInputSchema,
  /** Cost of goods sold / consumption expense credited against inventory on issue. */
  costOfGoodsSold: inventoryValuationAccountInputSchema,
  /** Liability credited on a purchase receipt until the supplier invoice is matched. */
  goodsReceivedNotInvoiced: inventoryValuationAccountInputSchema,
  /** Expense for shrinkage, damage, and negative count corrections. */
  adjustmentExpense: inventoryValuationAccountInputSchema,
  /** Income for positive count corrections that are not supplier or customer returns. */
  adjustmentGain: inventoryValuationAccountInputSchema,
})
export type InventoryValuationAccountsInput = z.infer<typeof inventoryValuationAccountsInputSchema>

export const inventoryValuationMappingInputSchema = z
  .object({
    currency: currencyCodeSchema,
    accounts: inventoryValuationAccountsInputSchema,
  })
  .superRefine((mapping, ctx) => {
    const entries = Object.entries(mapping.accounts) as Array<[keyof InventoryValuationAccountsInput, { code: string }]>
    const seen = new Map<string, string>()
    for (const [role, account] of entries) {
      const key = account.code.trim().toUpperCase()
      const previous = seen.get(key)
      if (previous) {
        ctx.addIssue({
          code: 'custom',
          path: ['accounts', role, 'code'],
          message: `Account code '${account.code}' is already used for ${previous}; every inventory role needs a distinct ledger account`,
        })
      } else {
        seen.set(key, role)
      }
    }
  })
export type InventoryValuationMappingInput = z.infer<typeof inventoryValuationMappingInputSchema>

export const inventoryValuationSetupWriteSchema = z
  .object({
    costingMethod: inventoryCostingMethodSchema,
    mappings: z.array(inventoryValuationMappingInputSchema).min(1).max(25),
  })
  .superRefine((input, ctx) => {
    const currencies = new Set<string>()
    for (const [index, mapping] of input.mappings.entries()) {
      if (currencies.has(mapping.currency)) {
        ctx.addIssue({ code: 'custom', path: ['mappings', index, 'currency'], message: `Duplicate mapping for ${mapping.currency}` })
      }
      currencies.add(mapping.currency)
    }
  })
export type InventoryValuationSetupWriteInput = z.infer<typeof inventoryValuationSetupWriteSchema>

export const ledgerAccountRefSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  kind: ledgerAccountKindSchema,
  currency: z.string(),
})
export type LedgerAccountRef = z.infer<typeof ledgerAccountRefSchema>

export const inventoryValuationAccountsSchema = z.object({
  inventoryAsset: ledgerAccountRefSchema,
  costOfGoodsSold: ledgerAccountRefSchema,
  goodsReceivedNotInvoiced: ledgerAccountRefSchema,
  adjustmentExpense: ledgerAccountRefSchema,
  adjustmentGain: ledgerAccountRefSchema,
})
export type InventoryValuationAccounts = z.infer<typeof inventoryValuationAccountsSchema>

export const inventoryValuationMappingSchema = z.object({
  currency: z.string(),
  accounts: inventoryValuationAccountsSchema,
})
export type InventoryValuationMapping = z.infer<typeof inventoryValuationMappingSchema>

export const inventoryValuationSetupSchema = z.object({
  configured: z.boolean(),
  costingMethod: inventoryCostingMethodSchema.nullable(),
  configuredAt: isoDateTimeSchema.nullable(),
  /** Number of valuation events already posted. A policy change is blocked once this is non-zero. */
  valuationPostings: z.int().min(0),
  mappings: z.array(inventoryValuationMappingSchema),
})
export type InventoryValuationSetup = z.infer<typeof inventoryValuationSetupSchema>

export const inventoryValuationCurrencyReportSchema = z.object({
  currency: z.string(),
  productCount: z.int().min(0),
  /** Sum of `Product.stock` in this currency, from the quantity movement ledger. */
  quantityOnHand: z.int().min(0),
  /** Quantity covered by valuation balances. */
  valuedQuantity: z.int().min(0),
  /** Quantity that has no cost event; the books cannot reconcile while this is non-zero. */
  unvaluedQuantity: z.int().min(0),
  /** Current carrying value of the valued quantity. */
  inventoryValue: decimalStringSchema,
  /** Net posted event value: receipts add and issues subtract. */
  postedValue: decimalStringSchema,
  /** Net value of valuation events with no journal entry; current writers leave this at zero. */
  unpostedValue: decimalStringSchema,
  /** Net debit balance of the mapped inventory asset control account. */
  ledgerAssetBalance: decimalStringSchema,
  /** `postedValue - ledgerAssetBalance`; zero means posted subledger events agree with the control account. */
  ledgerDifference: decimalStringSchema,
  /** `inventoryValue - postedValue - unpostedValue`; non-zero means the subledger itself is inconsistent. */
  subledgerDifference: decimalStringSchema,
  /** Number of quantity movements with no valuation event. */
  unvaluedMovementCount: z.int().min(0),
  reconciled: z.boolean(),
})
export type InventoryValuationCurrencyReport = z.infer<typeof inventoryValuationCurrencyReportSchema>

export const inventoryValuationReportSchema = z.object({
  configured: z.boolean(),
  costingMethod: inventoryCostingMethodSchema.nullable(),
  currencies: z.array(inventoryValuationCurrencyReportSchema),
})
export type InventoryValuationReport = z.infer<typeof inventoryValuationReportSchema>

export const inventoryValuationEventSchema = z.object({
  id: idSchema,
  productId: idSchema,
  productName: z.string(),
  /** Null for an opening valuation: cost is assigned to quantity that already existed. */
  stockMovementId: idSchema.nullable(),
  journalEntryId: idSchema.nullable(),
  costingMethod: inventoryCostingMethodSchema,
  reason: inventoryCostReasonSchema,
  quantityDelta: z.int(),
  costValue: decimalStringSchema,
  currency: z.string(),
  postedAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
})
export type InventoryValuationEvent = z.infer<typeof inventoryValuationEventSchema>

/**
 * Value the part of a product's on-hand quantity that has no established cost. This is the only
 * path that may create a valuation layer without a stock movement; it cannot value more than the
 * units on hand, and a partially valued position is topped up rather than double-counted.
 */
export const inventoryOpeningValuationWriteSchema = z.object({
  productId: idSchema,
  unitCost: decimalStringSchema,
  asOf: isoDateSchema,
})
export type InventoryOpeningValuationWriteInput = z.infer<typeof inventoryOpeningValuationWriteSchema>

export const inventoryOpeningValuationResultSchema = z.object({
  productId: idSchema,
  quantity: z.int().positive(),
  value: decimalStringSchema,
  journalEntryId: idSchema,
})
export type InventoryOpeningValuationResult = z.infer<typeof inventoryOpeningValuationResultSchema>

export const inventoryUnvaluedProductSchema = z.object({
  id: idSchema,
  name: z.string(),
  sku: z.string(),
  stock: z.int().min(0),
  valuedQuantity: z.int().min(0),
  unvaluedQuantity: z.int().min(0),
  currency: z.string(),
  archivedAt: isoDateTimeSchema.nullable(),
})
export type InventoryUnvaluedProduct = z.infer<typeof inventoryUnvaluedProductSchema>

export const inventoryUnvaluedProductListResponseSchema = collection(inventoryUnvaluedProductSchema)
