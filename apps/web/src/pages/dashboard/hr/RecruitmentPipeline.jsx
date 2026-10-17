import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search, Filter, Download, X, FileText,
  Calendar, UserPlus, ArrowRight,
  MapPin, Mail, Loader2, Upload, Eye, Pencil,
} from 'lucide-react'
import { hrApi } from '../../../lib/api/hr'
import { queryKeys } from '../../../lib/queryKeys'
import { useActiveMemberRole } from '../../../lib/authClient'
import { getMemberRoleName } from '../../../lib/memberRole'
import FormDialog from '../../../components/common/FormDialog'
import QueryState from '../../../components/common/QueryState'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Textarea } from '../../../components/ui/textarea'
import { Badge } from '../../../components/ui/badge'
import { Alert, AlertDescription } from '../../../components/ui/alert'

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?'
}

// The old UI rendered human stage labels; the wire carries the enum code. Keyed on the code so
// the (unchanged) badge + STAGE_COLORS lookup still hit the old display strings.
const STAGE_LABELS = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  TECH_INTERVIEW: 'Tech Interview',
  FINAL_INTERVIEW: 'Final Interview',
  OFFER_SENT: 'Offer Sent',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
}

const STAGE_COLORS = {
  'Applied': 'bg-surface-active text-body',
  'Screening': 'bg-accent-light text-accent-hover',
  'Tech Interview': 'bg-purple-50 text-purple-700',
  'Final Interview': 'bg-warning-light text-amber-700',
  'Offer Sent': 'bg-success-light text-success-text',
  'Hired': 'bg-success-light text-success-text',
  'Rejected': 'bg-danger-light text-danger',
}

const NEXT_STAGES = {
  APPLIED: ['SCREENING', 'REJECTED'],
  SCREENING: ['TECH_INTERVIEW', 'REJECTED'],
  TECH_INTERVIEW: ['FINAL_INTERVIEW', 'REJECTED'],
  FINAL_INTERVIEW: ['OFFER_SENT', 'REJECTED'],
  OFFER_SENT: ['HIRED', 'REJECTED'],
  HIRED: [],
  REJECTED: [],
}

// ── 2. Candidate Inspector Component ────────────────────────

const CV_MAX_BYTES = 5 * 1024 * 1024 // Client-side guard mirroring the upload grant's maxBytes (server re-validates)

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'PDF'
  if (bytes >= 1024 * 1024) return `PDF • ${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `PDF • ${Math.max(1, Math.round(bytes / 1024))} KB`
}

function CandidateInspector({ candidate, interviews = [], onClose, canWrite, canMoveStage, onMoveStage, onSchedule, onCancelInterview, onEdit }) {
  if (!candidate) return null
  const profile = candidate.profile || {}
  const activity = candidate.activity || []
  const avatar = candidate.avatar || initials(candidate.name)
  const hasCv = !!candidate.resumeUrl

  return (
    <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card flex flex-col overflow-hidden">

      {/* Header Actions */}
      <div className="px-5 py-3.5 flex items-center justify-between border-b border-border-subtle bg-surface-raised">
        <h3 className="text-sm font-bold text-heading">Candidate Profile</h3>
        <div className="flex items-center gap-2">
          {canWrite && (
            <button
              type="button"
              onClick={onEdit}
              title="Edit Candidate"
              className="text-caption hover:text-body transition-colors p-1 rounded hover:bg-surface-muted cursor-pointer"
            >
              <Pencil size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="text-caption hover:text-body transition-colors p-1 rounded hover:bg-surface-muted cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-3.5">
        {/* Identity */}
        <div className="text-center pb-3 border-b border-border-subtle">
          <div className="w-12 h-12 rounded-full bg-surface-active border border-border-default flex items-center justify-center text-heading font-bold text-base mx-auto mb-2 overflow-hidden">
            {typeof avatar === 'string' && avatar.startsWith('http') ? (
              <img src={avatar} alt={candidate.name} className="w-full h-full object-cover" />
            ) : (
              avatar
            )}
          </div>
          <h2 className="text-base font-bold text-heading leading-tight">{candidate.name}</h2>
          <p className="text-xs text-muted mt-0.5">{candidate.role}</p>

          <div className="flex items-center justify-center gap-4 mt-2.5 text-xs text-muted">
            <span className="flex items-center gap-1.5"><MapPin size={12} /> {profile.location || '—'}</span>
            <span className="flex items-center gap-1.5"><Mail size={12} /> {profile.email || 'Email'}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3.5">
            <Button
              size="sm"
              type="button"
              disabled={!canWrite || !canMoveStage}
              onClick={onSchedule}
              title={!canWrite ? 'Requires the ADMIN role' : !canMoveStage ? 'Candidate is closed' : undefined}
              className="gap-1.5 text-xs py-2"
            >
              <Calendar size={13} /> Schedule
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={!canWrite || !canMoveStage}
              onClick={onMoveStage}
              className="gap-1.5 text-xs py-2"
            >
              <ArrowRight size={13} /> Move Stage
            </Button>
          </div>
        </div>

        {/* Profile Details */}
        <div className="space-y-3">
          {/* Overview Section: 3-column horizontal grid */}
          <div>
            <h4 className="text-[10px] font-semibold text-caption uppercase tracking-wider mb-2">Overview</h4>
            <div className="grid grid-cols-3 gap-3 py-3 border-y border-border-subtle text-xs">
              <div className="min-w-0">
                <span className="block text-muted text-[11px] mb-0.5 truncate">Current Role</span>
                <span className="font-semibold text-heading truncate block" title={profile.currentRole || '—'}>{profile.currentRole || '—'}</span>
              </div>
              <div className="min-w-0">
                <span className="block text-muted text-[11px] mb-0.5 truncate">Experience</span>
                <span className="font-semibold text-heading truncate block" title={profile.experience || '—'}>{profile.experience || '—'}</span>
              </div>
              <div className="min-w-0">
                <span className="block text-muted text-[11px] mb-0.5 truncate">Source</span>
                <span className="font-semibold text-heading truncate block" title={profile.source || '—'}>{profile.source || '—'}</span>
              </div>
            </div>
          </div>

          {/* Interviews */}
          <div>
            <h4 className="text-[10px] font-semibold text-caption uppercase tracking-wider mb-2">Interviews</h4>
            <div className="space-y-2">
              {interviews.length === 0 ? (
                <p className="text-xs text-muted">No interviews scheduled.</p>
              ) : (
                interviews.map(interview => (
                  <div key={interview.id} className="rounded-input border border-border-default p-2.5 text-xs bg-surface-muted/30">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-heading">{STAGE_LABELS[interview.stage]} · {new Date(interview.startsAt).toLocaleString()}</p>
                        <p className="text-muted mt-0.5 text-[11px]">{interview.durationMin} min{interview.interviewer ? ` · ${interview.interviewer}` : ''} · {interview.status.toLowerCase()}</p>
                        {interview.meetingUrl && <a href={interview.meetingUrl} target="_blank" rel="noreferrer" className="text-accent underline mt-1 inline-block text-[11px]">Meeting link</a>}
                        {interview.notes && <p className="text-body-light mt-1 whitespace-pre-wrap text-[11px]">{interview.notes}</p>}
                      </div>
                      {interview.status === 'SCHEDULED' && canWrite && (
                        <button type="button" onClick={() => onCancelInterview(interview.id)} className="text-danger hover:underline text-xs shrink-0 cursor-pointer">
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Resume Card — the old mock card, now backed by the real CV surface (upload / view) */}
          <div>
            <h4 className="text-[10px] font-semibold text-caption uppercase tracking-wider mb-2">Resume</h4>
            <CvSection key={candidate.id} candidate={candidate} hasCv={hasCv} canWrite={canWrite} />
          </div>

          {/* Activity Log */}
          <div>
            <h4 className="text-[10px] font-semibold text-caption uppercase tracking-wider mb-2">Activity Log</h4>
            <div className="space-y-2.5">
              {activity.length === 0 ? (
                <p className="text-xs text-muted">No recent activity.</p>
              ) : (
                activity.slice(0, 4).map((log, i) => (
                  <div key={i} className="flex gap-2.5">
                    <div className="relative flex flex-col items-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                      {i !== Math.min(activity.length, 4) - 1 && (
                        <div className="w-px h-full bg-border-subtle absolute top-3" />
                      )}
                    </div>
                    <div className="min-w-0 pb-1">
                      <p className="text-xs font-semibold text-heading">{log.action === 'stage.changed' ? 'Stage changed' : log.action === 'cv.uploaded' ? 'CV uploaded' : log.action === 'interview.scheduled' ? 'Interview scheduled' : log.action === 'interview.cancelled' ? 'Interview cancelled' : 'Candidate created'}</p>
                      <p className="text-[11px] text-body-light leading-relaxed mt-0.5">{log.description || '—'}</p>
                      <p className="text-[9px] text-caption mt-0.5">
                        {new Date(log.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              )}
              {activity.length > 4 && (
                <p className="text-[10px] text-muted pt-0.5">+{activity.length - 4} older activities</p>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// CV (resume) section of the inspector. Upload mints the signed grant + PUTs the PDF bytes;
// view streams the stored PDF as a Blob and opens it in a new tab. Re-mounts per candidate
// (the parent keys it by id), so the local file/error state resets on selection change.
function CvSection({ candidate, hasCv, canWrite }) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [cvError, setCvError] = useState(null)

  // Both writes require ADMIN server-side; re-invalidate the candidates query so the list,
  // KPIs, and this inspector all reflect the new CV (SSE covers other tabs). The file is passed
  // straight into the mutation (not read from state) so the upload can't race a re-render.
  const uploadMutation = useMutation({
    mutationFn: (file) => hrApi.uploadResume(candidate.id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.candidates.all() })
      setSelectedFile(null)
      setCvError(null)
    },
    onError: (err) => setCvError(err?.message || 'Upload failed'),
  })

  // One action: the button opens the native picker; a valid selection uploads immediately, an
  // invalid one (non-PDF / > 5 MB) is rejected inline before any network call.
  function handleFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = '' // reset so re-selecting the same file re-fires the change
    setCvError(null)
    if (!file) return
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      setCvError('Only PDF files are accepted.')
      return
    }
    if (file.size > CV_MAX_BYTES) {
      setCvError('The CV must be 5 MB or smaller.')
      return
    }
    setSelectedFile(file)
    uploadMutation.mutate(file)
  }

  async function handleView() {
    try {
      const blob = await hrApi.getResume(candidate.id)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) {
      if (err?.statusCode === 404) setCvError('No CV on file for this candidate.')
      else setCvError(err?.message || 'Could not load the CV.')
    }
  }

  if (hasCv) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between p-3 rounded-card-sm border border-border-default bg-surface-muted group hover:bg-surface-raised hover:border-accent-light transition-colors cursor-pointer" onClick={handleView}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-surface-raised rounded-button border border-border-default group-hover:border-accent-light group-hover:text-accent transition-colors">
              <FileText size={16} />
            </div>
            <div>
              <p className="text-xs font-medium text-heading">resume.pdf</p>
              <p className="text-[10px] text-muted mt-0.5">PDF · View</p>
            </div>
          </div>
          <Eye size={14} className="text-caption group-hover:text-accent transition-colors" />
        </div>
        {cvError && <p className="text-[11px] text-danger">{cvError}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between p-3 rounded-card-sm border border-dashed border-border-default bg-surface-muted/50">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-surface-raised rounded-button border border-border-default text-caption">
            <FileText size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-heading truncate">{selectedFile ? selectedFile.name : 'No CV uploaded'}</p>
            <p className="text-[10px] text-muted mt-0.5">{selectedFile ? formatBytes(selectedFile.size) : 'PDF, up to 5 MB'}</p>
          </div>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />
      {cvError && <p className="text-[11px] text-danger">{cvError}</p>}
      <button
        type="button"
        disabled={!canWrite || uploadMutation.isPending}
        title={canWrite ? undefined : 'Requires the ADMIN role'}
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center justify-center gap-1.5 w-full bg-surface-raised border border-border-default text-body text-xs font-medium py-2 rounded-button hover:bg-surface-muted transition-colors disabled:opacity-60"
      >
        {uploadMutation.isPending ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Upload size={14} />
        )}
        Upload CV
      </button>
    </div>
  )
}

// ── 3. Main View Component ──────────────────────────────────

export default function RecruitmentPipeline() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [stageOpen, setStageOpen] = useState(false)
  const [nextStage, setNextStage] = useState('SCREENING')
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [interviewForm, setInterviewForm] = useState({ startsAt: '', durationMin: '60', stage: 'TECH_INTERVIEW', interviewer: '', meetingUrl: '', notes: '' })
  const [interviewError, setInterviewError] = useState(null)
  const [exportError, setExportError] = useState(null)
  const [exporting, setExporting] = useState(false)
  const hasManuallyClosedRef = useRef(false)

  const { data: activeMemberRole } = useActiveMemberRole()
  const roleName = getMemberRoleName(activeMemberRole)
  const canWrite = roleName === 'OWNER' || roleName === 'ADMIN'

  const [roleFilter, setRoleFilter] = useState('ALL')
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', role: '', email: '', location: '', source: '', experience: '', currentRole: '', education: '' })
  const [editError, setEditError] = useState(null)

  const updateCandidateMutation = useMutation({
    mutationFn: (values) => hrApi.updateCandidate(selectedId, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.candidates.all() })
      setEditOpen(false)
      setEditError(null)
    },
    onError: (err) => setEditError(err?.message || 'Could not update the candidate'),
  })

  function openEditCandidate() {
    if (!selectedCandidate) return
    setEditForm({
      name: selectedCandidate.name || '',
      role: selectedCandidate.role || '',
      email: selectedCandidate.email || '',
      location: selectedCandidate.location || '',
      source: selectedCandidate.source || '',
      experience: selectedCandidate.experience || '',
      currentRole: selectedCandidate.currentRole || '',
      education: selectedCandidate.education || '',
    })
    setEditError(null)
    setEditOpen(true)
  }

  function submitEditCandidate() {
    const name = editForm.name.trim()
    const role = editForm.role.trim()
    if (!name || !role) {
      setEditError('Name and role are required.')
      return
    }
    updateCandidateMutation.mutate({
      name,
      role,
      email: editForm.email.trim() || null,
      location: editForm.location.trim() || null,
      source: editForm.source.trim() || null,
      experience: editForm.experience.trim() || null,
      education: editForm.education.trim() || null,
    })
  }

  const candidateQuery = {
    page,
    limit: 8,
    search: search || undefined,
    role: roleFilter === 'ALL' ? undefined : roleFilter,
  }
  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.hr.candidates.list(candidateQuery),
    queryFn: () => hrApi.listCandidates(candidateQuery),
  })

  const candidates = data?.items || []
  const availableRoles = data?.roleOptions || []
  const visibleCandidates = candidates
  const selectedCandidateOnPage = candidates.find(c => c.id === selectedId)
  const { data: selectedCandidateDetail } = useQuery({
    queryKey: queryKeys.hr.candidates.detail(selectedId ? `${selectedId}:record` : 'none'),
    queryFn: () => hrApi.getCandidate(selectedId),
    enabled: !!selectedId && !selectedCandidateOnPage,
  })
  const selectedCandidate = selectedCandidateOnPage ?? selectedCandidateDetail
  const { data: interviews = [] } = useQuery({
    queryKey: queryKeys.hr.candidates.detail(selectedId ? `${selectedId}:interviews` : 'none'),
    queryFn: () => hrApi.listCandidateInterviews(selectedId),
    enabled: !!selectedId,
  })
  useEffect(() => {
    const pagination = data?.pagination
    if (!pagination) return
    if (pagination.pages === 0 && page !== 1) setPage(1)
    else if (pagination.pages > 0 && page > pagination.pages) setPage(pagination.pages)
  }, [data?.pagination, page])
  const moveStageMutation = useMutation({
    mutationFn: () => hrApi.updateCandidateStage(selectedId, nextStage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.candidates.all() })
      setStageOpen(false)
    },
  })
  const scheduleInterviewMutation = useMutation({
    mutationFn: body => hrApi.scheduleCandidateInterview(selectedId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.candidates.detail(`${selectedId}:interviews`) })
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.candidates.all() })
      setScheduleOpen(false)
      setInterviewError(null)
      setInterviewForm({ startsAt: '', durationMin: '60', stage: selectedCandidate?.stage === 'FINAL_INTERVIEW' ? 'FINAL_INTERVIEW' : 'TECH_INTERVIEW', interviewer: '', meetingUrl: '', notes: '' })
    },
    onError: err => setInterviewError(err?.message || 'Could not schedule interview'),
  })
  const cancelInterviewMutation = useMutation({
    mutationFn: interviewId => hrApi.cancelCandidateInterview(selectedId, interviewId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.hr.candidates.detail(`${selectedId}:interviews`) }),
    onError: err => setInterviewError(err?.message || 'Could not cancel interview'),
  })

  async function exportCandidates() {
    setExporting(true)
    setExportError(null)
    try {
      const blob = await hrApi.exportCandidates({ search: search || undefined })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'recruitment-candidates.csv'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setExportError(err?.message || 'Could not export candidates')
    } finally {
      setExporting(false)
    }
  }

  function submitInterview() {
    if (!interviewForm.startsAt) {
      setInterviewError('Choose an interview date and time.')
      return
    }
    const startsAt = new Date(interviewForm.startsAt)
    if (!Number.isFinite(startsAt.getTime())) {
      setInterviewError('The date and time are invalid.')
      return
    }
    scheduleInterviewMutation.mutate({
      startsAt: startsAt.toISOString(),
      durationMin: Number(interviewForm.durationMin),
      stage: interviewForm.stage,
      ...(interviewForm.interviewer.trim() && { interviewer: interviewForm.interviewer.trim() }),
      ...(interviewForm.meetingUrl.trim() && { meetingUrl: interviewForm.meetingUrl.trim() }),
      ...(interviewForm.notes.trim() && { notes: interviewForm.notes.trim() }),
    })
  }

  // Add-candidate dialog
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ name: '', role: '', email: '', location: '', source: '' })
  const [formError, setFormError] = useState(null)

  const createMutation = useMutation({
    mutationFn: (values) => hrApi.createCandidate(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hr.candidates.all() })
      setAddOpen(false)
      setForm({ name: '', role: '', email: '', location: '', source: '' })
      setFormError(null)
    },
    onError: (err) => setFormError(err?.message || 'Could not create the candidate'),
  })

  function submitAddCandidate() {
    const name = form.name.trim()
    const role = form.role.trim()
    if (!name || !role) {
      setFormError('Name and role are required.')
      return
    }
    // Optional fields are omitted when blank — the contract treats undefined as "not provided".
    createMutation.mutate({
      name,
      role,
      ...(form.email.trim() && { email: form.email.trim() }),
      ...(form.location.trim() && { location: form.location.trim() }),
      ...(form.source.trim() && { source: form.source.trim() }),
    })
  }

  // The endpoint's `summary` is `null` (nothing to aggregate), so the KPI cards derive their
  // stage counts from the loaded page — `limit: 100` covers the full dataset, mirroring the
  // old client-side `stats` tally.
  // Auto-select first candidate if none selected and not manually closed
  useEffect(() => {
    if (!selectedId && candidates.length > 0 && !hasManuallyClosedRef.current) {
      setSelectedId(candidates[0].id)
    }
  }, [candidates, selectedId])

  // Period deltas use recorded stage-entry timestamps, compared with the same elapsed days
  // in the previous tenant-local month.
  const summary = data?.summary
  const periodDelta = (current, previous, unit, digits = 0) => current == null || previous == null
    ? 'No comparable period data'
    : `${current - previous > 0 ? '+' : ''}${(current - previous).toFixed(digits)} ${unit} vs prior MTD`
  const displayStats = [
    { label: 'ACTIVE CANDIDATES', value: summary?.activeCandidates ?? '—', trend: 'neutral', sub: 'Current pipeline' },
    { label: 'HIRED (MTD)', value: summary?.hiredThisPeriod ?? '—', trend: 'neutral', sub: periodDelta(summary?.hiredThisPeriod, summary?.hiredPreviousPeriod, 'hires') },
    { label: 'AVG TIME TO HIRE (MTD)', value: summary?.averageTimeToHireThisPeriod == null ? '—' : `${summary.averageTimeToHireThisPeriod} days`, trend: 'neutral', sub: periodDelta(summary?.averageTimeToHireThisPeriod, summary?.averageTimeToHirePreviousPeriod, 'days', 1) },
    {
      label: 'OFFER ACCEPTANCE (MTD)',
      value: summary?.offerAcceptanceRateThisPeriod == null ? '—' : `${summary.offerAcceptanceRateThisPeriod}%`,
      trend: 'neutral',
      sub: `${summary?.offersDecidedThisPeriod ?? 0} decisions · ${summary?.offerAcceptanceRateThisPeriod == null || summary?.offerAcceptanceRatePreviousPeriod == null ? 'No prior data' : periodDelta(summary?.offerAcceptanceRateThisPeriod, summary?.offerAcceptanceRatePreviousPeriod, 'pts', 1)}`
    },
  ]

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface-raised overflow-y-auto min-w-0 px-6 py-5">
      {/* ── Top Toolbar (Single Row across 12-column width) ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 w-full mb-5 flex-shrink-0">
        {/* Left group */}
        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
            <Input
              type="text"
              value={search}
              onChange={event => { setSearch(event.target.value); setPage(1) }}
              placeholder="Search candidates..."
              className="pl-9 pr-4 py-2 text-xs w-72 max-w-full"
            />
          </div>
          <div className="relative flex items-center">
            <Filter size={14} className="absolute left-3 pointer-events-none text-muted" />
            <select
              aria-label="Filter by candidate role"
              value={roleFilter}
              onChange={event => { setRoleFilter(event.target.value); setPage(1) }}
              className="appearance-none bg-surface-raised border border-border-default text-body text-xs pl-8 pr-7 py-2 rounded-input hover:bg-surface-muted transition-colors cursor-pointer outline-none shadow-card"
            >
              <option value="ALL">Role: All</option>
              {availableRoles.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Right group */}
        <div className="flex items-center gap-2.5 shrink-0 ml-auto">
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={!canWrite || exporting}
            title={canWrite ? 'Export all candidates matching the current search' : 'Requires the ADMIN role'}
            onClick={exportCandidates}
            className="gap-2 shadow-sm"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export
          </Button>
          <Button
            size="sm"
            type="button"
            disabled={!canWrite}
            title={canWrite ? undefined : 'Requires the ADMIN role'}
            onClick={() => { setFormError(null); setAddOpen(true) }}
            className="gap-2 shadow-sm"
          >
            <UserPlus size={14} /> + Add Candidate
          </Button>
        </div>
      </div>
      {exportError && (
        <Alert variant="destructive" className="-mt-3 mb-4 flex-shrink-0">
          <AlertDescription>{exportError}</AlertDescription>
        </Alert>
      )}

      {/* ── Top 4 KPI Cards (grid-cols-12 gap-5 mb-5) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-5 mb-5 flex-shrink-0">
        {displayStats.map(stat => (
          <div
            key={stat.label}
            className="col-span-12 sm:col-span-6 lg:col-span-3 bg-surface-raised rounded-card border border-border-subtle p-4 shadow-card h-auto flex flex-col justify-start"
          >
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none">
              {stat.label}
            </p>
            <p className="text-2xl font-bold text-heading mt-1 leading-tight">
              {stat.value}
            </p>
            <p className="text-xs text-muted mt-1 leading-normal truncate" title={stat.sub}>
              {stat.sub}
            </p>
          </div>
        ))}
      </div>

      {/* ── Main Workspace: Master Table (col-span-8) & Right Inspector (col-span-4) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start flex-1 min-h-0">
        {/* Left Column (col-span-8): Candidate Table Card */}
        <div className="col-span-12 lg:col-span-8 min-w-0 bg-surface-raised rounded-card border border-border-subtle shadow-card flex flex-col overflow-hidden">
          <div className="overflow-x-auto">
            <QueryState
              isLoading={isLoading}
              isError={isError}
              error={error}
              isEmpty={!visibleCandidates.length}
              emptyTitle="No candidates found"
              emptyDescription="Add a candidate or load the sample pack to see data."
            >
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-muted sticky top-0 z-10 text-[11px] font-bold text-muted uppercase tracking-wider border-b border-border-default shadow-sm">
                  <tr>
                    <th className="px-5 py-3 text-left bg-surface-muted">Candidate</th>
                    <th className="px-5 py-3 text-left bg-surface-muted whitespace-nowrap">Role</th>
                    <th className="px-5 py-3 text-left bg-surface-muted whitespace-nowrap">Stage</th>
                    <th className="px-5 py-3 text-right bg-surface-muted whitespace-nowrap">Time in Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {visibleCandidates.map(cand => {
                    const stageLabel = STAGE_LABELS[cand.stage] || cand.stage
                    const isSelected = selectedId === cand.id
                    return (
                      <tr
                        key={cand.id}
                        onClick={() => {
                          hasManuallyClosedRef.current = false
                          setSelectedId(cand.id)
                        }}
                        className={`group cursor-pointer transition-colors h-14 ${
                          isSelected ? 'bg-accent-light/50' : 'bg-surface-raised hover:bg-surface-muted/60'
                        }`}
                      >
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-strong flex items-center justify-center text-xs font-semibold text-heading overflow-hidden shrink-0">
                              {cand.avatarUrl ? (
                                <img src={cand.avatarUrl} alt={cand.name} className="w-full h-full object-cover" />
                              ) : (
                                cand.name.split(' ').map(n => n[0]).join('').slice(0, 2)
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-heading truncate">{cand.name}</p>
                              <p className="text-[11px] text-muted truncate">{cand.email || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-2.5 text-sm text-body whitespace-nowrap">{cand.role}</td>
                        <td className="px-5 py-2.5 whitespace-nowrap">
                          <Badge variant="outline" className={STAGE_COLORS[stageLabel] || 'bg-surface-active text-body'}>
                            {stageLabel}
                          </Badge>
                        </td>
                        <td className="px-5 py-2.5 text-sm text-body-light text-right whitespace-nowrap">
                          {cand.timeInStage || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </QueryState>
          </div>

          {data?.pagination && (
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-2.5 border-t border-border-default text-xs text-muted bg-surface-muted/30">
              <span>Showing {data.pagination.total === 0 ? 0 : (page - 1) * data.pagination.limit + 1}–{Math.min(page * data.pagination.limit, data.pagination.total)} of {data.pagination.total} candidates</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(current => current - 1)}
                  className="h-7 px-2 text-xs"
                >
                  Previous
                </Button>
                <span>Page {data.pagination.pages === 0 ? 0 : page} of {data.pagination.pages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={page >= data.pagination.pages}
                  onClick={() => setPage(current => current + 1)}
                  className="h-7 px-2 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column (col-span-4): Candidate Profile Inspector Card */}
        <div className="col-span-12 lg:col-span-4 min-w-0">
          {selectedId && selectedCandidate ? (
            <CandidateInspector
              candidate={{
                ...selectedCandidate,
                avatar: selectedCandidate.avatarUrl,
                profile: {
                  location: selectedCandidate.location,
                  email: selectedCandidate.email,
                  currentRole: selectedCandidate.currentRole,
                  experience: selectedCandidate.experience,
                  source: selectedCandidate.source,
                },
                activity: selectedCandidate.activity,
              }}
              interviews={interviews}
              canWrite={canWrite}
              canMoveStage={!!NEXT_STAGES[selectedCandidate?.stage]?.length}
              onMoveStage={() => { setNextStage(NEXT_STAGES[selectedCandidate.stage][0]); setStageOpen(true) }}
              onSchedule={() => { setInterviewError(null); setInterviewForm({ startsAt: '', durationMin: '60', stage: selectedCandidate?.stage === 'FINAL_INTERVIEW' ? 'FINAL_INTERVIEW' : 'TECH_INTERVIEW', interviewer: '', meetingUrl: '', notes: '' }); setScheduleOpen(true) }}
              onCancelInterview={interviewId => cancelInterviewMutation.mutate(interviewId)}
              onEdit={openEditCandidate}
              onClose={() => {
                hasManuallyClosedRef.current = true
                setSelectedId(null)
              }}
            />
          ) : (
            <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card p-6 text-center text-sm text-muted">
              Select a candidate to view details.
            </div>
          )}
        </div>
      </div>

      {/* ── Add Candidate Dialog ── */}
      <FormDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Candidate"
        subtitle="Create a new candidate in the recruitment pipeline."
        confirmLabel="Add Candidate"
        busy={createMutation.isPending}
        onConfirm={submitAddCandidate}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Name <span className="text-danger">*</span></label>
            <Input
              type="text"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Jordan Blake"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Role <span className="text-danger">*</span></label>
            <Input
              type="text"
              value={form.role}
              onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
              placeholder="e.g. Frontend Engineer"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Email</label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="jordan@example.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Location</label>
              <Input
                type="text"
                value={form.location}
                onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="e.g. Remote"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Source</label>
              <Input
                type="text"
                value={form.source}
                onChange={(e) => setForm(f => ({ ...f, source: e.target.value }))}
                placeholder="e.g. LinkedIn"
              />
            </div>
          </div>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
        </div>
      </FormDialog>

      <FormDialog open={stageOpen} onClose={() => setStageOpen(false)} title="Move candidate stage" subtitle={selectedCandidate?.name} confirmLabel="Save stage" busy={moveStageMutation.isPending} onConfirm={() => moveStageMutation.mutate()}>
        <label className="block text-sm font-medium text-body">Stage<select value={nextStage} onChange={event => setNextStage(event.target.value)} className="mt-1 w-full rounded-input border border-border-default px-3 py-2 bg-surface-raised">{(NEXT_STAGES[selectedCandidate?.stage] || []).map(stage => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}</select></label>
      </FormDialog>

      <FormDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} title="Schedule interview" subtitle={selectedCandidate?.name} confirmLabel="Schedule interview" busy={scheduleInterviewMutation.isPending} onConfirm={submitInterview}>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-body">Date and time (your device time)<Input type="datetime-local" value={interviewForm.startsAt} onChange={event => setInterviewForm(f => ({ ...f, startsAt: event.target.value }))} className="mt-1" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-body">Interview stage<select value={interviewForm.stage} onChange={event => setInterviewForm(f => ({ ...f, stage: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2 bg-surface-raised">{['SCREENING', 'TECH_INTERVIEW', 'FINAL_INTERVIEW'].map(stage => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}</select></label>
            <label className="block text-sm font-medium text-body">Duration (minutes)<Input type="number" min="15" max="480" step="15" value={interviewForm.durationMin} onChange={event => setInterviewForm(f => ({ ...f, durationMin: event.target.value }))} className="mt-1" /></label>
          </div>
          <label className="block text-sm font-medium text-body">Interviewer<Input value={interviewForm.interviewer} onChange={event => setInterviewForm(f => ({ ...f, interviewer: event.target.value }))} maxLength={160} className="mt-1" /></label>
          <label className="block text-sm font-medium text-body">Meeting URL<Input type="url" value={interviewForm.meetingUrl} onChange={event => setInterviewForm(f => ({ ...f, meetingUrl: event.target.value }))} placeholder="https://..." className="mt-1" /></label>
          <label className="block text-sm font-medium text-body">Notes<Textarea value={interviewForm.notes} onChange={event => setInterviewForm(f => ({ ...f, notes: event.target.value }))} maxLength={2000} rows={3} className="mt-1" /></label>
          {interviewError && (
            <Alert variant="destructive">
              <AlertDescription>{interviewError}</AlertDescription>
            </Alert>
          )}
        </div>
      </FormDialog>

      <FormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Candidate"
        subtitle={selectedCandidate?.name}
        confirmLabel="Save Changes"
        busy={updateCandidateMutation.isPending}
        onConfirm={submitEditCandidate}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Name <span className="text-danger">*</span></label>
            <Input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Jordan Blake"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Role <span className="text-danger">*</span></label>
            <Input
              type="text"
              value={editForm.role}
              onChange={(e) => setEditForm(f => ({ ...f, role: e.target.value }))}
              placeholder="e.g. Frontend Engineer"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Email</label>
            <Input
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
              placeholder="jordan@example.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Location</label>
              <Input
                type="text"
                value={editForm.location}
                onChange={(e) => setEditForm(f => ({ ...f, location: e.target.value }))}
                placeholder="e.g. Remote"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Source</label>
              <Input
                type="text"
                value={editForm.source}
                onChange={(e) => setEditForm(f => ({ ...f, source: e.target.value }))}
                placeholder="e.g. LinkedIn"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Experience</label>
              <Input
                type="text"
                value={editForm.experience}
                onChange={(e) => setEditForm(f => ({ ...f, experience: e.target.value }))}
                placeholder="e.g. 5+ years"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Education</label>
              <Input
                type="text"
                value={editForm.education}
                onChange={(e) => setEditForm(f => ({ ...f, education: e.target.value }))}
                placeholder="e.g. BSc Computer Science"
              />
            </div>
          </div>
          {editError && (
            <Alert variant="destructive">
              <AlertDescription>{editError}</AlertDescription>
            </Alert>
          )}
        </div>
      </FormDialog>

    </div>
  )
}
