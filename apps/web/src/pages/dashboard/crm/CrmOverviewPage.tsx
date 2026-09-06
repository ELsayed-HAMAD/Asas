import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { crmApi } from '@/lib/api/crm.js'
import { formatMoney, formatPercent } from '@/lib/format.js'
import { queryKeys } from '@/lib/queryKeys.js'

/**
 * Ports the legacy `CRMOverview` onto the real `GET /crm/overview` endpoint.
 *
 * The funnel bars are sized by the server-computed `share` — each stage's value as a fraction
 * of the largest stage's value, zero-filled for all five stages. That is the one number here
 * that encodes bar width, and it is computed in SQL (a `groupBy` over `Deal.stage`), never a
 * hardcoded percentage or a client-side division. Empty tenant: every bar renders at 0% and
 * every KPI at its real zero.
 */
export function CrmOverviewPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.crm.overview(),
    queryFn: () => crmApi.getOverview(),
  })

  return (
    <div className="flex flex-col gap-6 p-[var(--spacing-page)]">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-heading)]">Sales pipeline</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Deal counts and values aggregated over the whole tenant in SQL.
        </p>
      </div>

      {isError ? (
        <p className="text-sm text-[var(--color-danger)]">Could not load the pipeline overview.</p>
      ) : isLoading || !data ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <CardDescription>Open pipeline</CardDescription>
                <CardTitle className="text-3xl">
                  {formatMoney(data.pipeline.openTotal, { compact: true })}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Open deals</CardDescription>
                <CardTitle className="text-3xl">{data.pipeline.openCount}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Closed won</CardDescription>
                <CardTitle className="text-3xl">
                  {formatMoney(data.pipeline.wonTotal, { compact: true })}
                  <span className="ml-2 text-base font-normal text-[var(--color-muted)]">
                    ×{data.pipeline.wonCount}
                  </span>
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Win rate</CardDescription>
                <CardTitle className="text-3xl">{formatPercent(data.winRate)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Pipeline by stage</CardTitle>
              <CardDescription>
                Bar length is each stage's share of the largest stage's value, computed
                server-side.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {data.funnel.map(stage => (
                <div key={stage.stage} className="flex items-center gap-4">
                  <span className="w-32 shrink-0 text-sm font-medium text-[var(--color-body)]">
                    {stage.stage.replaceAll('_', ' ')}
                  </span>
                  <div className="h-5 flex-1 overflow-hidden rounded-[var(--radius-xs)] bg-[var(--color-surface-muted)]">
                    <div
                      className="h-full rounded-[var(--radius-xs)] bg-[var(--color-chart-secondary)]"
                      style={{ width: `${((stage.share ?? 0) * 100).toFixed(1)}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-sm tabular-nums text-[var(--color-muted)]">
                    {stage.count}
                  </span>
                  <span className="w-28 shrink-0 text-right text-sm font-medium tabular-nums text-[var(--color-heading)]">
                    {formatMoney(stage.value, { compact: true })}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
