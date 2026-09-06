import type { Candidate, CandidateStage } from '@asas/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Download, Eye, FileText, Plus, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DataTable } from '@/components/ui/data-table'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Toaster, toast } from '@/components/ui/toast'
import { ApiError } from '@/lib/api/http.js'
import { hrApi } from '@/lib/api/hr.js'
import { formatDate } from '@/lib/format.js'
import { downloadBlob } from '@/lib/utils'
import { queryKeys } from '@/lib/queryKeys.js'
import { useMyRole } from '@/lib/useMyRole.js'

/**
 * The recruitment pipeline — a candidate list with a per-row stage control (the kanban move,
 * backed by `POST /hr/candidates/:id/stage`, which records a `CandidateActivity` row), an
 * "add candidate" form, and the CV surface.
 *
 * The CV flow is a server-side signed upload, not a third-party presigned URL: the API mints a
 * short-lived PUT grant (`resume-upload-url`), the browser PUTs the PDF straight to the API, and
 * the file is stored under `storage/resumes/<tenantId>/`. Previewing does **not** bundle pdf.js —
 * the PDF is fetched to a Blob and shown in an in-app dialog over a blob URL (same-origin, so the
 * browser's native PDF viewer handles it), which keeps the app within the CI 500 kB/chunk budget.
 * A `null` `resumeUrl` means no CV yet, so the Preview action only appears once one exists.
 */

const STAGE_OPTIONS: { value: CandidateStage; label: string }[] = [
  { value: 'APPLIED', label: 'Applied' },
  { value: 'SCREENING', label: 'Screening' },
  { value: 'TECH_INTERVIEW', label: 'Tech interview' },
  { value: 'FINAL_INTERVIEW', label: 'Final interview' },
  { value: 'OFFER_SENT', label: 'Offer sent' },
  { value: 'HIRED', label: 'Hired' },
  { value: 'REJECTED', label: 'Rejected' },
]

const STAGE_BADGE: Record<CandidateStage, 'secondary' | 'info' | 'warning' | 'success' | 'danger'> = {
  APPLIED: 'secondary',
  SCREENING: 'info',
  TECH_INTERVIEW: 'warning',
  FINAL_INTERVIEW: 'warning',
  OFFER_SENT: 'success',
  HIRED: 'success',
  REJECTED: 'danger',
}

function stageLabel(stage: CandidateStage): string {
  return STAGE_OPTIONS.find(option => option.value === stage)?.label ?? stage
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

export function CandidatePage() {
  const queryClient = useQueryClient()
  const role = useMyRole()
  const canWrite = role === 'ADMIN' || role === 'OWNER'

  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<CandidateStage | ''>('')
  const [createOpen, setCreateOpen] = useState(false)
  const [preview, setPreview] = useState<{ candidate: Candidate; url: string } | null>(null)

  // One shared file chooser; the row that asked for an upload is stashed in a ref, since the
  // chooser's onChange fires asynchronously after the per-row button click.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadTargetRef = useRef<Candidate | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.hr.candidates.list({
      search: search || undefined,
      stage: stageFilter || undefined,
    }),
    queryFn: () =>
      hrApi.listCandidates({ search: search || undefined, stage: stageFilter || undefined, limit: 100 }),
  })

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: queryKeys.hr.candidates.all() })

  const createCandidate = useMutation({
    mutationFn: (input: Parameters<typeof hrApi.createCandidate>[0]) => hrApi.createCandidate(input),
    onSuccess: () => {
      toast({ title: 'Candidate added' })
      setCreateOpen(false)
      invalidate()
    },
    onError: error =>
      toast({ variant: 'error', title: 'Could not add the candidate', description: errorMessage(error, 'Try again.') }),
  })

  const updateStage = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: CandidateStage }) => hrApi.updateCandidateStage(id, { stage }),
    onSuccess: () => {
      toast({ title: 'Stage updated' })
      invalidate()
    },
    onError: error =>
      toast({ variant: 'error', title: 'Could not update the stage', description: errorMessage(error, 'Try again.') }),
  })

  const triggerUpload = useCallback((candidate: Candidate) => {
    uploadTargetRef.current = candidate
    fileInputRef.current?.click()
  }, [])

  const openPreview = useCallback(async (candidate: Candidate) => {
    try {
      const blob = await hrApi.downloadResumeBytes(candidate.id)
      setPreview({ candidate, url: URL.createObjectURL(blob) })
    } catch (error) {
      toast({ variant: 'error', title: 'Could not open the CV', description: errorMessage(error, 'Try again.') })
    }
  }, [])

  async function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const target = uploadTargetRef.current
    uploadTargetRef.current = null
    event.target.value = ''
    if (!file || !target) return
    try {
      const grant = await hrApi.getResumeUploadUrl(target.id)
      if (file.size > grant.maxBytes) {
        throw new Error(`The CV must be under ${Math.round(grant.maxBytes / 1024 / 1024)} MB`)
      }
      await hrApi.uploadResume(target.id, grant.uploadUrl, file)
      toast({ title: 'CV uploaded', description: target.name })
      invalidate()
    } catch (error) {
      toast({ variant: 'error', title: 'Could not upload the CV', description: errorMessage(error, 'Try again.') })
    }
  }

  const columns = useMemo<ColumnDef<Candidate>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Candidate',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-[var(--color-heading)]">{row.original.name}</p>
            <p className="text-xs text-[var(--color-muted)]">{row.original.email ?? row.original.source ?? '—'}</p>
          </div>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }) => <span className="text-[var(--color-body)]">{row.original.role}</span>,
      },
      {
        id: 'stage',
        header: 'Stage',
        cell: ({ row }) =>
          canWrite ? (
            <Select
              value={row.original.stage}
              onValueChange={value =>
                updateStage.mutate({ id: row.original.id, stage: value as CandidateStage })
              }
            >
              <SelectTrigger className="h-8 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant={STAGE_BADGE[row.original.stage]}>{stageLabel(row.original.stage)}</Badge>
          ),
      },
      {
        accessorKey: 'location',
        header: 'Location',
        cell: ({ row }) => row.original.location ?? '—',
      },
      {
        accessorKey: 'appliedAt',
        header: 'Applied',
        cell: ({ row }) => (
          <span className="text-[var(--color-muted)]">{formatDate(row.original.appliedAt)}</span>
        ),
      },
      {
        id: 'cv',
        header: 'CV',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            {canWrite && (
              <Button variant="ghost" size="icon" title="Upload CV" onClick={() => triggerUpload(row.original)}>
                <Upload />
              </Button>
            )}
            {row.original.resumeUrl ? (
              <Button
                variant="ghost"
                size="icon"
                title="Preview CV"
                onClick={() => void openPreview(row.original)}
              >
                <Eye />
              </Button>
            ) : (
              <span className="pr-2 text-xs text-[var(--color-muted)]">No CV</span>
            )}
          </div>
        ),
      },
    ],
    [canWrite, updateStage, triggerUpload, openPreview],
  )

  return (
    <div className="flex flex-col gap-6 p-[var(--spacing-page)]">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={event => void onFileChosen(event)}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-heading)]">Candidates</h1>
          <p className="text-sm text-[var(--color-muted)]">
            The recruitment pipeline. Moving a candidate records the change in their history.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search candidates…"
            className="w-56"
          />
          <Select
            value={stageFilter || 'all'}
            onValueChange={value => setStageFilter(value === 'all' ? '' : (value as CandidateStage))}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {STAGE_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canWrite && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Add candidate
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isError ? (
            <p className="text-sm text-[var(--color-danger)]">Could not load candidates.</p>
          ) : isLoading ? (
            <p className="text-sm text-[var(--color-muted)]">Loading…</p>
          ) : (
            <DataTable columns={columns} data={data?.items ?? []} pageSize={25} />
          )}
        </CardContent>
      </Card>

      <CreateCandidateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        busy={createCandidate.isPending}
        onSubmit={input => createCandidate.mutate(input)}
      />

      <CvPreviewDialog
        preview={preview}
        onClose={() => setPreview(null)}
        onDownload={() => preview && void downloadCv(preview.candidate)}
      />

      <Toaster />
    </div>
  )

  async function downloadCv(candidate: Candidate) {
    try {
      const blob = await hrApi.downloadResumeBytes(candidate.id)
      downloadBlob(blob, `cv-${candidate.name}.pdf`)
    } catch (error) {
      toast({ variant: 'error', title: 'Could not download the CV', description: errorMessage(error, 'Try again.') })
    }
  }
}

function CreateCandidateDialog({
  open,
  onOpenChange,
  busy,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  busy: boolean
  onSubmit: (input: Parameters<typeof hrApi.createCandidate>[0]) => void
}) {
  const [form, setForm] = useState({ name: '', role: '', email: '', source: '', location: '', experience: '' })

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm(current => ({ ...current, [key]: event.target.value }))

  const canSubmit = form.name.trim().length > 0 && form.role.trim().length > 0

  function reset() {
    setForm({ name: '', role: '', email: '', source: '', location: '', experience: '' })
  }

  function submit() {
    if (!canSubmit) return
    onSubmit({
      name: form.name.trim(),
      role: form.role.trim(),
      email: form.email.trim() || null,
      source: form.source.trim() || null,
      location: form.location.trim() || null,
      experience: form.experience.trim() || null,
    })
    reset()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a candidate</DialogTitle>
          <DialogDescription>New candidates enter the pipeline at the Applied stage.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
            Name
            <Input value={form.name} onChange={set('name')} placeholder="Full name" />
          </label>
          <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
            Role
            <Input value={form.role} onChange={set('role')} placeholder="e.g. Backend engineer" />
          </label>
          <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
            Email
            <Input value={form.email} onChange={set('email')} placeholder="name@example.com" />
          </label>
          <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
            Source
            <Input value={form.source} onChange={set('source')} placeholder="Referral, LinkedIn…" />
          </label>
          <label className="grid gap-1.5 text-sm text-[var(--color-body)]">
            Location
            <Input value={form.location} onChange={set('location')} placeholder="City" />
          </label>
          <label className="col-span-2 grid gap-1.5 text-sm text-[var(--color-body)]">
            Experience (notes)
            <Input value={form.experience} onChange={set('experience')} placeholder="Optional" />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit || busy} onClick={submit}>
            {busy ? 'Adding…' : 'Add candidate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CvPreviewDialog({
  preview,
  onClose,
  onDownload,
}: {
  preview: { candidate: Candidate; url: string } | null
  onClose: () => void
  onDownload: () => void
}) {
  // Revoke the preview's object URL whenever it closes (or is replaced by a new preview).
  useEffect(
    () => () => {
      if (preview?.url) URL.revokeObjectURL(preview.url)
    },
    [preview],
  )

  return (
    <Dialog open={preview != null} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText /> {preview?.candidate.name} — CV
          </DialogTitle>
          <DialogDescription>{preview?.candidate.role}</DialogDescription>
        </DialogHeader>
        {preview && (
          <iframe
            title="CV preview"
            src={preview.url}
            className="h-[70vh] w-full rounded-[var(--radius-card-sm)]"
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X /> Close
          </Button>
          <Button onClick={onDownload}>
            <Download /> Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
