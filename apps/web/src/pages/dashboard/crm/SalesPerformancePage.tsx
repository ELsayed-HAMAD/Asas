import type { CrmSalesPerformance } from '@asas/contracts'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { DataTable } from '@/components/ui/data-table'
import { crmApi } from '@/lib/api/crm.js'
import { formatMoney, formatPercent } from '@/lib/format.js'
import { queryKeys } from '@/lib/queryKeys.js'

const chartConfig = {
  value: { label: 'Closed-won value', color: 'var(--color-chart-positive)' },
} satisfies ChartConfig

type RepRow = {
  ownerName: string | null
  openValue: number
  wonValue: number
  lostValue: number
  winRate: number | null
}

/**
 * Sales performance — `GET /crm/sales-performance`. The monthly closed-won chart and per-rep
 * leaderboard are both server-computed SQL aggregates. This page only renders.
 */
export function SalesPerformancePage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.crm.salesPerformance(),
    queryFn: () => crmApi.getSalesPerformance(),
  })

  const perf: CrmSalesPerformance | undefined = data
  const totalWon = perf?.summary.totalWon.amount ?? 0
  const totalWonCount = perf?.summary.totalWonCount ?? 0
  const totalLostCount = perf?.summary.totalLostCount ?? 0
  const overallWinRate = perf?.summary.overallWinRate != null
    ? Math.round(perf.summary.overallWinRate * 100)
    : null

  const repRows: RepRow[] = useMemo(() =>
    (perf?.byRep ?? []).map(r => ({
      ownerName: r.ownerName,
      openValue: r.openValue.amount,
      wonValue: r.wonValue.amount,
      lostValue: r.lostValue.amount,
      winRate: r.winRate != null ? Math.round(r.winRate * 100) : null,
    })),
  [perf])

  const columns: ColumnDef<RepRow>[] = useMemo(() => [
    {
      accessorKey: 'ownerName',
      header: 'Rep',
      cell: ({ row }) => (
        <span className="font-medium text-[var(--color-heading)]">
          {row.original.ownerName ?? 'Unassigned'}
        </span>
      ),
    },
    {
      accessorKey: 'openValue',
      header: 'Open pipeline',
      cell: ({ row }) => (
        <span className="tabular-nums text-[var(--color-body)]">
          {formatMoney(row.original.openValue, { compact: true })}
        </span>
      ),
    },
    {
      accessorKey: 'wonValue',
      header: 'Won',
      cell: ({ row }) => (
        <span className="font-medium tabular-nums text-[var(--color-heading)]">
          {formatMoney(row.original.wonValue, { compact: true })}
        </span>
      ),
    },
    {
      accessorKey: 'lostValue',
      header: 'Lost',
      cell: ({ row }) => (
        <span className="tabular-nums text-[var(--color-muted)]">
          {formatMoney(row.original.lostValue, { compact: true })}
        </span>
      ),
    },
    {
      accessorKey: 'winRate',
      header: 'Win rate',
      cell: ({ row }) => (
        row.original.winRate != null ? (
          <Badge variant={row.original.winRate >= 5000 ? 'success' : 'warning'}>
            {formatPercent(row.original.winRate)}
          </Badge>
        ) : (
          <span className="text-[var(--color-muted)]">—</span>
        )
      ),
    },
  ], [])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-heading)]">Sales Performance</h1>
        <p className="text-sm text-[var(--color-muted)]">Closed-won trends and rep leaderboard</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total won</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(totalWon, { compact: true })}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-[var(--color-muted)]">{totalWonCount} deals closed</p></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Overall win rate</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {overallWinRate != null ? formatPercent(overallWinRate) : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-[var(--color-muted)]">{totalLostCount} deals lost</p></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Active reps</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{perf?.byRep.length ?? 0}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-[var(--color-muted)]">Reps with deals</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Closed-won by month</CardTitle>
          <CardDescription>Real per-month aggregate over CLOSED_WON deals</CardDescription>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p className="text-sm text-[var(--color-danger)]">Could not load performance data.</p>
          ) : isLoading ? (
            <p className="text-sm text-[var(--color-muted)]">Loading…</p>
          ) : !perf || perf.monthlyClosedWon.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">No closed-won deals yet.</p>
          ) : (
            <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
              <BarChart data={perf.monthlyClosedWon} accessibilityLayer>
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

      <Card>
        <CardHeader>
          <CardTitle>Rep leaderboard</CardTitle>
          <CardDescription>Per-owner breakdown across open, won, and lost deals</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-[var(--color-muted)]">Loading…</p>
          ) : !perf || perf.byRep.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">No deals yet.</p>
          ) : (
            <DataTable columns={columns} data={repRows} pageSize={25} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
