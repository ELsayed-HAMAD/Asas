import React, { useState } from 'react';
import {
  Search,
  ChevronDown,
  Rocket,
  Clock,
  Bell,
  MoreHorizontal,
  X,
  Circle,
  CheckSquare,
  Eye,
  ChevronsUp,
  Equal,
  Send,
  Loader2
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { projectsApi } from '../../../lib/api/projects';
import { queryKeys } from '../../../lib/queryKeys';
import { formatDate } from '../../../lib/format';
import { selectActiveSprint } from '../../../lib/projectSprint';
import TopBarActions from '../../../components/TopBarActions';
import FormDialog from '../../../components/common/FormDialog';

export default function ActiveSprints() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState('status');
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueTitle, setIssueTitle] = useState('');
  const [issueStoryPoints, setIssueStoryPoints] = useState('');

  const { data: sprintsData, isLoading, isError } = useQuery({
    queryKey: queryKeys.projects.sprints.list({}),
    queryFn: projectsApi.getSprints,
  });

  // A Sprint does not embed its issues on the wire, so the board is a second read
  // scoped to the selected (first) sprint.
  const sprints = sprintsData?.items || [];
  const activeSprint = selectActiveSprint(sprints);

  const { data: issuesData } = useQuery({
    queryKey: queryKeys.projects.issues.list({ sprintId: activeSprint?.id }),
    queryFn: () => projectsApi.getIssues(activeSprint.id),
    enabled: !!activeSprint?.id,
  });
  const { data: burndownData, isLoading: burndownLoading, isError: burndownError } = useQuery({
    queryKey: queryKeys.projects.burndown(activeSprint?.id, { limit: 90 }),
    queryFn: () => projectsApi.getBurndown(activeSprint.id, { limit: 90 }),
    enabled: !!activeSprint?.id,
  });

  const issueMutation = useMutation({
    mutationFn: (status) => projectsApi.updateIssue(selectedId, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects.issues.all() }),
  });
  const completeSprint = useMutation({
    mutationFn: () => projectsApi.updateSprint(activeSprint.id, { status: 'COMPLETED' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() }),
  })
  const createIssue = useMutation({
    mutationFn: () => projectsApi.createIssue({ title: issueTitle.trim(), sprintId: activeSprint.id, storyPoints: issueStoryPoints === '' ? null : Number(issueStoryPoints) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.issues.all() })
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.sprints.all() })
      setIssueOpen(false)
      setIssueTitle('')
      setIssueStoryPoints('')
    },
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  if (isError || !sprintsData) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised text-danger">
        Failed to load active sprints.
      </div>
    );
  }

  const allIssues = issuesData?.items || [];
  const issues = search.trim()
    ? allIssues.filter(i => (i.title || '').toLowerCase().includes(search.toLowerCase()) || (i.key || '').toLowerCase().includes(search.toLowerCase()))
    : allIssues;

  const todoIssues = issues.filter(i => i.status === 'TODO');
  const inProgressIssues = issues.filter(i => i.status === 'IN_PROGRESS');
  const inReviewIssues = issues.filter(i => i.status === 'IN_REVIEW');
  const doneIssues = issues.filter(i => i.status === 'DONE');

  const urgentIssues = issues.filter(i => i.priority === 'URGENT' || i.priority === 'HIGH');
  const mediumIssues = issues.filter(i => i.priority === 'MEDIUM');
  const lowIssues = issues.filter(i => i.priority === 'LOW' || !['URGENT', 'HIGH', 'MEDIUM'].includes(i.priority));

  const dynamicCompletionPct = issues.length > 0 ? Math.round((doneIssues.length / issues.length) * 100) : 0;

  // Auto-select first issue if none selected
  if (!selectedId && issues.length > 0) {
    // Try to select the first non-done issue, otherwise just the first issue
    const firstActive = issues.find(i => i.status !== 'DONE');
    setSelectedId(firstActive ? firstActive.id : issues[0].id);
  }

  const selectedIssue = issues.find(i => i.id === selectedId);
  // Custom Icon for 'In Progress' (Half filled circle)
  const HalfCircleIcon = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a10 10 0 0 1 0 20Z" fill="currentColor" />
    </svg>
  );

  const renderIssueRow = (issue, isDone = false) => {
    const isSelected = selectedId === issue.id;
    return (
      <div
        key={issue.id}
        onClick={() => setSelectedId(issue.id)}
        className={`flex items-center justify-between p-3 rounded-button border cursor-pointer transition-colors ${
          isSelected
            ? 'bg-accent-light/30 border-accent-light border-l-4 border-l-blue-600 shadow-card'
            : isDone
            ? 'bg-surface-raised border-border-default hover:border-border-strong border-l-4 border-l-transparent shadow-card opacity-60 hover:opacity-100'
            : 'bg-surface-raised border-border-default hover:border-border-strong border-l-4 border-l-transparent shadow-card'
        }`}
      >
        <div className="flex items-center gap-3">
          {isDone ? (
            <CheckSquare size={20} className="text-success" />
          ) : issue.status === 'IN_PROGRESS' ? (
            <HalfCircleIcon className="w-5 h-5 text-[#3b82f6]" />
          ) : issue.status === 'IN_REVIEW' ? (
            <Eye size={20} className="text-[#eab308]" />
          ) : (
            <Circle size={20} className="text-faint" />
          )}
          <span className={`text-sm font-medium text-muted ${isDone ? 'line-through' : ''}`}>
            {issue.key || issue.id.substring(issue.id.length - 8)}
          </span>
          <span className={`text-sm font-bold text-heading ml-1 ${isDone ? 'line-through' : ''}`}>
            {issue.title}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {issue.tag && (
            <span className="bg-surface-active text-body-light px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider">
              {issue.tag}
            </span>
          )}
          {!isDone && (
            issue.priority === 'HIGH' || issue.priority === 'URGENT' ? (
              <ChevronsUp size={16} className="text-danger" strokeWidth={3} />
            ) : (
              <Equal size={16} className="text-caption" strokeWidth={3} />
            )
          )}
          <div className="w-6 h-6 rounded-full bg-surface-active border border-border-default" />
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-[1000px]">

      <TopBarActions>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search issues..."
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-muted w-72 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          <button
            type="button"
            onClick={() => setIssueOpen(true)}
            disabled={!activeSprint || activeSprint.status !== 'ACTIVE'}
            className="bg-surface-raised border border-border-default text-body px-3 py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors disabled:opacity-60 cursor-pointer"
          >
            New Issue
          </button>
          <button
            type="button"
            onClick={() => setGroupBy(prev => prev === 'status' ? 'priority' : 'status')}
            className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors cursor-pointer"
          >
            Group: {groupBy === 'status' ? 'Status' : 'Priority'} <ChevronDown size={14} className="text-caption" />
          </button>

          <button
            type="button"
            onClick={() => completeSprint.mutate()}
            disabled={!activeSprint || activeSprint.status !== 'ACTIVE' || completeSprint.isPending}
            className="bg-primary text-white px-4 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60 cursor-pointer"
          >
            {completeSprint.isPending ? 'Completing...' : 'Complete Sprint'}
          </button>
        </div>
      </TopBarActions>

      {activeSprint ? (
        <>
          {/* ── Sprint Info Bar ── */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border-default bg-surface-raised flex-shrink-0 text-sm">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 font-bold text-heading">
                <Rocket size={16} className="text-body" />
                {activeSprint.name}
              </div>

              <div className="w-px h-4 bg-gray-300"></div>

              <div className="flex items-center gap-2 text-muted font-medium" title={activeSprint.endsAt ? formatDate(activeSprint.endsAt, { dateStyle: 'medium' }) : undefined}>
                <Clock size={16} className="text-caption" />
                Time Remaining: {(() => {
                  if (!activeSprint.endsAt) return 'TBD'
                  const days = Math.ceil((new Date(activeSprint.endsAt).getTime() - Date.now()) / 86400000)
                  if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'} left`
                  if (days === 0) return 'Ends today'
                  return 'Past end date'
                })()}
              </div>

              <div className="w-px h-4 bg-gray-300"></div>

              <div className="flex items-center gap-3">
                <span className="text-muted font-medium">Completion: {activeSprint.completionPct ?? dynamicCompletionPct}%</span>
                <div className="w-48 bg-surface-strong rounded-full h-1.5 overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{ width: `${activeSprint.completionPct ?? dynamicCompletionPct}%` }}></div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button className="text-muted hover:text-heading transition-colors">
                <Bell size={18} />
              </button>
              <div className="w-7 h-7 bg-surface-strong rounded-full border border-border-strong"></div>
            </div>
          </div>

          {/* ── Main Split View ── */}
          <div className="flex-1 flex overflow-hidden">

            {/* Left: Issue List Area */}
            <div className="flex-1 overflow-y-auto bg-surface p-6 space-y-6">
              <section className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h2 className="text-sm font-bold text-heading">Sprint burndown</h2>
                    <p className="text-xs text-muted mt-1">Remaining issues by recorded completion date</p>
                  </div>
                  {burndownData?.undatedCompleted > 0 && (
                    <span className="text-xs text-muted">{burndownData.undatedCompleted} completed without a date</span>
                  )}
                </div>
                {burndownLoading ? (
                  <div className="h-44 flex items-center justify-center text-sm text-muted">Loading burndown…</div>
                ) : burndownError ? (
                  <div className="h-44 flex items-center justify-center text-sm text-danger">Burndown could not be loaded.</div>
                ) : !burndownData?.startDate ? (
                  <div className="h-44 flex items-center justify-center text-sm text-muted">Sprint start date is unknown, so no historical line is shown.</div>
                ) : burndownData.points.length === 0 ? (
                  <div className="h-44 flex items-center justify-center text-sm text-muted">No issue history is available for this sprint yet.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={176}>
                    <LineChart data={burndownData.points} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={date => date.slice(5)} tick={{ fill: 'var(--color-caption)', fontSize: 11 }} />
                      <YAxis allowDecimals={false} domain={[0, 'dataMax']} tick={{ fill: 'var(--color-caption)', fontSize: 11 }} />
                      <Tooltip labelFormatter={date => date} />
                      <Line type="monotone" dataKey="remaining" name="Remaining" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                      <Line type="linear" dataKey="ideal" name="Ideal" stroke="var(--color-caption)" strokeDasharray="4 4" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </section>

              {groupBy === 'priority' ? (
                <>
                  {/* URGENT / HIGH GROUP */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-danger"></div>
                      <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider">
                        Urgent & High <span className="ml-1 text-caption font-medium">{urgentIssues.length}</span>
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {urgentIssues.length === 0 ? <div className="text-sm text-muted">No urgent issues.</div> : null}
                      {urgentIssues.map(issue => renderIssueRow(issue, issue.status === 'DONE'))}
                    </div>
                  </div>

                  {/* MEDIUM GROUP */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-[#eab308]"></div>
                      <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider">
                        Medium <span className="ml-1 text-caption font-medium">{mediumIssues.length}</span>
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {mediumIssues.length === 0 ? <div className="text-sm text-muted">No medium priority issues.</div> : null}
                      {mediumIssues.map(issue => renderIssueRow(issue, issue.status === 'DONE'))}
                    </div>
                  </div>

                  {/* LOW GROUP */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                      <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider">
                        Low <span className="ml-1 text-caption font-medium">{lowIssues.length}</span>
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {lowIssues.length === 0 ? <div className="text-sm text-muted">No low priority issues.</div> : null}
                      {lowIssues.map(issue => renderIssueRow(issue, issue.status === 'DONE'))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* TODO GROUP */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-transparent border-2 border-gray-400"></div>
                      <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider">
                        Todo <span className="ml-1 text-caption font-medium">{todoIssues.length}</span>
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {todoIssues.length === 0 ? <div className="text-sm text-muted">No issues in todo.</div> : null}
                      {todoIssues.map(issue => renderIssueRow(issue, false))}
                    </div>
                  </div>

                  {/* IN PROGRESS GROUP */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-[#3b82f6]"></div>
                      <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider">
                        In Progress <span className="ml-1 text-caption font-medium">{inProgressIssues.length}</span>
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {inProgressIssues.length === 0 ? <div className="text-sm text-muted">No issues in progress.</div> : null}
                      {inProgressIssues.map(issue => renderIssueRow(issue, false))}
                    </div>
                  </div>

                  {/* IN REVIEW GROUP */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-[#eab308]"></div>
                      <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider">
                        In Review <span className="ml-1 text-caption font-medium">{inReviewIssues.length}</span>
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {inReviewIssues.length === 0 ? <div className="text-sm text-muted">No issues in review.</div> : null}
                      {inReviewIssues.map(issue => renderIssueRow(issue, false))}
                    </div>
                  </div>

                  {/* DONE GROUP */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-success"></div>
                      <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider">
                        Done <span className="ml-1 text-caption font-medium">{doneIssues.length}</span>
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {doneIssues.length === 0 ? <div className="text-sm text-muted">No completed issues.</div> : null}
                      {doneIssues.map(issue => renderIssueRow(issue, true))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Right: Detail Panel */}
            <div className="w-[450px] bg-surface border-l border-border-default flex flex-col flex-shrink-0">

              {selectedIssue ? (
                <>
                  {/* Details Scrollable Content */}
                  <div className="flex-1 overflow-y-auto p-6">

                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-semibold text-muted">{selectedIssue.key || selectedIssue.id.substring(selectedIssue.id.length - 8)}</span>
                      <div className="flex items-center gap-2 text-caption">
                        <button disabled className="hover:text-body transition-colors disabled:opacity-60"><MoreHorizontal size={18} /></button>
                        <button onClick={() => setSelectedId(null)} className="hover:text-body transition-colors"><X size={18} /></button>
                      </div>
                    </div>

                    <h1 className="text-3xl font-extrabold text-heading leading-tight tracking-tight mb-4">
                      {selectedIssue.title}
                    </h1>

                    {/* Tags */}
                    <div className="flex items-center gap-2 mb-8">
                      <label className="inline-flex items-center gap-1.5 bg-[#eff6ff] text-[#3b82f6] px-2.5 py-1 rounded-full text-xs font-bold">
                        <HalfCircleIcon className="w-3.5 h-3.5" />
                        <select value={selectedIssue.status} disabled={issueMutation.isPending} onChange={event => issueMutation.mutate(event.target.value)} className="bg-transparent uppercase outline-none">
                          <option value="TODO">To Do</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="IN_REVIEW">In Review</option>
                          <option value="DONE">Done</option>
                        </select>
                      </label>
                      {selectedIssue.priority === 'HIGH' || selectedIssue.priority === 'URGENT' ? (
                        <span className="inline-flex items-center gap-1 bg-danger-light text-danger px-2.5 py-1 rounded-full text-xs font-bold">
                          <ChevronsUp size={14} strokeWidth={3} /> High Priority
                        </span>
                      ) : null}
                    </div>

                    {/* Checklist Box (Stub for now) */}
                    <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card mb-6">
                      <div className="flex items-center justify-between mb-5">
                        <h3 className="text-sm font-bold text-heading">Checklist</h3>
                      </div>

                      <div className="space-y-3">
                        <div className="text-sm text-muted">No checklist items yet.</div>
                      </div>
                    </div>

                    {/* Activity Feed Box */}
                    <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card">
                      <h3 className="text-sm font-bold text-heading mb-6">Activity</h3>

                      <div className="relative pl-4 space-y-8">
                        <div className="text-sm text-muted">No recent activity.</div>
                      </div>
                    </div>

                  </div>

                  {/* Comment Footer (Sticky) */}
                  <div className="p-6 bg-surface border-t border-border-default">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Add a comment... ⌘+Enter"
                        className="w-full bg-[#f1f5f9] border border-border-default rounded-button pl-4 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:bg-surface-raised transition-colors placeholder-gray-400"
                      />
                      <button disabled className="absolute right-3 top-1/2 -translate-y-1/2 text-caption hover:text-black transition-colors disabled:opacity-60">
                        <Send size={16} />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-muted">
                  Select an issue to view details.
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="flex h-full items-center justify-center bg-surface-raised text-muted">
          No active sprints found.
        </div>
      )}
      <FormDialog open={issueOpen} onClose={() => setIssueOpen(false)} title="New issue" subtitle={activeSprint?.name} busy={createIssue.isPending} onConfirm={() => createIssue.mutate()} confirmLabel="Create issue">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-body">Issue title<input required value={issueTitle} onChange={event => setIssueTitle(event.target.value)} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label>
          <label className="block text-sm font-medium text-body">Story points<input type="number" min="0" max="1000" step="1" value={issueStoryPoints} onChange={event => setIssueStoryPoints(event.target.value)} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label>
        </div>
      </FormDialog>
    </div>
  );
}
