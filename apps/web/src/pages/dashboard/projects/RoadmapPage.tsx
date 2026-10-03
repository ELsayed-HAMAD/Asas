import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { projectsApi } from '@/lib/api/projects.js'
import { queryKeys } from '@/lib/queryKeys.js'
import { LegacyPageFrame } from '@/components/legacy/LegacyPageFrame.js'

/**
 * Roadmap Gantt — a pure CSS-grid render of `GET /projects/roadmap`. No gantt-task-react:
 * every row is a CSS grid track, each bar is positioned by the server-stored `startDate` /
 * `endDate` relative to the tenant's real date window (min start → max end across the tasks
 * present). The window math is display layout, not business data; every date shown is a
 * stored field.
 */
export function RoadmapPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.projects.roadmap(),
    queryFn: () => projectsApi.getRoadmap(),
  })

  const phases = useMemo(() => (data?.phases ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder), [data])

  const { minTime, spanDays } = useMemo(() => {
    const starts: number[] = []
    const ends: number[] = []
    for (const phase of phases) {
      for (const task of phase.tasks) {
        if (task.startDate) starts.push(Date.parse(`${task.startDate}T00:00:00Z`))
        if (task.endDate) ends.push(Date.parse(`${task.endDate}T00:00:00Z`) + 86_400_000)
      }
    }
    if (starts.length === 0 || ends.length === 0) return { minTime: 0, spanDays: 0 }
    const min = Math.min(...starts)
    const max = Math.max(...ends)
    return { minTime: min, spanDays: Math.max(1, Math.ceil((max - min) / 86_400_000)) }
  }, [phases])

  const monthMarkers = useMemo(() => {
    if (spanDays <= 0) return []
    const markers: { left: number; label: string }[] = []
    const cursor = new Date(minTime)
    cursor.setUTCDate(1)
    // If the window starts mid-month, the month line belongs at the first of that month.
    if (cursor.getTime() > minTime) cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    while (cursor.getTime() < minTime + spanDays * 86_400_000) {
      const left = (cursor.getTime() - minTime) / (spanDays * 86_400_000) * 100
      if (left >= 0 && left <= 100) {
        markers.push({
          left,
          label: cursor.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
        })
      }
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }
    return markers
  }, [minTime, spanDays])

  return (
    <LegacyPageFrame title="Roadmap" subtitle="Phases, milestones, and delivery timelines.">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-heading)]">Roadmap</h1>
        <p className="text-sm text-[var(--color-muted)]">Phases and dated tasks from the project roadmap.</p>
      </div>

      {isError ? (
        <p className="text-sm text-[var(--color-danger)]">Could not load the roadmap.</p>
      ) : isLoading || !data ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : phases.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-[var(--color-muted)]">No roadmap phases yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
            <CardDescription>
              {spanDays > 0
                ? `Window: ${new Date(minTime).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' })} and ${spanDays} days out.`
                : 'Tasks without dates are listed below the timeline.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {spanDays > 0 && (
              <div className="relative mb-2 ml-44 h-6 border-b border-[var(--color-border-default)]">
                {monthMarkers.map(marker => (
                  <span
                    key={marker.label}
                    className="absolute -translate-x-1/2 text-xs text-[var(--color-muted)]"
                    style={{ left: `${marker.left}%` }}
                  >
                    {marker.label}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-6">
              {phases.map(phase => (
                <section key={phase.id}>
                  <h2 className="mb-2 text-sm font-semibold text-[var(--color-heading)]">{phase.title}</h2>
                  <div className="flex flex-col gap-2">
                    {phase.tasks.map(task => {
                      const start = task.startDate ? Date.parse(`${task.startDate}T00:00:00Z`) : null
                      const end = task.endDate ? Date.parse(`${task.endDate}T00:00:00Z`) + 86_400_000 : null
                      const hasBar = start != null && end != null && spanDays > 0
                      const left = hasBar ? Math.max(0, ((start as number) - minTime) / (spanDays * 86_400_000) * 100) : 0
                      const width = hasBar
                        ? Math.max(2, (Math.min((end as number), minTime + spanDays * 86_400_000) - (start as number)) / (spanDays * 86_400_000) * 100)
                        : 0

                      return (
                        <div key={task.id} className="grid grid-cols-[11rem_minmax(0,1fr)] items-center gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm text-[var(--color-body)]">{task.title}</p>
                            <p className="text-xs text-[var(--color-muted)]">
                              {task.taskCode ?? '—'}
                              {task.statusLabel ? ` · ${task.statusLabel}` : ''}
                            </p>
                          </div>
                          <div className="relative h-6 rounded-[var(--radius-xs)] bg-[var(--color-surface-muted)]">
                            {hasBar ? (
                              <div
                                className="absolute top-1 bottom-1 overflow-hidden rounded-[var(--radius-xs)] bg-[var(--color-chart-secondary)]"
                                style={{
                                  left: `${left}%`,
                                  width: `${width}%`,
                                  ...(task.barColor ? { backgroundColor: task.barColor } : {}),
                                }}
                              >
                                <div
                                  className="h-full rounded-[var(--radius-xs)] bg-[var(--color-primary)]/30"
                                  style={{ width: `${Math.min(task.progressPct, 100)}%` }}
                                />
                              </div>
                            ) : (
                              <span className="absolute inset-0 flex items-center justify-center text-xs text-[var(--color-faint)]">
                                No dates
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {phase.tasks.length === 0 && (
                      <p className="ml-44 text-xs text-[var(--color-muted)]">No tasks in this phase.</p>
                    )}
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-6 flex items-center gap-4 text-xs text-[var(--color-muted)]">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded-[2px] bg-[var(--color-chart-secondary)]" /> Planned
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded-[2px] bg-[var(--color-chart-secondary)] shadow-[inset_3px_0_0_var(--color-primary)]" />
                Progress (shaded)
              </span>
              <span className="ml-auto">Bars clip at the timeline window edge</span>
            </div>
          </CardContent>
        </Card>
      )}
    </LegacyPageFrame>
  )
}
