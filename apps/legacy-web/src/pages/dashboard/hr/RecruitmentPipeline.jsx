import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Search, Filter, Download, X, FileText,
  Clock, Calendar, CheckCircle2, UserPlus, ArrowRight,
  Briefcase, MapPin, Mail, Phone, Loader2,
} from 'lucide-react'
import { hrApi } from '../../../lib/api/hr'
import { queryKeys } from '../../../lib/queryKeys'

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

function CandidateInspector({ candidate, onClose }) {
  if (!candidate) return null
  const profile = candidate.profile || {}
  const activity = candidate.activity || []
  const avatar = candidate.avatar || initials(candidate.name)

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

          {/* Resume Card */}
          {profile.resume && (
            <div>
              <h4 className="text-[10px] font-semibold text-caption uppercase tracking-wider mb-3">Resume</h4>
              <div className="flex items-center justify-between p-3 rounded-card-sm border border-border-default bg-surface-muted group hover:bg-surface-raised hover:border-accent-light transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-surface-raised rounded-button border border-border-default group-hover:border-accent-light group-hover:text-accent transition-colors">
                    <FileText size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-heading">{profile.resume}</p>
                    <p className="text-[10px] text-muted mt-0.5">PDF • 1.2 MB</p>
                  </div>
                </div>
                <Download size={14} className="text-caption group-hover:text-accent transition-colors" />
              </div>
            </div>
          )}

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

// ── 3. Main View Component ──────────────────────────────────

export default function RecruitmentPipeline() {
  const [selectedId, setSelectedId] = useState(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.hr.candidates.list(),
    queryFn: () => hrApi.listCandidates({ limit: 100 }),
  })

  const candidates = data?.items || []

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

  // High-level stats from the stage tally; time-to-hire and offer-acceptance had no data source
  // in the old UI (hardcoded "mocked trend" strings) and are kept as-is.
  const totalActive = Object.entries(stageCounts)
    .filter(([code]) => code !== 'HIRED' && code !== 'REJECTED')
    .reduce((acc, [, count]) => acc + count, 0)
  const totalHired = stageCounts['HIRED'] || 0
  const timeToHire = '14d' // Mocked trend (no data source)
  const offerAcceptance = '85%' // Mocked trend (no data source)

  const displayStats = [
    { label: 'Active Candidates', value: totalActive, trend: 'up', sub: '+12% this month' },
    { label: 'Total Hired', value: totalHired, trend: 'up', sub: `+${Math.max(0, Math.floor(totalHired / 3))} this month` },
    { label: 'Avg Time to Hire', value: timeToHire, trend: 'down', sub: '-2 days vs avg' },
    { label: 'Offer Acceptance', value: offerAcceptance, trend: 'up', sub: '+5% vs avg' },
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
            <button disabled className="bg-primary text-white text-sm font-medium px-4 py-2 rounded-button hover:bg-primary-hover transition-colors flex items-center gap-2 disabled:opacity-60">
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
          {isLoading && (
            <div className="flex items-center justify-center p-10 text-muted">
              <Loader2 className="animate-spin mr-2" size={20} /> Loading candidates...
            </div>
          )}
          {isError && (
            <div className="p-10 text-danger">{error?.message || 'Error loading candidates'}</div>
          )}
          {!isLoading && candidates.length === 0 && (
            <div className="p-10 text-center text-muted">
              <p className="text-sm">No candidates found.</p>
              <p className="text-xs mt-2">Add a candidate or load the sample pack to see data.</p>
            </div>
          )}
          {candidates.length > 0 && (
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
          )}
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
              // The new wire carries a server preview *path* (or null), not a display filename;
              // the old UI showed a filename string, so surface the fixed CV name when present.
              resume: selectedCandidate.resumeUrl ? 'resume.pdf' : null,
            },
            activity: [],
          } : null}
          onClose={() => setSelectedId(null)}
        />
      )}

    </div>
  )
}
