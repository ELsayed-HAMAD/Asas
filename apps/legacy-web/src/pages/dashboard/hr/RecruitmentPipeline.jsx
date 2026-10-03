import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search, Filter, Download, X, FileText,
  Clock, Calendar, CheckCircle2, UserPlus, ArrowRight,
  Briefcase, MapPin, Mail, Phone, Loader2, Upload, Eye,
} from 'lucide-react'
import { hrApi } from '../../../lib/api/hr'
import { queryKeys } from '../../../lib/queryKeys'
import { useActiveMemberRole } from '../../../lib/authClient'
import FormDialog from '../../../components/common/FormDialog'
import QueryState from '../../../components/common/QueryState'

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

// ── 2. Candidate Inspector Component ────────────────────────

const CV_MAX_BYTES = 5 * 1024 * 1024 // Client-side guard mirroring the upload grant's maxBytes (server re-validates)

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'PDF'
  if (bytes >= 1024 * 1024) return `PDF • ${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `PDF • ${Math.max(1, Math.round(bytes / 1024))} KB`
}

function CandidateInspector({ candidate, onClose, canWrite }) {
  if (!candidate) return null
  const profile = candidate.profile || {}
  const activity = candidate.activity || []
  const avatar = candidate.avatar || initials(candidate.name)
  const hasCv = !!candidate.resumeUrl

  return (
    <div className="w-[340px] bg-surface-raised border-l border-border-subtle flex flex-col h-full flex-shrink-0">

      {/* Header Actions */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-border-subtle">
        <h3 className="text-sm font-semibold text-heading">Candidate Profile</h3>
        <button type="button" onClick={onClose} className="text-caption hover:text-body transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Identity */}
        <div className="p-4 border-b border-border-faint text-center">
          <div className="w-16 h-16 rounded-full bg-surface-active border border-border-default flex items-center justify-center text-body-light font-bold text-2xl mx-auto mb-3">
            {avatar}
          </div>
          <h2 className="text-lg font-bold text-heading leading-tight">{candidate.name}</h2>
          <p className="text-sm text-muted mt-0.5">{candidate.role}</p>

          <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><MapPin size={12} /> {profile.location || '—'}</span>
            <span className="flex items-center gap-1.5"><Mail size={12} /> {profile.email || 'Email'}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-5">
            <button disabled className="flex items-center justify-center gap-1.5 bg-primary text-white text-xs font-medium py-2 rounded-button hover:bg-primary-hover disabled:opacity-60">
              <Calendar size={14} /> Schedule
            </button>
            <button disabled className="flex items-center justify-center gap-1.5 bg-surface-raised border border-border-default text-body text-xs font-medium py-2 rounded-button hover:bg-surface-muted disabled:opacity-60">
              <ArrowRight size={14} /> Move Stage
            </button>
          </div>
        </div>

        {/* Profile Details */}
        <div className="p-4 space-y-6">
          <div>
            <h4 className="text-[10px] font-semibold text-caption uppercase tracking-wider mb-3">Overview</h4>
            <div className="space-y-3 text-sm">
              <div>
                <span className="block text-muted text-xs mb-0.5">Current Role</span>
                <span className="font-medium text-heading">{profile.currentRole || '—'}</span>
              </div>
              <div>
                <span className="block text-muted text-xs mb-0.5">Experience</span>
                <span className="font-medium text-heading">{profile.experience || '—'}</span>
              </div>
              <div>
                <span className="block text-muted text-xs mb-0.5">Source</span>
                <span className="font-medium text-heading">{profile.source || '—'}</span>
              </div>
            </div>
          </div>

          {/* Resume Card — the old mock card, now backed by the real CV surface (upload / view) */}
          <div>
            <h4 className="text-[10px] font-semibold text-caption uppercase tracking-wider mb-3">Resume</h4>
            <CvSection key={candidate.id} candidate={candidate} hasCv={hasCv} canWrite={canWrite} />
          </div>

          {/* Activity Log */}
          <div>
            <h4 className="text-[10px] font-semibold text-caption uppercase tracking-wider mb-3">Activity Log</h4>
            <div className="space-y-4">
              {activity.length === 0 ? (
                <p className="text-xs text-muted">No recent activity.</p>
              ) : (
                activity.map((log, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="relative flex flex-col items-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5" />
                      {i !== activity.length - 1 && (
                        <div className="w-px h-full bg-surface-active absolute top-3" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-heading">{log.action}</p>
                      <p className="text-[11px] text-body-light leading-relaxed mt-0.5">{log.desc}</p>
                      <p className="text-[9px] text-caption mt-1">
                        {new Date(log.time).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
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

  const { data: activeMemberRole } = useActiveMemberRole()
  const canWrite = activeMemberRole === 'OWNER' || activeMemberRole === 'ADMIN'

  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.hr.candidates.list(),
    queryFn: () => hrApi.listCandidates({ limit: 100 }),
  })

  const candidates = data?.items || []

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
  const stageCounts = useMemo(() => {
    const counts = {}
    candidates.forEach(c => {
      counts[c.stage] = (counts[c.stage] || 0) + 1
    })
    return counts
  }, [candidates])

  // Auto-select first candidate if none selected
  useEffect(() => {
    if (!selectedId && candidates.length > 0) {
      setSelectedId(candidates[0].id)
    }
  }, [candidates, selectedId])

  const selectedCandidate = candidates.find(c => c.id === selectedId)

  // High-level stats from the loaded candidate records. The API does not expose time-to-hire or
  // offer-acceptance aggregates, so those KPIs stay explicitly unavailable.
  const totalActive = Object.entries(stageCounts)
    .filter(([code]) => code !== 'HIRED' && code !== 'REJECTED')
    .reduce((acc, [, count]) => acc + count, 0)
  const totalHired = stageCounts['HIRED'] || 0
  const displayStats = [
    { label: 'Active Candidates', value: totalActive, trend: 'neutral', sub: 'Current pipeline' },
    { label: 'Total Hired', value: totalHired, trend: 'neutral', sub: 'All time' },
    { label: 'Avg Time to Hire', value: '—', trend: 'neutral', sub: 'Not available' },
    { label: 'Offer Acceptance', value: '—', trend: 'neutral', sub: 'Not available' },
  ]

  return (
    <div className="flex h-full overflow-hidden bg-surface-raised">

      {/* ── Left Side: Pipeline List ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header & Stats */}
        <div className="p-8 border-b border-border-subtle flex-shrink-0">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-heading tracking-tight">Recruitment Pipeline</h1>
              <p className="text-sm text-muted mt-1">Track and manage active candidate pipelines.</p>
            </div>
            <button
              disabled={!canWrite}
              title={canWrite ? undefined : 'Requires the ADMIN role'}
              onClick={() => { setFormError(null); setAddOpen(true) }}
              className="bg-primary text-white text-sm font-medium px-4 py-2 rounded-button hover:bg-primary-hover transition-colors flex items-center gap-2 disabled:opacity-60"
            >
              <UserPlus size={16} /> Add Candidate
            </button>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {displayStats.map(stat => (
              <div key={stat.label} className="bg-surface-raised border border-border-subtle rounded-card-sm p-4 shadow-card">
                <span className="text-xs font-medium text-muted">{stat.label}</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold text-heading">{stat.value}</span>
                  <span className={`text-[10px] font-medium ${
                    stat.trend === 'up' ? 'text-success' :
                    stat.trend === 'down' ? 'text-danger' : 'text-caption'
                  }`}>
                    {stat.sub}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-8 py-3 border-b border-border-subtle bg-surface-muted/50 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
              <input
                type="text"
                placeholder="Search candidates..."
                className="pl-9 pr-4 py-1.5 text-sm border border-border-default rounded-button bg-surface-raised w-64 focus:outline-none focus:border-border-strong focus:ring-4 focus:ring-border-subtle transition-all"
              />
            </div>
            <button disabled className="flex items-center gap-2 bg-surface-raised border border-border-default text-body text-sm px-3 py-1.5 rounded-button hover:bg-surface-muted disabled:opacity-60">
              <Filter size={14} />
              Role: All
            </button>
          </div>
          <button disabled className="flex items-center gap-2 text-muted text-sm hover:text-heading font-medium px-3 py-1.5 disabled:opacity-60">
            <Download size={14} /> Export
          </button>
        </div>

        {/* Data Table */}
        <div className="flex-1 overflow-auto">
          <QueryState
            isLoading={isLoading}
            isError={isError}
            error={error}
            isEmpty={!candidates.length}
            emptyTitle="No candidates found"
            emptyDescription="Add a candidate or load the sample pack to see data."
          >
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-muted/80 sticky top-0 z-10 backdrop-blur-sm">
                <tr>
                  <th className="px-8 py-3 text-[10px] font-semibold text-caption uppercase tracking-wider border-b border-border-subtle">Candidate</th>
                  <th className="px-8 py-3 text-[10px] font-semibold text-caption uppercase tracking-wider border-b border-border-subtle">Role</th>
                  <th className="px-8 py-3 text-[10px] font-semibold text-caption uppercase tracking-wider border-b border-border-subtle">Stage</th>
                  <th className="px-8 py-3 text-[10px] font-semibold text-caption uppercase tracking-wider border-b border-border-subtle text-right">Time in Stage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-faint">
                {candidates.map(cand => {
                  const stageLabel = STAGE_LABELS[cand.stage] || cand.stage
                  return (
                    <tr
                      key={cand.id}
                      onClick={() => setSelectedId(cand.id)}
                      className={`group cursor-pointer transition-colors ${
                        selectedId === cand.id ? 'bg-accent-light/50' : 'hover:bg-surface-muted'
                      }`}
                    >
                      <td className="px-8 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-strong flex items-center justify-center text-xs font-semibold text-heading overflow-hidden">
                            {cand.avatarUrl ? (
                              <img src={cand.avatarUrl} alt={cand.name} className="w-full h-full object-cover" />
                            ) : (
                              cand.name.split(' ').map(n=>n[0]).join('').slice(0,2)
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-heading">{cand.name}</p>
                            <p className="text-[11px] text-muted">{cand.email || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-3 text-sm text-body">{cand.role}</td>
                      <td className="px-8 py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-input text-[10px] font-medium ${STAGE_COLORS[stageLabel] || 'bg-surface-active text-body'}`}>
                          {stageLabel}
                        </span>
                      </td>
                      <td className="px-8 py-3 text-sm text-body-light text-right">
                        {cand.timeInStage || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </QueryState>
        </div>
      </div>

      {/* ── Right Side: Inspector Panel ── */}
      {selectedId && (
        <CandidateInspector
          candidate={selectedCandidate ? {
            ...selectedCandidate,
            avatar: selectedCandidate.avatarUrl,
            profile: {
              location: selectedCandidate.location,
              email: selectedCandidate.email,
              currentRole: selectedCandidate.currentRole,
              experience: selectedCandidate.experience,
              source: selectedCandidate.source,
            },
            activity: [],
          } : null}
          canWrite={canWrite}
          onClose={() => setSelectedId(null)}
        />
      )}

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
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Jordan Blake"
              className="w-full px-3 py-2 text-sm border border-border-default rounded-input bg-surface-raised focus:outline-none focus:border-border-strong focus:ring-4 focus:ring-border-subtle transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Role <span className="text-danger">*</span></label>
            <input
              type="text"
              value={form.role}
              onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
              placeholder="e.g. Frontend Engineer"
              className="w-full px-3 py-2 text-sm border border-border-default rounded-input bg-surface-raised focus:outline-none focus:border-border-strong focus:ring-4 focus:ring-border-subtle transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="jordan@example.com"
              className="w-full px-3 py-2 text-sm border border-border-default rounded-input bg-surface-raised focus:outline-none focus:border-border-strong focus:ring-4 focus:ring-border-subtle transition-all"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="e.g. Remote"
                className="w-full px-3 py-2 text-sm border border-border-default rounded-input bg-surface-raised focus:outline-none focus:border-border-strong focus:ring-4 focus:ring-border-subtle transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Source</label>
              <input
                type="text"
                value={form.source}
                onChange={(e) => setForm(f => ({ ...f, source: e.target.value }))}
                placeholder="e.g. LinkedIn"
                className="w-full px-3 py-2 text-sm border border-border-default rounded-input bg-surface-raised focus:outline-none focus:border-border-strong focus:ring-4 focus:ring-border-subtle transition-all"
              />
            </div>
          </div>
          {formError && <p className="text-xs text-danger">{formError}</p>}
        </div>
      </FormDialog>

    </div>
  )
}
