/**
 * Pagination and list envelopes.
 *
 * The bounds mirror the running API's `parsePagination` (default 25, hard ceiling 100) so the
 * contract describes the system that exists rather than an aspiration. The ceiling is not
 * cosmetic: `listPayables` currently fetches every invoice so the browser can total them, and
 * an unbounded `limit` is how that pattern survives a rebuild.
 */
import { z } from 'zod'

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

/**
 * Query parameters. `z.coerce` is required because query strings arrive as strings — this is
 * the one place coercion is correct rather than lax.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>

export const paginationMetaSchema = z.object({
  page: z.int().min(1),
  limit: z.int().min(1).max(MAX_PAGE_SIZE),
  total: z.int().min(0),
  /** Total pages. Zero when there are no rows at all, so the UI can distinguish empty. */
  pages: z.int().min(0),
})

export type PaginationMeta = z.infer<typeof paginationMetaSchema>

/** Translate a validated query into Prisma's `skip`/`take`. */
export function toPrismaPage(query: PaginationQuery): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.limit, take: query.limit }
}

export function buildPaginationMeta(query: PaginationQuery, total: number): PaginationMeta {
  return {
    page: query.page,
    limit: query.limit,
    total,
    pages: total === 0 ? 0 : Math.ceil(total / query.limit),
  }
}

/**
 * A page of rows.
 *
 * `summary` is a first-class, *required* slot rather than an afterthought. Every KPI card in the
 * app is currently computed by `.reduce()`-ing an unpaginated fetch in a React render function;
 * a page is only correct if the totals arrive with it, computed over the whole result set in
 * SQL. Endpoints with nothing to summarise pass `z.null()` and say so explicitly.
 */
export function paginated<Item extends z.ZodType, Summary extends z.ZodType>(
  item: Item,
  summary: Summary,
) {
  return z.object({
    items: z.array(item),
    pagination: paginationMetaSchema,
    summary,
  })
}

/** An unpaginated list, for genuinely small fixed sets such as departments or warehouses. */
export function collection<Item extends z.ZodType>(item: Item) {
  return z.object({ items: z.array(item) })
}
