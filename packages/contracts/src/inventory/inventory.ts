/**
 * Inventory contract — the schemas both `apps/api`'s inventory module and `apps/web`
 * import, so the wire shape is defined exactly once.
 *
 * Two invariants worth knowing before touching these:
 *
 * - **Money is a decimal string**, same as HR's `salary` — Prisma returns `Decimal` columns as
 *   strings and `decimalStringSchema` accepts nothing else, so a float cannot leak in at the
 *   boundary. Integer-cents wire form (`moneySchema`) applies to amounts that travel as
 *   `{ amount, currency }`; a product price is a single `Decimal` column and uses the string form.
 * - **Current stock is derived, never trusted from a client field.** `product.stock` is the
 *   source of truth the API maintains inside a transaction with each `StockMovement`; a
 *   `currentStock` on the wire is always the sum of that tenant's movements, computed in SQL.
 */
import { z } from 'zod'
import { productStockStatusSchema } from '../enums.generated.js'
import { idSchema, isoDateSchema, isoDateTimeSchema, boundedText, shortTextSchema, longTextSchema } from '../primitives/ids.js'
import { decimalStringSchema } from '../primitives/money.js'
import { collection, paginated, paginationQuerySchema } from '../primitives/pagination.js'

/** Wire label for a movement's direction, derived from the sign of `delta`. */
export const stockMovementTypeSchema = z.enum(['IN', 'OUT'])

export type StockMovementType = z.infer<typeof stockMovementTypeSchema>

/**
 * The one place a quantity-on-hand becomes a stock status. Callers never set `status` from a
 * client field — it is derived from the number the DB actually holds, which is what keeps the
 * badge honest (see the Phase 0 audit finding on client-computed state).
 */
export function stockLevelToStatus(quantityOnHand: number, reorderPoint: number): 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' {
  if (quantityOnHand <= 0) return 'OUT_OF_STOCK'
  if (quantityOnHand <= reorderPoint) return 'LOW_STOCK'
  return 'IN_STOCK'
}

export const productSchema = z.object({
  id: idSchema,
  name: z.string(),
  sku: z.string(),
  price: decimalStringSchema,
  stock: z.int().min(0),
  status: productStockStatusSchema,
  warehouse: z.string().nullable(),
  aisle: z.string().nullable(),
  bin: z.string().nullable(),
  avgMonthlyUsage: z.number().nullable(),
  leadTimeDays: z.int().nonnegative().nullable(),
  /** Reorder point: a product is `LOW_STOCK` when its quantity on hand falls to this level. */
  minThreshold: z.int().min(0),
  archivedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type Product = z.infer<typeof productSchema>

export const productSupplierSchema = z.object({ id: idSchema, name: shortTextSchema })
export const productSupplierListResponseSchema = collection(productSupplierSchema)
export type ProductSupplier = z.infer<typeof productSupplierSchema>

export const purchaseOrderWriteSchema = z.object({
  productId: idSchema,
  quantity: z.int().min(1),
})
export type PurchaseOrderWriteInput = z.infer<typeof purchaseOrderWriteSchema>
export const purchaseOrderSchema = z.object({
  id: idSchema,
  status: z.literal('DRAFT'),
  createdAt: isoDateTimeSchema,
  productId: idSchema,
  productName: z.string(),
  sku: z.string(),
  quantity: z.int().min(1),
})
export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>

export const productListQuerySchema = paginationQuerySchema.extend({
  search: boundedText(200, 0).optional(),
  status: productStockStatusSchema.optional(),
  archived: z.enum(['true', 'false']).transform(value => value === 'true').optional().transform(value => value ?? false),
})

export type ProductListQuery = z.infer<typeof productListQuerySchema>

export const productSummarySchema = z.object({
  totalProducts: z.int().min(0),
  totalUnitsOnHand: z.int().min(0),
  lowStockProducts: z.int().min(0),
})

export type ProductSummary = z.infer<typeof productSummarySchema>

export const productListResponseSchema = paginated(productSchema, productSummarySchema)

export type ProductListResponse = z.infer<typeof productListResponseSchema>

export const productWriteSchema = z.object({
  name: shortTextSchema,
  sku: boundedText(64),
  price: decimalStringSchema.optional(),
  /** Starting quantity — applied as a single initial `StockMovement` inside the create transaction. */
  stock: z.int().min(0).optional(),
  warehouse: boundedText(200).optional().nullable(),
  aisle: boundedText(64).optional().nullable(),
  bin: boundedText(64).optional().nullable(),
  avgMonthlyUsage: z.number().nonnegative().optional().nullable(),
  leadTimeDays: z.int().nonnegative().optional().nullable(),
  minThreshold: z.int().min(0).optional(),
})

export type ProductWriteInput = z.infer<typeof productWriteSchema>

/**
 * Update input deliberately excludes `stock` — quantities on hand only change through
 * `recordStockMovement`, so every unit is attributable to a movement and the derived
 * stock level can never drift from the sum of the movement rows.
 */
export const productUpdateSchema = z.object({
  name: shortTextSchema.optional(),
  sku: boundedText(64).optional(),
  price: decimalStringSchema.optional(),
  warehouse: boundedText(200).optional().nullable(),
  aisle: boundedText(64).optional().nullable(),
  bin: boundedText(64).optional().nullable(),
  avgMonthlyUsage: z.number().nonnegative().optional().nullable(),
  leadTimeDays: z.int().nonnegative().optional().nullable(),
  minThreshold: z.int().min(0).optional(),
})

export type ProductUpdateInput = z.infer<typeof productUpdateSchema>

export const productArchiveInputSchema = z.object({ archived: z.boolean() })
export type ProductArchiveInput = z.infer<typeof productArchiveInputSchema>

/**
 * A product and its live stock level. `currentStock` is the sum of the tenant's
 * `StockMovement` rows for the product, aggregated in SQL — one query for every product,
 * never an N+1, never a client-side `.reduce()`.
 */
export const stockLevelSchema = productSchema.extend({
  currentStock: z.int(),
})

export type StockLevel = z.infer<typeof stockLevelSchema>

export const stockLevelListResponseSchema = collection(stockLevelSchema)

export type StockLevelListResponse = z.infer<typeof stockLevelListResponseSchema>

/** A product at or below its reorder point, with the quantity on hand the alert is about. */
export const stockAlertSchema = z.object({
  id: idSchema,
  name: z.string(),
  sku: z.string(),
  warehouse: z.string().nullable(),
  currentStock: z.int().min(0),
  minThreshold: z.int().min(0),
})

export type StockAlert = z.infer<typeof stockAlertSchema>

export const stockAlertListResponseSchema = collection(stockAlertSchema)

export type StockAlertListResponse = z.infer<typeof stockAlertListResponseSchema>

/** A warehouse name as stored on `product.warehouse` (the schema has no Warehouse model). */
export const warehouseSchema = z.object({
  name: z.string(),
  productCount: z.int().min(0),
})

export type Warehouse = z.infer<typeof warehouseSchema>

export const warehouseListResponseSchema = collection(warehouseSchema)

export type WarehouseListResponse = z.infer<typeof warehouseListResponseSchema>

export const stockMovementSchema = z.object({
  id: idSchema,
  productId: idSchema,
  /** Which product this is, denormalised so a movement list never needs a second fetch. */
  productName: z.string(),
  warehouse: z.string().nullable(),
  delta: z.int(),
  type: stockMovementTypeSchema,
  note: z.string().nullable(),
  createdAt: isoDateTimeSchema,
})

export type StockMovement = z.infer<typeof stockMovementSchema>

export const stockMovementListQuerySchema = paginationQuerySchema.extend({
  productId: idSchema.optional(),
  warehouse: boundedText(200, 0).optional(),
  type: stockMovementTypeSchema.optional(),
})

export type StockMovementListQuery = z.infer<typeof stockMovementListQuerySchema>

export const stockMovementSummarySchema = z.object({
  totalIn: z.int().min(0),
  totalOut: z.int().min(0),
  recordedThisMonth: z.object({
    totalIn: z.int().min(0),
    totalOut: z.int().min(0),
  }),
  recordedThisMonthComparison: z.object({
    previousStartDate: isoDateSchema,
    previousEndDateExclusive: isoDateSchema,
    totalIn: z.int().min(0),
    totalOut: z.int().min(0),
  }),
})

export type StockMovementSummary = z.infer<typeof stockMovementSummarySchema>

export const stockMovementListResponseSchema = paginated(stockMovementSchema, stockMovementSummarySchema)

export type StockMovementListResponse = z.infer<typeof stockMovementListResponseSchema>

export const stockMovementWriteSchema = z.object({
  productId: idSchema,
  /** Positive = goods in, negative = goods out. */
  delta: z.int().refine(value => value !== 0, 'delta cannot be zero'),
  note: longTextSchema.optional().nullable(),
})

export type StockMovementWriteInput = z.infer<typeof stockMovementWriteSchema>

export const stockMovementRecordedSchema = stockMovementSchema.extend({
  /** The product's stock after the transaction, so the caller does not have to refetch. */
  newStock: z.int().min(0),
})

export type StockMovementRecorded = z.infer<typeof stockMovementRecordedSchema>
