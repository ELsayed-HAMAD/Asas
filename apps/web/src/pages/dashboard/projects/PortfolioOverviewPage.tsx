import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { projectsApi } from '@/lib/api/projects.js'
import { formatMoney, formatPercent } from '@/lib/format.js'
import { queryKeys } from '@/lib/queryKeys.js'

const STATUS_VARIANTS = {
  PLANNING: 'secondary',
  ON_TRACK: 'success',
  DELAYED: 'warning',
  AT_RISK: 'danger',
  COMPLETED: 'info',
} as const

const STATUS_LABELS = {
  PLANNING: 'Planning',
  ON_TRACK: 'On track',
  DELAYED: 'Delayed',
  AT_RISK: 'At risk',
  COMPLETED: 'Completed',
} as const

/**
 * Portfolio budget utilization — `GET /projects/portfolio`. The per-project `spent`,
 * `budget`, and `utilizationPct` are all SQL aggregates from the service; the bar width here
 * is the server's `utilizationPct` (capped at 100 for display, with an overrun marker), not a
 * ratio the client divided out.
 */
export function PortfolioOverviewPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.projects.portfolio.all(),
    queryFn: () => projectsApi.getPortfolioUtilization(),
  })

  return (
    <div className="flex flex-col gap-6 p-[var(--spacing-page)]">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-heading)]">Portfolio</h1>
        <p className="text-sm text-[var(--color-muted)]">Budget utilization per project, computed in SQL.</p>
      </div>

      {isError ? (
        <p className="text-sm text-[var(--color-danger)]">Could not load the portfolio.</p>
      ) : isLoading || !data ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardDescription>Total spent</CardDescription>
                <CardTitle className="text-3xl">{formatMoney(data.summary.totalSpent, { compact: true })}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Total budget</CardDescription>
                <CardTitle className="text-3xl">
                  {data.summary.totalBudget ? formatMoney(data.summary.totalBudget, { compact: true }) : '—'}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Utilization</CardDescription>
                <CardTitle className="text-3xl">{formatPercent(data.summary.utilizationPct)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Utilization by project</CardTitle>
              <CardDescription>
                Bars are the server-computed `spent / budget` per project; over-100% bars are
                flagged rather than silently clipped.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {data.items.map(row => {
                const pct = row.utilizationPct ?? 0
                const over = pct > 100
                return (
                  <div key={row.projectId} className="flex items-center gap-4">
                    <span className="w-56 shrink-0 truncate text-sm font-medium text-[var(--color-body)]">
                      {row.name}
                    </span>
                    <Badge variant={STATUS_VARIANTS[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                    <div className="h-4 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                      <div
                        className={
                          over
                            ? 'h-full rounded-full bg-[var(--color-chart-negative)]'
                            : 'h-full rounded-full bg-[var(--color-chart-secondary)]'
                        }
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right text-sm font-medium tabular-nums text-[var(--color-heading)]">
                      {formatPercent(pct)}
                    </span>
                    <span className="w-44 shrink-0 text-right text-xs tabular-nums text-[var(--color-muted)]">
                      {formatMoney(row.spent, { compact: true })}
                      {row.budget ? ` / ${formatMoney(row.budget, { compact: true })}` : ' / no budget'}
                    </span>
                  </div>
                )
              })}
              {data.items.length === 0 && (
                <p className="text-sm text-[var(--color-muted)]">
                  No projects with budget data yet.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
