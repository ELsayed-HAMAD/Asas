import type { CrmForecast } from '@asas/contracts'
import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { crmApi } from '@/lib/api/crm.js'
import { formatMoney, formatPercent } from '@/lib/format.js'
import { queryKeys } from '@/lib/queryKeys.js'

const chartConfig = {
  value: { label: 'Pipeline value', color: 'var(--color-chart-primary)' },
} satisfies ChartConfig

/**
 * Revenue forecast — `GET /crm/forecast`. Two real sources: `ForecastSnapshot` rows drive the
 * per-rep table, `SalesQuota` rows drive the quota table, and `monthlyPipeline` is the
 * open-deals-by-close-month chart. All numbers are server-computed; this page only renders.
 */
export function RevenueForecastPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.crm.forecast(),
    queryFn: () => crmApi.getForecast(),
  })

  const forecast: CrmForecast | undefined = data
  const totalPipeline = forecast?.summary.totalPipeline.amount ?? 0
  const totalQuota = forecast?.summary.totalQuota.amount ?? 0

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-heading)]">Revenue Forecast</h1>
        <p className="text-sm text-[var(--color-muted)]">Pipeline by close month, rep forecasts, and quotas</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total open pipeline</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(totalPipeline, { compact: true })}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-[var(--color-muted)]">
              {forecast?.monthlyPipeline.length ?? 0} months with open deals
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total quota</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(totalQuota, { compact: true })}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-[var(--color-muted)]">{forecast?.quotas.length ?? 0} rep quotas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Quota attainment</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {forecast?.summary.quotaAttainmentPct != null ? formatPercent(forecast.summary.quotaAttainmentPct * 100) : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-[var(--color-muted)]">Pipeline vs. quota</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open pipeline by close month</CardTitle>
          <CardDescription>Open deals grouped by their stored close date</CardDescription>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p className="text-sm text-[var(--color-danger)]">Could not load forecast.</p>
          ) : isLoading ? (
            <p className="text-sm text-[var(--color-muted)]">Loading…</p>
          ) : !forecast || forecast.monthlyPipeline.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">No open deals with close dates yet.</p>
          ) : (
            <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
              <BarChart data={forecast.monthlyPipeline} accessibilityLayer>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--color-muted)" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="var(--color-muted)"
                  tickFormatter={(v: number) => formatMoney(v, { compact: true })}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rep forecasts</CardTitle>
            <CardDescription>Latest forecast snapshots per rep</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-[var(--color-muted)]">Loading…</p>
            ) : !forecast || forecast.forecastByRep.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">No forecast snapshots yet.</p>
            ) : (
              <div className="space-y-3">
                {forecast.forecastByRep.map(rep => (
                  <div
                    key={rep.id}
                    className="flex items-center justify-between rounded-[var(--radius-button)] border border-[var(--color-border-default)] px-3 py-2"
                  >
                    <div>
                      <span className="text-sm font-medium text-[var(--color-heading)]">{rep.repName}</span>
                      <span className="ml-2 text-xs text-[var(--color-muted)]">{rep.period}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs tabular-nums">
                      <span className="text-[var(--color-muted)]">
                        Closed: <span className="font-medium text-[var(--color-heading)]">{formatMoney(rep.closed, { compact: true })}</span>
                      </span>
                      <span className="text-[var(--color-muted)]">
                        Commit: <span className="font-medium text-[var(--color-heading)]">{formatMoney(rep.commit, { compact: true })}</span>
                      </span>
                      <span className="text-[var(--color-muted)]">
                        Best: <span className="font-medium text-[var(--color-heading)]">{formatMoney(rep.bestCase, { compact: true })}</span>
                      </span>
                      {rep.quotaPct != null && (
                        <span className="text-[var(--color-muted)]">
                          Quota: <span className="font-medium text-[var(--color-heading)]">{formatPercent(rep.quotaPct)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sales quotas</CardTitle>
            <CardDescription>Per-rep quota targets</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-[var(--color-muted)]">Loading…</p>
            ) : !forecast || forecast.quotas.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">No quotas set yet.</p>
            ) : (
              <div className="space-y-3">
                {forecast.quotas.map(q => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between rounded-[var(--radius-button)] border border-[var(--color-border-default)] px-3 py-2"
                  >
                    <div>
                      <span className="text-sm font-medium text-[var(--color-heading)]">{q.repName}</span>
                      <span className="ml-2 text-xs text-[var(--color-muted)]">{q.period}</span>
                    </div>
                    <span className="text-sm font-medium tabular-nums text-[var(--color-heading)]">
                      {formatMoney(q.quota, { compact: true })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
