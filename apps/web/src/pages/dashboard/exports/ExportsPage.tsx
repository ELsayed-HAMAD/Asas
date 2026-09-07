import type { ExportJob, ExportJobKind } from '@asas/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Download, FileSpreadsheet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { Toaster, toast } from '@/components/ui/toast'
import { ApiError } from '@/lib/api/http.js'
import { exportsApi } from '@/lib/api/exports.js'
import { formatDate } from '@/lib/format.js'
import { downloadBlob } from '@/lib/utils'
import { queryKeys } from '@/lib/queryKeys.js'
import { useMyRole } from '@/lib/useMyRole.js'

/**
 * The bulk-export surface — the two job-based Excel exports (the employee directory and the
 * general ledger) plus a history of every job with its live status.
 *
 * The round trip is always two steps (POST a job, then download the file), which is why a
 * button does *not* open a save dialog immediately: it submits the job, and once the row is
 * DONE the matching history row's Download button becomes available. In the default inline
 * queue mode the POST already returns a DONE row, so the download is available on the very next
 * render; in `QUEUE_URL` mode the row is QUEUED and this page polls it to DONE.
 *
 * The employee directory is gated on `employee.write` (HR data); a MEMBER's copy is
 * salary-redacted server-side, so the button is hidden rather than producing a redacted file.
 * The ledger export needs no such gate beyond `employee.write` for symmetry, and its totals row
 * is computed server-side from the full row set (credits negative, as stored).
 */

const KIND_LABEL: Record<ExportJobKind, string> = {
  employees: 'Employee directory',
  ledger: 'General ledger',
}

const STATUS_META: Record<ExportJob['status'], { label: string; variant: 'secondary' | 'info' | 'success' | 'danger' }> = {
  QUEUED: { label: 'Queued', variant: 'secondary' },
  RUNNING: { label: 'Running', variant: 'info' },
  DONE: { label: 'Done', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

export function ExportsPage() {
  const queryClient = useQueryClient()
  const role = useMyRole()
  const canExport = role === 'ADMIN' || role === 'OWNER'
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const jobsKey = queryKeys.exports.jobs.lists()
  const { data, isLoading, isError } = useQuery({
    queryKey: jobsKey,
    queryFn: () => exportsApi.listJobs({ limit: 50 }),
  })

  const jobs = useMemo(() => data?.items ?? [], [data])

  // While any job is still in flight, poll the list so the row (and its Download button) turns
  // DONE without a manual refresh. Stops as soon as nothing is QUEUED/RUNNING.
  const hasInFlight = jobs.some(job => job.status === 'QUEUED' || job.status === 'RUNNING')
  useEffect(() => {
    if (!hasInFlight) return
    const timer = setInterval(() => void queryClient.invalidateQueries({ queryKey: jobsKey }), 1500)
    return () => clearInterval(timer)
  }, [hasInFlight, jobsKey, queryClient])

  const createJob = useMutation({
    mutationFn: (kind: ExportJobKind) => exportsApi.createJob({ kind }),
    onSuccess: job =>
      toast({
        title: job.status === 'DONE' ? 'Export ready' : 'Export queued',
        description: `${KIND_LABEL[job.kind]} — ${job.status === 'DONE' ? 'download it below' : 'it will appear when done'}.`,
      }),
    onError: error => toast({ variant: 'error', title: 'Could not start the export', description: errorMessage(error, 'Try again.') }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: jobsKey }),
  })

  async function downloadJob(job: ExportJob) {
    setDownloadingId(job.id)
    try {
      const blob = await exportsApi.download(job.id)
      downloadBlob(blob, job.filename)
      toast({ title: 'Download started', description: job.filename })
    } catch (error) {
      toast({ variant: 'error', title: 'Could not download the export', description: errorMessage(error, 'Is the job finished yet?') })
    } finally {
      setDownloadingId(null)
    }
  }

  const columns = useMemo<ColumnDef<ExportJob>[]>(
    () => [
      {
        id: 'kind',
        header: 'Export',
        cell: ({ row }) => (
          <span className="flex items-center gap-2 text-[var(--color-body)]">
            <FileSpreadsheet className="h-4 w-4 text-[var(--color-muted)]" />
            {KIND_LABEL[row.original.kind]}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const meta = STATUS_META[row.original.status]
          return (
            <span className="flex items-center gap-2">
              <Badge variant={meta.variant}>{meta.label}</Badge>
              {row.original.status !== 'DONE' && (
                <span className="text-xs tabular-nums text-[var(--color-muted)]">{row.original.progressPct}%</span>
              )}
            </span>
          )
        },
      },
      {
        accessorKey: 'filename',
        header: 'File',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-[var(--color-muted)]">{row.original.filename}</span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        cell: ({ row }) => (
          <span className="text-[var(--color-muted)]">{formatDate(row.original.createdAt)}</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-end">
            {row.original.status === 'DONE' ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={downloadingId === row.original.id}
                onClick={() => void downloadJob(row.original)}
              >
                <Download /> {downloadingId === row.original.id ? '…' : 'Download'}
              </Button>
            ) : row.original.status === 'FAILED' ? (
              <span className="pr-2 text-xs text-[var(--color-muted)]">—</span>
            ) : (
              <span className="pr-2 text-xs text-[var(--color-muted)]">Working…</span>
            )}
          </div>
        ),
      },
    ],
    [downloadingId],
  )

  return (
    <div className="flex flex-col gap-6 p-[var(--spacing-page)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-heading)]">Exports</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Bulk exports render as Excel files, run as jobs, and are downloadable once done.
          </p>
        </div>
        {canExport && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={createJob.isPending}
              onClick={() => createJob.mutate('employees')}
            >
              <FileSpreadsheet /> Employee directory
            </Button>
            <Button disabled={createJob.isPending} onClick={() => createJob.mutate('ledger')}>
              <FileSpreadsheet /> General ledger
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Export jobs</CardTitle>
          <CardDescription>
            Newest first. A job moves QUEUED → RUNNING → DONE; download is enabled once it is DONE.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {isError ? (
            <p className="text-sm text-[var(--color-danger)]">Could not load export jobs.</p>
          ) : isLoading ? (
            <p className="text-sm text-[var(--color-muted)]">Loading…</p>
          ) : (
            <DataTable columns={columns} data={jobs} pageSize={10} />
          )}
        </CardContent>
      </Card>

      <Toaster />
    </div>
  )
}
