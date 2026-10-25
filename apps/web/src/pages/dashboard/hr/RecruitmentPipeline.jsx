import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Filter, Download, X, FileText,
  Calendar, UserPlus, ArrowRight,
  MapPin, Mail, Loader2, Upload, Eye, Pencil,
  Clock, CheckCircle2, Users, Award,
} from 'lucide-react'
import { hrApi } from '../../../lib/api/hr'
import { queryKeys } from '../../../lib/queryKeys'
import { cn } from '../../../lib/utils'
import { useActiveMemberRole } from '../../../lib/authClient'
import { getMemberRoleName } from '../../../lib/memberRole'
import FormDialog from '../../../components/common/FormDialog'
import QueryState from '../../../components/common/QueryState'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import SearchInput from '../../../components/common/SearchInput'
import { Textarea } from '../../../components/ui/textarea'
import { Badge } from '../../../components/ui/badge'
import { Alert, AlertDescription } from '../../../components/ui/alert'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select'

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?'
}

// Quick 1-click stage filter ribbon for the ATS Pipeline
const STAGE_FILTERS = [
  { key: 'ALL', label: 'All', dot: 'bg-primary' },
  { key: 'APPLIED', label: 'Applied', dot: 'bg-slate-500' },
  { key: 'SCREENING', label: 'Screening', dot: 'bg-indigo-500' },
  { key: 'TECH_INTERVIEW', label: 'Tech Interview', dot: 'bg-purple-500' },
  { key: 'FINAL_INTERVIEW', label: 'Final Interview', dot: 'bg-amber-500' },
  { key: 'OFFER_SENT', label: 'Offer Sent', dot: 'bg-emerald-500' },
]

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
    <div className="bg-gradient-to-b from-surface-raised to-surface-raised/80 backdrop-blur-xl border border-border-default rounded-2xl shadow-card flex flex-col overflow-hidden">

      {/* Header Actions */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-border-subtle bg-surface-raised/50">
        <h3 className="text-sm font-bold text-heading">Candidate Profile</h3>
        <div className="flex items-center gap-1">
          {canWrite && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onEdit}
              title="Edit Candidate"
              className="h-7 w-7 rounded-lg text-muted hover:text-heading hover:bg-surface-muted transition-colors"
            >
              <Pencil size={13} />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            title="Close"
            className="h-7 w-7 rounded-lg text-muted hover:text-heading hover:bg-surface-muted transition-colors"
          >
            <X size={14} />
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Compact Side-by-Side Candidate Identity Header */}
        <div className="pb-3 border-b border-border-subtle space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-surface-muted border border-border-default flex items-center justify-center text-heading font-bold text-sm shrink-0 overflow-hidden shadow-xs">
              {typeof avatar === 'string' && avatar.startsWith('http') ? (
                <img src={avatar} alt={candidate.name} className="w-full h-full object-cover" />
              ) : (
                avatar
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-heading leading-tight truncate">{candidate.name}</h2>
              <p className="text-xs font-medium text-muted mt-0.5 truncate">{candidate.role}</p>
            </div>
          </div>

          {/* Contact Pills Row */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="px-2.5 py-1 rounded-lg bg-surface-muted border border-border-default text-[11px] text-body inline-flex items-center gap-1.5 shadow-xs max-w-full">
              <MapPin size={12} className="text-muted shrink-0" />
              <span className="truncate">{profile.location || '—'}</span>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-surface-muted border border-border-default text-[11px] text-body inline-flex items-center gap-1.5 shadow-xs max-w-full">
              <Mail size={12} className="text-muted shrink-0" />
              <span className="truncate">{profile.email || 'Email'}</span>
            </span>
          </div>

          {/* Action Buttons Row */}
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <Button
              size="sm"
              type="button"
              disabled={!canWrite || !canMoveStage}
              onClick={onSchedule}
              title={!canWrite ? 'Requires the ADMIN role' : !canMoveStage ? 'Candidate is closed' : undefined}
              className="h-8.5 rounded-xl gap-1.5 text-xs font-semibold shadow-xs"
            >
              <Calendar size={13} /> Schedule
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={!canWrite || !canMoveStage}
              onClick={onMoveStage}
              className="h-8.5 rounded-xl gap-1.5 text-xs font-semibold bg-surface-raised hover:bg-surface-muted border border-border-default text-heading shadow-xs"
            >
              <ArrowRight size={13} /> Move Stage
            </Button>
          </div>
        </div>

        {/* Profile Details */}
        <div className="space-y-2.5">
          {/* Overview Section: 3-column recessed metric wells */}
          <div>
            <h4 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Overview</h4>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-surface-muted/80 border border-border-default rounded-xl p-2 min-w-0">
                <span className="block text-muted text-[10px] mb-0.5 truncate">Current Role</span>
                <span className="font-bold text-heading text-xs truncate block" title={profile.currentRole || '—'}>{profile.currentRole || '—'}</span>
              </div>
              <div className="bg-surface-muted/80 border border-border-default rounded-xl p-2 min-w-0">
                <span className="block text-muted text-[10px] mb-0.5 truncate">Experience</span>
                <span className="font-bold text-heading text-xs truncate block" title={profile.experience || '—'}>{profile.experience || '—'}</span>
              </div>
              <div className="bg-surface-muted/80 border border-border-default rounded-xl p-2 min-w-0">
                <span className="block text-muted text-[10px] mb-0.5 truncate">Source</span>
                <span className="font-bold text-heading text-xs truncate block" title={profile.source || '—'}>{profile.source || '—'}</span>
              </div>
            </div>
          </div>

          {/* Interviews Section */}
          <div>
            <h4 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Interviews</h4>
            <div className="space-y-1.5">
              {interviews.length === 0 ? (
                <div className="bg-surface-muted/60 border border-dashed border-border-default rounded-xl px-3 py-2 text-xs text-muted text-center">
                  No interviews scheduled.
                </div>
              ) : (
                interviews.map(interview => (
                  <div key={interview.id} className="rounded-xl border border-border-default p-2 text-xs bg-surface-muted/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-heading">{STAGE_LABELS[interview.stage]} · {new Date(interview.startsAt).toLocaleString()}</p>
                        <p className="text-muted mt-0.5 text-[11px]">{interview.durationMin} min{interview.interviewer ? ` · ${interview.interviewer}` : ''} · {interview.status.toLowerCase()}</p>
                        {interview.meetingUrl && <a href={interview.meetingUrl} target="_blank" rel="noreferrer" className="text-accent underline mt-1 inline-block text-[11px]">Meeting link</a>}
                        {interview.notes && <p className="text-body mt-1 whitespace-pre-wrap text-[11px]">{interview.notes}</p>}
                      </div>
                      {interview.status === 'SCHEDULED' && canWrite && (
                        <Button
                          type="button"
                          variant="link"
                          onClick={() => onCancelInterview(interview.id)}
                          className="text-danger hover:underline text-xs shrink-0 p-0 h-auto font-normal"
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Resume Card */}
          <div>
            <h4 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Resume</h4>
            <CvSection key={candidate.id} candidate={candidate} hasCv={hasCv} canWrite={canWrite} />
          </div>

          {/* Activity Log */}
          <div>
            <h4 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Activity Log</h4>
            <div className="space-y-1.5">
              {activity.length === 0 ? (
                <div className="bg-surface-muted/60 border border-dashed border-border-default rounded-xl px-3 py-2 text-xs text-muted text-center">
                  No recent activity.
                </div>
              ) : (
                activity.slice(0, 4).map((log, i) => (
                  <div key={i} className="bg-surface-muted/80 border border-border-default rounded-xl p-2 text-xs flex gap-2.5 items-start">
                    <div className="w-2 h-2 rounded-full bg-accent mt-1 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-heading leading-tight">
                        {log.action === 'stage.changed'
                          ? 'Stage changed'
                          : log.action === 'cv.uploaded'
                          ? 'CV uploaded'
                          : log.action === 'interview.scheduled'
                          ? 'Interview scheduled'
                          : log.action === 'interview.cancelled'
                          ? 'Interview cancelled'
                          : 'Candidate created'}
                      </p>
                      <p className="text-[11px] text-body-light leading-relaxed mt-0.5 truncate">{log.description || '—'}</p>
                      <p className="text-[10px] text-muted mt-1 font-mono">
                        {new Date(log.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))
              )}
              {activity.length > 4 && (
                <p className="text-[10px] text-muted pt-0.5 text-center">+{activity.length - 4} older activities</p>
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
      <div className="space-y-1.5">
        <div
          className="flex items-center justify-between p-2 rounded-xl border border-border-default bg-surface-muted/90 group hover:bg-surface-muted hover:border-border-strong transition-colors cursor-pointer"
          onClick={handleView}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 bg-surface-raised rounded-lg border border-border-default text-muted group-hover:text-accent transition-colors shrink-0">
              <FileText size={14} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-heading truncate">resume.pdf</p>
              <p className="text-[10px] text-muted">PDF · View</p>
            </div>
          </div>
          <Eye size={14} className="text-muted group-hover:text-accent transition-colors shrink-0 ml-2" />
        </div>
        {cvError && <p className="text-[11px] text-danger">{cvError}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between p-2 rounded-xl border border-dashed border-border-default bg-surface-muted/60">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-surface-raised rounded-lg border border-border-default text-muted shrink-0">
            <FileText size={14} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-heading truncate">{selectedFile ? selectedFile.name : 'No CV uploaded'}</p>
            <p className="text-[10px] text-muted">{selectedFile ? formatBytes(selectedFile.size) : 'PDF, up to 5 MB'}</p>
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canWrite || uploadMutation.isPending}
        title={canWrite ? undefined : 'Requires the ADMIN role'}
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center justify-center gap-1.5 w-full bg-surface-raised hover:bg-surface-muted border border-border-default text-body text-xs font-semibold py-2 rounded-xl transition-colors disabled:opacity-60 shadow-xs"
      >
        {uploadMutation.isPending ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Upload size={14} />
        )}
        Upload CV
      </Button>
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
  const [stageFilter, setStageFilter] = useState('ALL')
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
    stage: stageFilter === 'ALL' ? undefined : stageFilter,
  }
  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.hr.candidates.list(candidateQuery),
    queryFn: () => hrApi.listCandidates(candidateQuery),
  })

  // Pipeline summary query (without stage filter) to keep overall pipeline counts and stage tallies accurate
  const summaryQuery = {
    search: search || undefined,
    role: roleFilter === 'ALL' ? undefined : roleFilter,
    limit: 1,
  }
  const { data: overallData } = useQuery({
    queryKey: queryKeys.hr.candidates.list({ ...summaryQuery, scope: 'pipeline-summary' }),
    queryFn: () => hrApi.listCandidates(summaryQuery),
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
      const blob = await hrApi.exportCandidates({
        search: search || undefined,
        stage: stageFilter === 'ALL' ? undefined : stageFilter,
      })
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
  const summary = overallData?.summary ?? data?.summary
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
    <div className="flex-1 min-h-0 flex flex-col bg-surface-raised overflow-y-auto min-w-0 px-6 py-5 space-y-4">
      {/* ── Row 1: Spacious Single-Row Command Toolbar ── */}
      <div className="relative z-20 bg-surface-raised/85 backdrop-blur-xl border border-border-default rounded-2xl p-2.5 shadow-xs flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 shrink-0">
        {/* Left Cluster: Search + Role Select */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <SearchInput
            value={search}
            onChange={event => { setSearch(event.target.value); setPage(1) }}
            placeholder="Search candidates..."
            wrapperClassName="w-full sm:w-72 md:w-80 shrink-0"
            className="h-9 pl-9 pr-3 rounded-xl text-sm"
          />

          <Select
            value={roleFilter}
            onValueChange={val => { setRoleFilter(val); setPage(1) }}
          >
            <SelectTrigger aria-label="Filter by candidate role" className="h-9 px-3.5 rounded-xl text-xs sm:text-sm font-medium bg-surface-muted hover:bg-surface-muted/80 border border-border-default shadow-xs inline-flex items-center gap-2 shrink-0 w-auto min-w-0">
              <Filter size={14} className="text-muted shrink-0 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs sm:text-sm">Role: All</SelectItem>
              {availableRoles.map(role => (
                <SelectItem key={role} value={role} className="text-xs sm:text-sm">
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Right Cluster: Export + Add Candidate Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={!canWrite || exporting}
            title={canWrite ? 'Export all candidates matching the current search' : 'Requires the ADMIN role'}
            onClick={exportCandidates}
            className="h-9 px-3.5 rounded-xl bg-surface-raised hover:bg-surface-muted border border-border-default text-xs sm:text-sm font-semibold text-body inline-flex items-center gap-2 shadow-xs whitespace-nowrap shrink-0"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span>Export</span>
          </Button>
          <Button
            size="sm"
            type="button"
            disabled={!canWrite}
            title={canWrite ? undefined : 'Requires the ADMIN role'}
            onClick={() => { setFormError(null); setAddOpen(true) }}
            className="h-9 px-4 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-2 shadow-sm whitespace-nowrap shrink-0"
          >
            <UserPlus size={14} />
            <span>+ Add Candidate</span>
          </Button>
        </div>
      </div>

      {/* ── Row 2: Executive KPI Summary Cards (Apple-Glass with Squircle Badges) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 flex-shrink-0">
        {displayStats.map((stat, idx) => {
          const badgeStyles = [
            { bg: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600', icon: Users },
            { bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600', icon: CheckCircle2 },
            { bg: 'bg-amber-500/10 border-amber-500/20 text-amber-600', icon: Clock },
            { bg: 'bg-blue-500/10 border-blue-500/20 text-blue-600', icon: Award },
          ][idx] || { bg: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600', icon: Users }
          const Icon = badgeStyles.icon

          return (
            <div
              key={stat.label}
              className="bg-gradient-to-b from-surface-raised to-surface-raised/60 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[122px]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none">
                  {stat.label}
                </span>
                <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${badgeStyles.bg}`}>
                  <Icon size={16} />
                </div>
              </div>
              <div className="text-2xl font-bold text-heading tracking-tight my-1 leading-none">
                {stat.value}
              </div>
              <div className="pt-1.5 border-t border-border-subtle/80 text-[11px] text-muted leading-tight truncate" title={stat.sub}>
                {stat.sub}
              </div>
            </div>
          )
        })}
      </div>

      {exportError && (
        <Alert variant="destructive" className="-mt-1 mb-2 flex-shrink-0">
          <AlertDescription>{exportError}</AlertDescription>
        </Alert>
      )}

      {/* ── Row 3: Main Workspace: Master Table (col-span-8) & Right Inspector (col-span-4) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start flex-1 min-h-0">
        {/* Left Column (col-span-8): Candidate Table Card */}
        <div className="col-span-12 lg:col-span-8 min-w-0 bg-surface-raised rounded-2xl border border-border-default shadow-xs flex flex-col overflow-hidden">
          {/* Integrated Card Header: Title + Auto-Width Segmented Stage Tabs */}
          <div className="px-4 py-3 border-b border-border-default flex flex-wrap items-center justify-between gap-3 bg-surface-raised/50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-surface-muted border border-border-default/70 flex items-center justify-center text-primary shrink-0">
                <Users size={16} />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-heading">Candidates</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-surface-muted text-muted border border-border-default/60 tabular-nums">
                  {data?.pagination?.total ?? visibleCandidates.length}
                </span>
              </div>
            </div>

            {/* Segmented Stage Tabs (Auto-width, zero truncation) */}
            <div className="p-1 rounded-xl bg-surface-muted border border-border-default inline-flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
              {STAGE_FILTERS.map(st => {
                const isActive = stageFilter === st.key
                const count = st.key === 'ALL'
                  ? (summary?.activeCandidates ?? data?.pagination?.total ?? visibleCandidates.length)
                  : (summary?.stageCounts?.[st.key] ?? (isActive ? data?.pagination?.total : visibleCandidates.filter(c => c.stage === st.key).length) ?? 0)

                return (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => {
                      setStageFilter(st.key)
                      setPage(1)
                    }}
                    className={`w-auto px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                      isActive
                        ? 'bg-surface-raised text-heading shadow-xs font-bold'
                        : 'text-muted hover:text-heading'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} />
                    <span>{st.label}</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums shrink-0 ${
                      isActive
                        ? 'bg-accent-light text-accent'
                        : 'bg-surface-muted border border-border-default text-muted'
                    }`}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="overflow-x-auto">
            <QueryState
              isLoading={isLoading}
              isError={isError}
              error={error}
              isEmpty={!visibleCandidates.length}
              emptyTitle="No candidates found"
              emptyDescription="Add a candidate or load the sample pack to see data."
            >
              <Table className="w-full text-left border-collapse">
                <TableHeader className="bg-surface-muted/80 sticky top-0 z-10 text-[11px] font-semibold text-muted uppercase tracking-wider border-b border-border-default">
                  <TableRow className="hover:bg-transparent border-0">
                    <TableHead className="px-4 py-2.5 text-left rtl:text-right">Candidate</TableHead>
                    <TableHead className="px-4 py-2.5 text-left rtl:text-right whitespace-nowrap">Role</TableHead>
                    <TableHead className="px-4 py-2.5 text-left rtl:text-right whitespace-nowrap">Stage</TableHead>
                    <TableHead className="px-4 py-2.5 text-right rtl:text-left whitespace-nowrap">Time in Stage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border-subtle">
                  {visibleCandidates.map(cand => {
                    const stageLabel = STAGE_LABELS[cand.stage] || cand.stage
                    const isSelected = selectedId === cand.id
                    return (
                      <TableRow
                        key={cand.id}
                        onClick={() => {
                          hasManuallyClosedRef.current = false
                          setSelectedId(cand.id)
                        }}
                        className={cn(
                          'group cursor-pointer transition-colors border-0',
                          isSelected
                            ? 'bg-surface-row-selected hover:bg-surface-row-selected-hover'
                            : 'bg-surface-raised hover:bg-surface-muted/60'
                        )}
                      >
                        <TableCell className={cn(
                          'px-4 py-2.5 transition-colors',
                          isSelected ? 'border-l-2 border-l-accent' : 'border-l-2 border-l-transparent'
                        )}>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-surface-muted border border-border-default flex items-center justify-center text-xs font-bold text-heading overflow-hidden shrink-0 shadow-xs">
                              {cand.avatarUrl ? (
                                <img src={cand.avatarUrl} alt={cand.name} className="w-full h-full object-cover" />
                              ) : (
                                cand.name.split(' ').map(n => n[0]).join('').slice(0, 2)
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-semibold text-heading truncate leading-tight">{cand.name}</p>
                              <p className="text-[11px] text-muted truncate">{cand.email || '—'}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-xs sm:text-sm text-body whitespace-nowrap">{cand.role}</TableCell>
                        <TableCell className="px-4 py-2.5 whitespace-nowrap">
                          <Badge variant="outline" className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${STAGE_COLORS[stageLabel] || 'bg-surface-muted text-body'}`}>
                            {stageLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-xs font-medium tabular-nums text-muted text-right rtl:text-left whitespace-nowrap">
                          {cand.timeInStage || '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </QueryState>
          </div>

          {data?.pagination && (
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-t border-border-default text-xs text-muted bg-surface-muted/50">
              <span>Showing {data.pagination.total === 0 ? 0 : (page - 1) * data.pagination.limit + 1}–{Math.min(page * data.pagination.limit, data.pagination.total)} of {data.pagination.total} candidates</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(current => current - 1)}
                  className="h-7 px-2.5 text-xs font-medium"
                >
                  Previous
                </Button>
                <span className="font-medium">Page {data.pagination.pages === 0 ? 0 : page} of {data.pagination.pages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={page >= data.pagination.pages}
                  onClick={() => setPage(current => current + 1)}
                  className="h-7 px-2.5 text-xs font-medium"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column (col-span-4): Candidate Profile Inspector Card */}
        <div className="col-span-12 lg:col-span-4 min-w-0 lg:sticky lg:top-6">
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
            <div className="bg-gradient-to-b from-surface-raised to-surface-raised/80 backdrop-blur-xl border border-border-default rounded-2xl shadow-card p-8 text-center text-xs text-muted">
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
        <div>
          <label className="block text-sm font-medium text-body mb-1">Stage</label>
          <Select value={nextStage} onValueChange={setNextStage}>
            <SelectTrigger className="w-full bg-surface-raised">
              <SelectValue placeholder="Select stage" />
            </SelectTrigger>
            <SelectContent>
              {(NEXT_STAGES[selectedCandidate?.stage] || []).map(stage => (
                <SelectItem key={stage} value={stage}>{STAGE_LABELS[stage]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </FormDialog>

      <FormDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} title="Schedule interview" subtitle={selectedCandidate?.name} confirmLabel="Schedule interview" busy={scheduleInterviewMutation.isPending} onConfirm={submitInterview}>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-body">Date and time (your device time)<Input type="datetime-local" value={interviewForm.startsAt} onChange={event => setInterviewForm(f => ({ ...f, startsAt: event.target.value }))} className="mt-1" /></label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-body mb-1">Interview stage</label>
              <Select
                value={interviewForm.stage}
                onValueChange={val => setInterviewForm(f => ({ ...f, stage: val }))}
              >
                <SelectTrigger className="w-full bg-surface-raised">
                  <SelectValue placeholder="Select interview stage" />
                </SelectTrigger>
                <SelectContent>
                  {['SCREENING', 'TECH_INTERVIEW', 'FINAL_INTERVIEW'].map(stage => (
                    <SelectItem key={stage} value={stage}>{STAGE_LABELS[stage]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
