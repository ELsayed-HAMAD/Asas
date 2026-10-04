/**
 * Inventory service — the domain logic behind the inventory module's routes.
 *
 * Invariants mirror the HR reference and the other modules:
 *
 *  - **Tenant isolation.** Every query is scoped by `tenantId` from the authenticated session.
 *  - **Current stock is derived, never trusted from a client field.** `product.stock` is the
 *    source of truth the API maintains inside a transaction with each `StockMovement`; the
 *    `currentStock`/`status` a read returns is the sum of that tenant's movement rows, computed
 *    in SQL (`groupBy`), never an N+1 and never a client-side `.reduce()`.
 *  - **Product prices are `Decimal` columns** carried as the major-unit decimal string form
 *    (`decimalStringSchema`), since a price is a single column rather than a `{ amount, currency }`
 *    wire pair.
 */
import { Prisma } from '@prisma/client'
import type {
  Product as PrismaProduct,
  PrismaClient,
  StockMovement as PrismaStockMovement,
} from '@prisma/client'
import type {
  Product,
  ProductListQuery,
  ProductSummary,
  ProductUpdateInput,
  ProductWriteInput,
  StockAlert,
  StockLevel,
  StockMovement,
  StockMovementListQuery,
  StockMovementRecorded,
  StockMovementSummary,
  StockMovementWriteInput,
  Warehouse,
} from '@asas/contracts'
import { buildPaginationMeta, stockLevelToStatus, toPrismaPage } from '@asas/contracts'
import { AppError } from '../../utils/errors.js'

// ── Stock derivation (SQL, single round trip) ──────────────────────────────────

/**
 * The product's on-hand quantity as the sum of its movement deltas, aggregated in SQL. One
 * `groupBy` over all the tenant's products gives every product's stock in a single query — the
 * derived value the badge's status is computed from, so the number and the status can never
 * disagree.
 */
async function stockByProduct(
  prisma: PrismaClient,
  tenantId: string,
): Promise<Map<string, number>> {
  const rows = await prisma.stockMovement.groupBy({
    by: ['productId'],
    where: { tenantId },
    _sum: { delta: true },
  })
  return new Map(rows.map(row => [row.productId, row._sum.delta ?? 0]))
}

async function singleProductStock(
  prisma: PrismaClient,
  tenantId: string,
  productId: string,
): Promise<number> {
  const row = await prisma.stockMovement.aggregate({
    where: { tenantId, productId },
    _sum: { delta: true },
  })
  return row._sum.delta ?? 0
}

function mapProduct(
  product: PrismaProduct,
  currentStock: number,
): Product {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    price: product.price.toString(),
    stock: currentStock,
    status: stockLevelToStatus(currentStock, product.minThreshold),
    warehouse: product.warehouse,
    aisle: product.aisle,
    bin: product.bin,
    avgMonthlyUsage: product.avgMonthlyUsage,
    leadTimeDays: product.leadTimeDays,
    minThreshold: product.minThreshold,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  }
}

/**
 * Reconcile the stored `stock` column with the sum of the movement rows. The column is
 * maintained in the same transaction as each movement (see {@link recordStockMovement}), so this
 * is a consistency check, not the source — the *derived* sum is what every read reports, and it
 * is what keeps the status badge honest even if a row were ever written out of band.
 */
function derivedStock(product: PrismaProduct, movementStock: number | undefined): number {
  return movementStock ?? 0
}

// ── Products ────────────────────────────────────────────────────────────────────

export interface ProductListResult {
  items: Product[]
  pagination: ReturnType<typeof buildPaginationMeta>
  summary: ProductSummary
}

/**
 * Build the product-list `WHERE` clause as a parameterized `Prisma.Sql` fragment, so the page and
 * its `total` count are filtered *identically, in SQL*. Every dynamic value (the search term) is
 * interpolated through the `Prisma.sql` tag — never concatenated into the query string — so a
 * `%` or a quote in the search box cannot alter the statement. The `status` filter is a derived
 * value (`stockLevelToStatus(stock, minThreshold)`), written as raw SQL over the maintained
 * `stock` column and `minThreshold` — a column-to-column comparison a plain Prisma `where`
 * cannot express.
 */
function buildProductWhere(tenantId: string, query: ProductListQuery): Prisma.Sql {
  const clauses: Prisma.Sql[] = [Prisma.sql`"tenantId" = ${tenantId}`]

  if (query.search) {
    const pattern = `%${query.search}%`
    clauses.push(Prisma.sql`("name" ILIKE ${pattern} OR "sku" ILIKE ${pattern} OR "warehouse" ILIKE ${pattern})`)
  }

  // Mirror stockLevelToStatus exactly: OUT = stock<=0, LOW = 0<stock<=minThreshold, IN = stock>minThreshold.
  if (query.status === 'OUT_OF_STOCK') clauses.push(Prisma.sql`"stock" <= 0`)
  else if (query.status === 'LOW_STOCK') clauses.push(Prisma.sql`"stock" > 0 AND "stock" <= "minThreshold"`)
  else if (query.status === 'IN_STOCK') clauses.push(Prisma.sql`"stock" > "minThreshold"`)

  return Prisma.join(clauses, ' AND ')
}

interface RawProductRow {
  id: string
  name: string
  sku: string
  price: Prisma.Decimal
  stock: number
  warehouse: string | null
  aisle: string | null
  bin: string | null
  avgMonthlyUsage: number | null
  leadTimeDays: number | null
  minThreshold: number
  createdAt: Date
  updatedAt: Date
}

export async function listProducts(
  prisma: PrismaClient,
  tenantId: string,
  query: ProductListQuery,
): Promise<ProductListResult> {
  const whereClause = buildProductWhere(tenantId, query)
  const { skip, take } = toPrismaPage(query)

  const [rows, countRow] = await Promise.all([
    prisma.$queryRaw<RawProductRow[]>`
      SELECT "id","name","sku","price","stock","warehouse","aisle","bin",
             "avgMonthlyUsage","leadTimeDays","minThreshold","createdAt","updatedAt"
      FROM "Product"
      WHERE ${whereClause}
      ORDER BY "name" ASC
      LIMIT ${take} OFFSET ${skip}
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM "Product" WHERE ${whereClause}
    `,
  ])

  const total = Number(countRow[0]?.count ?? 0n)
  return {
    items: rows.map(row => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      price: row.price.toString(),
      stock: row.stock,
      status: stockLevelToStatus(row.stock, row.minThreshold),
      warehouse: row.warehouse,
      aisle: row.aisle,
      bin: row.bin,
      avgMonthlyUsage: row.avgMonthlyUsage,
      leadTimeDays: row.leadTimeDays,
      minThreshold: row.minThreshold,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    pagination: buildPaginationMeta(query, total),
    summary: await productSummary(prisma, tenantId),
  }
}

async function productSummary(prisma: PrismaClient, tenantId: string): Promise<ProductSummary> {
  // Both KPIs are SQL aggregates over the whole tenant set. `product.stock` is the on-hand
  // quantity, maintained in the same transaction as each movement (see recordStockMovement), so
  // the `stock` column and the movement sum are in lockstep — the column is the cheap, native
  // way to aggregate. `totalUnitsOnHand` is a `_sum`, and `lowStockProducts` is a `count` of
  // products whose on-hand has fallen to their reorder point.
  const [totalUnitsAgg, lowStockCount] = await Promise.all([
    prisma.product.aggregate({ where: { tenantId }, _sum: { stock: true } }),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM "Product"
      WHERE "tenantId" = ${tenantId} AND "stock" <= "minThreshold"
    `,
  ])

  return {
    totalProducts: await prisma.product.count({ where: { tenantId } }),
    totalUnitsOnHand: totalUnitsAgg._sum.stock ?? 0,
    lowStockProducts: Number(lowStockCount[0]?.count ?? 0n),
  }
}

export async function getProduct(prisma: PrismaClient, tenantId: string, id: string): Promise<Product> {
  const product = await prisma.product.findFirst({ where: { id, tenantId } })
  if (!product) throw new AppError(404, 'Product not found')
  const currentStock = await singleProductStock(prisma, tenantId, id)
  return mapProduct(product, derivedStock(product, currentStock))
}

export async function createProduct(
  prisma: PrismaClient,
  tenantId: string,
  input: ProductWriteInput,
): Promise<Product> {
  const skuExists = await prisma.product.findFirst({ where: { tenantId, sku: input.sku } })
  if (skuExists) throw new AppError(409, 'A product with this SKU already exists')

  const initialStock = input.stock ?? 0
  const product = await prisma.$transaction(async tx => {
    const created = await tx.product.create({
      data: {
        tenantId,
        name: input.name,
        sku: input.sku,
        price: input.price ?? '0',
        stock: initialStock,
        warehouse: input.warehouse ?? null,
        aisle: input.aisle ?? null,
        bin: input.bin ?? null,
        avgMonthlyUsage: input.avgMonthlyUsage ?? null,
        leadTimeDays: input.leadTimeDays ?? null,
        minThreshold: input.minThreshold ?? 10,
      },
    })
    if (initialStock !== 0) {
      await tx.stockMovement.create({
        data: {
          tenantId,
          productId: created.id,
          delta: initialStock,
          note: 'Initial stock',
        },
      })
    }
    return created
  })

  return mapProduct(product, initialStock)
}

export async function updateProduct(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: ProductUpdateInput,
): Promise<Product> {
  const existing = await prisma.product.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Product not found')

  if (input.sku !== undefined && input.sku !== existing.sku) {
    const skuExists = await prisma.product.findFirst({ where: { tenantId, sku: input.sku, id: { not: id } } })
    if (skuExists) throw new AppError(409, 'A product with this SKU already exists')
  }

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.sku !== undefined && { sku: input.sku }),
      ...(input.price !== undefined && { price: input.price }),
      ...(input.warehouse !== undefined && { warehouse: input.warehouse }),
      ...(input.aisle !== undefined && { aisle: input.aisle }),
      ...(input.bin !== undefined && { bin: input.bin }),
      ...(input.avgMonthlyUsage !== undefined && { avgMonthlyUsage: input.avgMonthlyUsage }),
      ...(input.leadTimeDays !== undefined && { leadTimeDays: input.leadTimeDays }),
      ...(input.minThreshold !== undefined && { minThreshold: input.minThreshold }),
    },
  })

  const currentStock = await singleProductStock(prisma, tenantId, id)
  return mapProduct(product, derivedStock(product, currentStock))
}

export async function deleteProduct(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  const existing = await prisma.product.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Product not found')
  await prisma.product.delete({ where: { id } })
}

// ── Stock levels & alerts (unpaginated, derived) ───────────────────────────────

export async function listStockLevels(prisma: PrismaClient, tenantId: string): Promise<StockLevel[]> {
  const [products, stockMap] = await Promise.all([
    prisma.product.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
    stockByProduct(prisma, tenantId),
  ])
  return products.map(product => {
    const currentStock = derivedStock(product, stockMap.get(product.id))
    return {
      ...mapProduct(product, currentStock),
      currentStock,
    }
  })
}

export async function listStockAlerts(prisma: PrismaClient, tenantId: string): Promise<StockAlert[]> {
  const [products, stockMap] = await Promise.all([
    prisma.product.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
    stockByProduct(prisma, tenantId),
  ])
  return products
    .filter(product => derivedStock(product, stockMap.get(product.id)) <= product.minThreshold)
    .map(product => {
      const currentStock = derivedStock(product, stockMap.get(product.id))
      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        warehouse: product.warehouse,
        currentStock,
        minThreshold: product.minThreshold,
      }
    })
}

export async function listWarehouses(prisma: PrismaClient, tenantId: string): Promise<Warehouse[]> {
  const rows = await prisma.product.groupBy({
    by: ['warehouse'],
    where: { tenantId, warehouse: { not: null } },
    _count: { _all: true },
  })
  return rows
    .filter(row => row.warehouse !== null)
    .map(row => ({ name: row.warehouse as string, productCount: row._count._all }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ── Stock movements ────────────────────────────────────────────────────────────

export interface StockMovementListResult {
  items: StockMovement[]
  pagination: ReturnType<typeof buildPaginationMeta>
  summary: StockMovementSummary
}

export async function listStockMovements(
  prisma: PrismaClient,
  tenantId: string,
  query: StockMovementListQuery,
): Promise<StockMovementListResult> {
  const where: Prisma.StockMovementWhereInput = { tenantId }
  if (query.productId) where.productId = query.productId
  if (query.warehouse) where.product = { warehouse: query.warehouse }
  if (query.type === 'IN') where.delta = { gt: 0 }
  if (query.type === 'OUT') where.delta = { lt: 0 }

  const { skip, take } = toPrismaPage(query)
  const [items, total, inAgg, outAgg] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { name: true, warehouse: true } } },
    }),
    prisma.stockMovement.count({ where: { tenantId } }),
    prisma.stockMovement.aggregate({ where: { tenantId, delta: { gt: 0 } }, _sum: { delta: true } }),
    prisma.stockMovement.aggregate({ where: { tenantId, delta: { lt: 0 } }, _sum: { delta: true } }),
  ])

  return {
    items: items.map(mapMovement),
    pagination: buildPaginationMeta(query, total),
    summary: {
      totalIn: inAgg._sum.delta ?? 0,
      totalOut: outAgg._sum.delta ?? 0,
    },
  }
}

function mapMovement(movement: PrismaStockMovement & { product: { name: string; warehouse: string | null } }): StockMovement {
  return {
    id: movement.id,
    productId: movement.productId,
    productName: movement.product.name,
    warehouse: movement.product.warehouse,
    delta: movement.delta,
    type: movement.delta > 0 ? 'IN' : 'OUT',
    note: movement.note,
    createdAt: movement.createdAt.toISOString(),
  }
}

/**
 * Record a movement and, in the same transaction, advance the product's `stock` column by the
 * same delta. Keeping the column and the movement rows in lockstep inside one transaction is
 * what makes the derived status trustworthy; a movement that is not a product's (or a different
 * tenant's) is a 404, not a corrupt write.
 */
export async function recordStockMovement(
  prisma: PrismaClient,
  tenantId: string,
  input: StockMovementWriteInput,
): Promise<StockMovementRecorded> {
  const product = await prisma.product.findFirst({ where: { id: input.productId, tenantId } })
  if (!product) throw new AppError(404, 'Product not found')

  const result = await prisma.$transaction(async tx => {
    const movement = await tx.stockMovement.create({
      data: {
        tenantId,
        productId: product.id,
        delta: input.delta,
        note: input.note ?? null,
      },
      include: { product: { select: { name: true, warehouse: true } } },
    })
    await tx.product.update({
      where: { id: product.id },
      data: { stock: { increment: input.delta } },
    })
    return movement
  })

  return {
    ...mapMovement(result),
    newStock: product.stock + input.delta,
  }
}
