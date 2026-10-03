import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { crmApi } from '@/lib/api/crm.js'
import { formatMoney, formatPercent } from '@/lib/format.js'
import { queryKeys } from '@/lib/queryKeys.js'
import { LegacyMetricCard, LegacyPageFrame } from '@/components/legacy/LegacyPageFrame.js'

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
    <LegacyPageFrame title="Sales pipeline" subtitle="Deal counts and values across your workspace.">

      {isError ? (
        <p className="text-sm text-[var(--color-danger)]">Could not load the pipeline overview.</p>
      ) : isLoading || !data ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <LegacyMetricCard label="Total pipeline" value={formatMoney(data.pipeline.openTotal, { compact: true })} detail={`${data.pipeline.openCount} open`} tone="info" />
            <LegacyMetricCard label="Open deals" value={String(data.pipeline.openCount)} detail="Active" />
            <LegacyMetricCard label="Closed won" value={formatMoney(data.pipeline.wonTotal, { compact: true })} detail={`×${data.pipeline.wonCount}`} tone="success" />
            <LegacyMetricCard label="Win rate" value={formatPercent(data.winRate)} detail="Live" tone="success" />
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
    </LegacyPageFrame>
  )
}
