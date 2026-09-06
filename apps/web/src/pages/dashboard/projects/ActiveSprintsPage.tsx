import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { projectsApi } from '@/lib/api/projects.js'
import { formatPercent } from '@/lib/format.js'
import { queryKeys } from '@/lib/queryKeys.js'

/**
 * Active sprints + burndown for the selected sprint. The sprint list and the burndown series
 * (`GET /projects/sprints/:id/burndown`) are both SQL-derived on the API side — total scope,
 * per-day remaining, and the ideal line all come back from the server; this page only renders.
 */
const burndownChartConfig = {
  remaining: { label: 'Remaining', color: 'var(--color-chart-secondary)' },
  ideal: { label: 'Ideal', color: 'var(--color-chart-grid)' },
} satisfies ChartConfig

export function ActiveSprintsPage() {
  const sprints = useQuery({
    queryKey: queryKeys.projects.sprints.lists(),
    queryFn: () => projectsApi.listSprints(),
  })

  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null)

  const sprintItems = useMemo(() => sprints.data?.items ?? [], [sprints])
  const selectedId = selectedSprintId ?? sprintItems[0]?.id ?? null

  const burndown = useQuery({
    queryKey: queryKeys.projects.burndown(selectedId ?? 'none'),
    queryFn: () => projectsApi.getBurndown(selectedId as string),
    enabled: selectedId != null,
  })

  return (
    <div className="flex flex-col gap-6 p-[var(--spacing-page)]">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-heading)]">Active sprints</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Sprint scope and burndown are computed from issue status changes in SQL.
        </p>
      </div>

      {sprints.isError ? (
        <p className="text-sm text-[var(--color-danger)]">Could not load sprints.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sprintItems.map(sprint => (
            <Card
              key={sprint.id}
              className={selectedId === sprint.id ? 'ring-2 ring-[var(--color-accent)]' : undefined}
            >
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{sprint.name}</CardTitle>
                  <CardDescription>
                    {sprint.issueCounts.done}/{sprint.issueCounts.total} issues done
                  </CardDescription>
                </div>
                <Badge variant={sprint.completionPct >= 75 ? 'success' : sprint.completionPct >= 40 ? 'info' : 'secondary'}>
                  {formatPercent(sprint.completionPct)}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-chart-secondary)]"
                      style={{ width: `${sprint.completionPct}%` }}
                    />
                  </div>
                  <Button
                    variant={selectedId === sprint.id ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedSprintId(sprint.id)}
                  >
                    {selectedId === sprint.id ? 'Showing' : 'Burndown'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {sprints.data && sprintItems.length === 0 && (
            <p className="text-sm text-[var(--color-muted)]">No sprints yet.</p>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Burndown — {burndown.data?.sprintName ?? '…'}</CardTitle>
          <CardDescription>
            {burndown.data
              ? `${burndown.data.completed} of ${burndown.data.totalScope} scope completed. Dashed line is the ideal linear burn-down.`
              : 'Issues still open per day, against the ideal line.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {burndown.isError ? (
            <p className="text-sm text-[var(--color-danger)]">Could not load the burndown.</p>
          ) : burndown.isLoading || !burndown.data ? (
            <p className="text-sm text-[var(--color-muted)]">Loading…</p>
          ) : burndown.data.points.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              No burndown history yet — it starts accumulating from the first day of the sprint.
            </p>
          ) : (
            <ChartContainer config={burndownChartConfig} className="h-80 w-full">
              <LineChart data={burndown.data.points} accessibilityLayer>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                    tickFormatter={value => String(value).slice(5)}
                  />
                  <YAxis tick={{ fill: 'var(--color-muted)', fontSize: 12 }} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="remaining"
                    stroke="var(--color-chart-secondary)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="ideal"
                    stroke="var(--color-chart-grid)"
                    strokeWidth={2}
                    strokeDasharray="6 6"
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
