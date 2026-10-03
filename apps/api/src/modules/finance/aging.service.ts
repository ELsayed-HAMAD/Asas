import { Prisma, type PrismaClient } from '@prisma/client'
import { Money, type CurrencyCode } from '@asas/domain'
import type { AgingBucket } from '@asas/contracts'

/**
 * The AR aging report (rebuild plan, Phase 3): open receivables bucketed by how far past due
 * they are — `current` / `1-30` / `31-60` / `60+` — computed as ONE SQL query with
 * `CASE WHEN` over date ranges, exactly as the plan specifies.
 *
 * The whole tenant set is bucketed server-side; the page renders the rows, never aggregates
 * them. Unpaid = `CURRENT`/`OVERDUE`/`IN_COLLECTIONS` (everything but `PAID`), matching the
 * `openBalance` definition in `finance/index.ts`. Buckets with no invoices are zero-filled so
 * the report always carries all four rows in a fixed order.
 */
const UNPAID_RECEIVABLE_STATUSES = ['CURRENT', 'OVERDUE', 'IN_COLLECTIONS'] as const

const BUCKET_ORDER = ['current', '1-30', '31-60', '60+'] as const

export async function computeAgingBuckets(
  prisma: PrismaClient,
  tenantId: string,
  currency: CurrencyCode,
): Promise<AgingBucket[]> {
  const rows = await prisma.$queryRaw<
    Array<{ bucket: string; count: bigint; total: Prisma.Decimal | null }>
  >`
    SELECT CASE
        WHEN "dueDate" IS NULL OR "dueDate" >= CURRENT_DATE THEN 'current'
        WHEN "dueDate" >= CURRENT_DATE - INTERVAL '30 days' THEN '1-30'
        WHEN "dueDate" >= CURRENT_DATE - INTERVAL '60 days' THEN '31-60'
        ELSE '60+'
      END AS bucket,
      count(*)::bigint AS count,
      sum("amount") AS total
    FROM "ReceivableInvoice"
    WHERE "tenantId" = ${tenantId}
      AND "status"::text IN (${Prisma.join([...UNPAID_RECEIVABLE_STATUSES])})
    GROUP BY 1
  `

  const byBucket = new Map(rows.map(row => [row.bucket, row]))
  return BUCKET_ORDER.map(bucket => {
    const row = byBucket.get(bucket)
    const total = row?.total ?? new Prisma.Decimal(0)
    return {
      bucket,
      count: row ? Number(row.count) : 0,
      total: Money.fromDecimal(total.toString(), currency, 'DOWN').toWire(),
    }
  })
}
