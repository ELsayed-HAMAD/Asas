import { Prisma, type PrismaClient } from '@prisma/client'
import { PGlite } from '@electric-sql/pglite'
import { overviewResponseSchema } from '@asas/contracts'
import { describe, expect, it, vi } from 'vitest'
import { getOverview } from '../src/modules/crm/crm.service.js'

describe('CRM overview stage conversion cohorts', () => {
  it('calculates all-time conversion from distinct recorded stage-entry cohorts', async () => {
    const raw = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ currentWonCount: 3n, currentLostCount: 1n, previousWonCount: 2n, previousLostCount: 2n }])
      .mockResolvedValueOnce([
        { fromStage: 'LEADS', toStage: 'PROPOSAL', enteredCount: 10n, convertedCount: 6n },
        { fromStage: 'PROPOSAL', toStage: 'NEGOTIATION', enteredCount: 6n, convertedCount: 3n },
        { fromStage: 'NEGOTIATION', toStage: 'CLOSED_WON', enteredCount: 3n, convertedCount: 1n },
      ])
      .mockResolvedValueOnce([{ previousCount: 8n, previousTotal: new Prisma.Decimal('250') }])
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ currency: 'USD', timezone: 'America/New_York' }) },
      deal: {
        groupBy: vi.fn().mockResolvedValue([
          { stage: 'LEADS', _sum: { value: new Prisma.Decimal('100') }, _count: { _all: 2 } },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
      $queryRaw: raw,
    } as unknown as PrismaClient

    const result = await getOverview(prisma, 'tenant_1')

    expect(result.stageConversions).toEqual([
      { fromStage: 'LEADS', toStage: 'PROPOSAL', enteredCount: 10, convertedCount: 6, rate: 60 },
      { fromStage: 'PROPOSAL', toStage: 'NEGOTIATION', enteredCount: 6, convertedCount: 3, rate: 50 },
      { fromStage: 'NEGOTIATION', toStage: 'CLOSED_WON', enteredCount: 3, convertedCount: 1, rate: 33.3 },
    ])
    expect(result.winRateComparison).toMatchObject({
      current: { wonCount: 3, lostCount: 1, rate: 75 },
      previous: { wonCount: 2, lostCount: 2, rate: 50 },
    })
    expect(result.pipeline.openCountComparison.previousCount).toBe(8)
    expect(result.pipeline.openTotalComparison.previousTotal).toEqual({ amount: 25000, currency: 'USD' })
    expect(overviewResponseSchema.parse(result)).toEqual(result)
    const monthlySql = (raw.mock.calls[0]![0] as TemplateStringsArray).join(' ')
    expect(monthlySql).toContain('AT TIME ZONE')
    expect(raw.mock.calls[0]).toContain('America/New_York')
    const periodSql = (raw.mock.calls[1]![0] as TemplateStringsArray).join(' ')
    expect(periodSql).toContain('::date::timestamp AT TIME ZONE')
    expect(raw.mock.calls[1]).toContain('America/New_York')
    const sql = (raw.mock.calls[2]![0] as TemplateStringsArray).join(' ')
    expect(sql).toContain('"DealStageHistory"')
    expect(sql).toContain('min(history."occurredAt")')
    expect(sql).toContain('converted."occurredAt" >= entered."enteredAt"')
    expect(sql).toContain('history."isBaseline" = FALSE')
    expect(sql).toContain('converted."isBaseline" = FALSE')
    const openCountSql = (raw.mock.calls[3]![0] as TemplateStringsArray).join(' ')
    expect(openCountSql).toContain('"CrmHistoryCoverage"')
    expect(openCountSql).toContain('DISTINCT ON (history."dealId")')
    expect(openCountSql).toContain('sum(latest_stage."value")')

    // Execute the exact captured query with PostgreSQL-compatible SQL and fixture stage history.
    const [template, ...values] = raw.mock.calls[2] as [TemplateStringsArray, ...unknown[]]
    const executableSql = template.reduce((query, segment, index) => query + segment + (index < values.length ? `$${index + 1}` : ''), '')
    const db = new PGlite()
    await db.waitReady
    try {
      await db.exec(`CREATE TYPE "DealStage" AS ENUM ('LEADS', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST');
        CREATE TABLE "DealStageHistory" (
          "id" TEXT, "tenantId" TEXT NOT NULL, "dealId" TEXT NOT NULL,
          "toStage" "DealStage" NOT NULL, "occurredAt" TIMESTAMPTZ NOT NULL, "value" NUMERIC NOT NULL,
          "isBaseline" BOOLEAN NOT NULL DEFAULT FALSE
        );
        INSERT INTO "DealStageHistory" ("tenantId", "dealId", "toStage", "occurredAt", "value") VALUES
          ('tenant_1', 'a', 'LEADS', '2026-01-01', 100), ('tenant_1', 'a', 'PROPOSAL', '2026-01-02', 110), ('tenant_1', 'a', 'NEGOTIATION', '2026-01-03', 120), ('tenant_1', 'a', 'CLOSED_WON', '2026-01-04', 120),
          ('tenant_1', 'b', 'LEADS', '2026-01-01', 200),
          ('tenant_1', 'c', 'LEADS', '2026-01-01', 300), ('tenant_1', 'c', 'PROPOSAL', '2026-01-02', 300),
          ('tenant_1', 'd', 'PROPOSAL', '2026-01-01', 400), ('tenant_1', 'd', 'NEGOTIATION', '2026-01-02', 400), ('tenant_1', 'd', 'CLOSED_LOST', '2026-01-03', 400),
          ('tenant_1', 'e', 'LEADS', '2026-01-01', 500), ('tenant_1', 'e', 'PROPOSAL', '2026-01-02', 500), ('tenant_1', 'e', 'LEADS', '2026-01-03', 500), ('tenant_1', 'e', 'PROPOSAL', '2026-01-04', 500),
          ('tenant_2', 'foreign', 'LEADS', '2026-01-01', 600), ('tenant_2', 'foreign', 'PROPOSAL', '2026-01-02', 600);`)
      const actual = await db.query(executableSql, values)
      expect(actual.rows).toEqual([
        { fromStage: 'LEADS', toStage: 'PROPOSAL', enteredCount: 4, convertedCount: 3 },
        { fromStage: 'PROPOSAL', toStage: 'NEGOTIATION', enteredCount: 4, convertedCount: 2 },
        { fromStage: 'NEGOTIATION', toStage: 'CLOSED_WON', enteredCount: 2, convertedCount: 1 },
      ])

      await db.exec(`CREATE TABLE "Deal" ("tenantId" TEXT NOT NULL, "stage" "DealStage" NOT NULL, "closedAt" TIMESTAMPTZ NOT NULL);
        INSERT INTO "Deal" VALUES
          ('tenant_1', 'CLOSED_WON', '${result.winRateComparison.current.startDate}T16:00:00Z'),
          ('tenant_1', 'CLOSED_WON', '${result.winRateComparison.current.startDate}T17:00:00Z'),
          ('tenant_1', 'CLOSED_LOST', '${result.winRateComparison.current.startDate}T18:00:00Z'),
          ('tenant_1', 'CLOSED_WON', '${result.winRateComparison.previous.startDate}T16:00:00Z'),
          ('tenant_1', 'CLOSED_LOST', '${result.winRateComparison.previous.startDate}T17:00:00Z'),
          ('tenant_1', 'CLOSED_WON', '${result.winRateComparison.current.endDateExclusive}T04:00:00Z'),
          ('tenant_2', 'CLOSED_WON', '${result.winRateComparison.current.startDate}T16:00:00Z');`)
      const [periodTemplate, ...periodValues] = raw.mock.calls[1] as [TemplateStringsArray, ...unknown[]]
      const periodSql = periodTemplate.reduce((query, segment, index) => query + segment + (index < periodValues.length ? `$${index + 1}` : ''), '')
      const boundaries = await db.query(`SELECT ($1::date::timestamp AT TIME ZONE $2) AS current_start, ($3::date::timestamp AT TIME ZONE $4) AS current_end`, [result.winRateComparison.current.startDate, 'America/New_York', result.winRateComparison.current.endDateExclusive, 'America/New_York'])
      const localDate = (value: Date) => new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(value)
      expect(localDate(boundaries.rows[0]!.current_start)).toBe(result.winRateComparison.current.startDate)
      expect(localDate(boundaries.rows[0]!.current_end)).toBe(result.winRateComparison.current.endDateExclusive)
      const periodResult = await db.query(periodSql, periodValues)
      expect(periodResult.rows).toEqual([{ currentWonCount: 2, currentLostCount: 1, previousWonCount: 1, previousLostCount: 1 }])

      await db.exec('CREATE TABLE "CrmHistoryCoverage" ("tenantId" TEXT, "startsAt" TIMESTAMPTZ);')
      await db.exec('DELETE FROM "DealStageHistory";')
      const previousAsOf = result.pipeline.openCountComparison.previousAsOfDate
      const endExclusiveDate = new Date(`${previousAsOf}T00:00:00.000Z`)
      endExclusiveDate.setUTCDate(endExclusiveDate.getUTCDate() + 1)
      const timezone = 'America/New_York'
      const [endBoundary] = await db.query<{ cutoff: Date }>(
        `SELECT ($1::date::timestamp AT TIME ZONE $2) AS cutoff`,
        [endExclusiveDate.toISOString().slice(0, 10), timezone],
      ).then(result => result.rows)
      const previousCutoff = endBoundary!.cutoff
      const beforeCutoff = new Date(previousCutoff.getTime() - 60_000)
      await db.query('INSERT INTO "CrmHistoryCoverage" VALUES ($1, $2)', ['tenant_1', new Date(beforeCutoff.getTime() - 86_400_000).toISOString().slice(0, 23).replace('T', ' ')])
      await db.query(`INSERT INTO "DealStageHistory" ("id", "tenantId", "dealId", "toStage", "occurredAt", "value") VALUES
        ('1', 'tenant_1', 'a', 'LEADS', $1, 100), ('2', 'tenant_1', 'b', 'NEGOTIATION', $1, 200),
        ('3', 'tenant_1', 'c', 'CLOSED_WON', $1, 300), ('4', 'tenant_1', 'd', 'LEADS', $2, 400)`, [beforeCutoff, new Date(previousCutoff.getTime() + 60_000)])
      const [openTemplate, ...openValues] = raw.mock.calls[3] as [TemplateStringsArray, ...unknown[]]
      const openQuery = openTemplate.reduce((query, segment, index) => query + segment + (index < openValues.length ? `$${index + 1}` : ''), '')
      const openResult = await db.query(openQuery, openValues)
      expect(Number(openResult.rows[0]?.previousCount)).toBe(2)
      expect(Number(openResult.rows[0]?.previousTotal)).toBe(300)
    } finally {
      await db.close()
    }
  }, 30_000)

  it('returns null conversion when no deals have entered a source stage', async () => {
    const prisma = {
      tenant: { findUnique: async () => ({ currency: 'USD', timezone: 'UTC' }) },
      deal: { groupBy: async () => [], count: async () => 0 },
      $queryRaw: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([
        { currentWonCount: 0n, currentLostCount: 0n, previousWonCount: 0n, previousLostCount: 0n },
      ]).mockResolvedValueOnce([
        { fromStage: 'LEADS', toStage: 'PROPOSAL', enteredCount: 0n, convertedCount: 0n },
        { fromStage: 'PROPOSAL', toStage: 'NEGOTIATION', enteredCount: 0n, convertedCount: 0n },
        { fromStage: 'NEGOTIATION', toStage: 'CLOSED_WON', enteredCount: 0n, convertedCount: 0n },
      ]).mockResolvedValueOnce([{ previousCount: null, previousTotal: null }]),
    } as unknown as PrismaClient
    const result = await getOverview(prisma, 'tenant_1')
    expect(result.stageConversions.every(row => row.rate === null)).toBe(true)
    expect(result.winRateComparison.current.rate).toBe(null)
    expect(result.winRateComparison.previous.rate).toBe(null)
  })
})
