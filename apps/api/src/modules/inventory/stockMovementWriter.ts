import { Prisma } from '@prisma/client'
import { AppError } from '../../utils/errors.js'

type InventoryTx = Pick<Prisma.TransactionClient, 'product' | 'stockMovement'>

const MAX_STOCK = 2_147_483_647

/**
 * The single quantity posting boundary for inventory. Product.stock and its movement ledger
 * advance together in a transaction, with tenant, archive, stock-bound, and optional empty-stock
 * guards applied to the same write. Cost valuation will attach to this boundary so receipts,
 * issues, adjustments, and migration openings cannot bypass it.
 */
export async function writeStockMovement(
  tx: InventoryTx,
  input: {
    tenantId: string
    productId: string
    delta: number
    note?: string | null
    requestKey?: string
    requestHash?: string
    createdAt?: Date
    allowArchived?: boolean
    requireEmpty?: boolean
  },
) {
  if (!Number.isInteger(input.delta) || input.delta < -MAX_STOCK || input.delta > MAX_STOCK) {
    throw new AppError(400, 'Stock movement must be a whole number within the supported quantity range')
  }
  if (Boolean(input.requestKey) !== Boolean(input.requestHash)) {
    throw new AppError(400, 'A stock movement request key and its payload hash must be stored together')
  }

  const where: Prisma.ProductWhereInput = {
    id: input.productId,
    tenantId: input.tenantId,
    ...(!input.allowArchived && { archivedAt: null }),
    ...(input.requireEmpty
      ? { stock: 0, movements: { none: {} } }
      : input.delta < 0
        ? { stock: { gte: -input.delta } }
        : input.delta > 0
          ? { stock: { lte: MAX_STOCK - input.delta } }
          : {}),
  }
  const changed = await tx.product.updateMany({ where, data: { stock: { increment: input.delta } } })
  if (changed.count !== 1) {
    if (input.requireEmpty) throw new AppError(409, 'A product stock position changed during import. Validate again and reconcile the product.')
    if (input.delta < 0) throw new AppError(409, 'Insufficient stock or product no longer available')
    if (input.delta > 0) throw new AppError(409, 'Stock quantity exceeds the supported maximum or product is no longer available')
    throw new AppError(404, 'Product not found')
  }

  const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId }, select: { stock: true } })
  const movement = input.delta === 0 ? null : await tx.stockMovement.create({
    data: {
      tenantId: input.tenantId,
      productId: input.productId,
      delta: input.delta,
      note: input.note ?? null,
      ...(input.requestKey && {
        requestKey: input.requestKey,
        requestHash: input.requestHash,
      }),
      ...(input.createdAt && { createdAt: input.createdAt }),
    },
    include: { product: { select: { name: true, warehouse: true } } },
  })
  return { movement, newStock: product.stock }
}
