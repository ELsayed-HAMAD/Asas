import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  ChevronDown,
  Rocket,
  Clock,
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
import { formatDate, shortId } from '../../../lib/format';
import { selectActiveSprint } from '../../../lib/projectSprint';
import PageHeader from '../../../components/common/PageHeader';
import PageToolbar from '../../../components/common/PageToolbar';
import GroupedList from '../../../components/common/GroupedList';
import SidePanelSection from '../../../components/common/SidePanelSection';
import FormDialog from '../../../components/common/FormDialog';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';

export default function ActiveSprints() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [selectedSprintId, setSelectedSprintId] = useState(null);
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState('status');
  const [searchParams, setSearchParams] = useSearchParams();
  const [issueOpen, setIssueOpen] = useState(false);
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setIssueOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [issueTitle, setIssueTitle] = useState('');
  const [issueStoryPoints, setIssueStoryPoints] = useState('');
  const [newChecklistText, setNewChecklistText] = useState('');
  const [commentText, setCommentText] = useState('');

  const { data: sprintsData, isLoading, isError } = useQuery({
    queryKey: queryKeys.projects.sprints.list({}),
    queryFn: projectsApi.getSprints,
  });

  // A Sprint does not embed its issues on the wire, so the board is a second read
  // scoped to the selected (first) sprint.
  const sprints = sprintsData?.items || [];
  const defaultSprint = selectActiveSprint(sprints);
  const activeSprint = (selectedSprintId ? sprints.find(s => s.id === selectedSprintId) : null) || defaultSprint;

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
    onSuccess: () => {
      setSelectedSprintId(null);
      setCompleteConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() });
    },
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
  const createChecklistMutation = useMutation({
    mutationFn: (text) => projectsApi.createChecklistItem(selectedId, { text }),
    onSuccess: () => {
      setNewChecklistText('');
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.issues.all() });
    },
  });
  const updateChecklistMutation = useMutation({
    mutationFn: ({ itemId, done }) => projectsApi.updateChecklistItem(selectedId, itemId, { done }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.issues.all() });
    },
  });
  const deleteChecklistMutation = useMutation({
    mutationFn: (itemId) => projectsApi.deleteChecklistItem(selectedId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.issues.all() });
    },
  });
  const createCommentMutation = useMutation({
    mutationFn: (body) => projectsApi.createIssueComment(selectedId, { body }),
    onSuccess: () => {
      setCommentText('');
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.issues.all() });
    },
  });


  const allIssues = issuesData?.items || [];
  const issues = search.trim()
    ? allIssues.filter(i => (i.title || '').toLowerCase().includes(search.toLowerCase()) || (i.key || '').toLowerCase().includes(search.toLowerCase()))
    : allIssues;

  // Auto-select first issue if none selected
  useEffect(() => {
    if (!selectedId && issues.length > 0) {
      const firstActive = issues.find(i => i.status !== 'DONE');
      setSelectedId(firstActive ? firstActive.id : issues[0].id);
    } else if (issues.length === 0 && selectedId !== null) {
      setSelectedId(null);
    }
  }, [issues, selectedId]);

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

  const todoIssues = issues.filter(i => i.status === 'TODO');
  const inProgressIssues = issues.filter(i => i.status === 'IN_PROGRESS');
  const inReviewIssues = issues.filter(i => i.status === 'IN_REVIEW');
  const doneIssues = issues.filter(i => i.status === 'DONE');

  const urgentIssues = issues.filter(i => i.priority === 'URGENT' || i.priority === 'HIGH');
  const mediumIssues = issues.filter(i => i.priority === 'MEDIUM');
  const lowIssues = issues.filter(i => i.priority === 'LOW' || !['URGENT', 'HIGH', 'MEDIUM'].includes(i.priority));

  const dynamicCompletionPct = issues.length > 0 ? Math.round((doneIssues.length / issues.length) * 100) : 0;



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
        className={`group h-12 min-h-[48px] px-3 py-0 rounded-[10px] border-0 shadow-none flex items-center justify-between cursor-pointer transition-colors ${
          isSelected
            ? 'bg-accent-light/40 text-heading'
            : isDone
            ? 'hover:bg-surface-muted/60 opacity-60 hover:opacity-100'
            : 'hover:bg-surface-muted/60'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 pr-3">
          {isDone ? (
            <CheckSquare size={16} className="text-success shrink-0" />
          ) : issue.status === 'IN_PROGRESS' ? (
            <HalfCircleIcon className="w-4 h-4 text-info shrink-0" />
          ) : issue.status === 'IN_REVIEW' ? (
            <Eye size={16} className="text-warning shrink-0" />
          ) : (
            <Circle size={16} className="text-caption shrink-0" />
          )}
          <span
            className="text-xs font-medium text-muted shrink-0 tabular-nums"
            title={issue.id}
          >
            {shortId(issue.id)}
          </span>
          <span
            className={`text-sm font-medium text-heading truncate ${isDone ? 'line-through text-muted' : ''}`}
            title={issue.title}
          >
            {issue.key ? `${issue.key} ` : ''}{issue.title}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="w-14 min-w-[56px] flex items-center justify-center">
            {issue.tag ? (
              <Badge variant="outline" className="min-w-[44px] bg-surface-active/60 text-body px-2 py-0.5 rounded-full text-[11px] font-medium capitalize tracking-normal justify-center border-transparent">
                {issue.tag}
              </Badge>
            ) : null}
          </div>

          <div className="w-6 min-w-[24px] flex items-center justify-center">
            {!isDone && (
              issue.priority === 'HIGH' || issue.priority === 'URGENT' ? (
                <ChevronsUp size={16} className="text-danger shrink-0" strokeWidth={2.5} />
              ) : (
                <span className={`flex items-center justify-center transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 reveal-on-hover'}`}>
                  <Equal size={16} className="text-caption shrink-0" strokeWidth={2} />
                </span>
              )
            )}
          </div>

          <div className={`w-7 min-w-[28px] flex items-center justify-center transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 reveal-on-hover'}`}>
            {issue.assignees && issue.assignees.length > 0 ? (
              <div className="flex -space-x-1.5 overflow-hidden">
                {issue.assignees.slice(0, 3).map((a, idx) => (
                  <div
                    key={a.id || idx}
                    title={a.employee?.name || 'Assignee'}
                    className="w-6 h-6 rounded-full bg-surface-raised border border-border-default flex items-center justify-center text-[9px] font-medium text-heading overflow-hidden"
                  >
                    {a.employee?.avatarUrl ? (
                      <img src={a.employee.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (a.employee?.name || 'U').slice(0, 2).toUpperCase()
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div
                title="Unassigned"
                className="w-6 h-6 rounded-full bg-surface-active border border-border-default flex items-center justify-center text-[9px] text-muted font-medium"
              >
                —
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-0">

      {activeSprint ? (
        <>
          {/* ── Sprint Header (PageHeader) ── */}
          <PageHeader
            title={
              <div className="flex items-center gap-2">
                <Rocket size={18} className="text-body shrink-0" />
                {sprints.length > 1 ? (
                  <select
                    value={activeSprint.id}
                    onChange={(e) => setSelectedSprintId(e.target.value)}
                    className="bg-transparent font-medium text-heading border-none focus:outline-none cursor-pointer pr-1 text-lg"
                    aria-label="Select sprint"
                  >
                    {sprints.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.status})
                      </option>
                    ))}
                  </select>
                ) : (
                  <span>{activeSprint.name}</span>
                )}
                {activeSprint.status === 'ACTIVE' && (
                  <Badge variant="outline" className="bg-success-light text-success-text text-[11px] font-medium px-2 py-0.5 rounded-full border-success-border">
                    ACTIVE
                  </Badge>
                )}
              </div>
            }
            meta={
              <>
                <div className="flex items-center gap-1.5" title={activeSprint.endsAt ? formatDate(activeSprint.endsAt, { dateStyle: 'medium' }) : undefined}>
                  <Clock size={14} className="text-caption shrink-0" />
                  <span>
                    Time Remaining: {(() => {
                      if (!activeSprint.endsAt) return 'TBD'
                      const days = Math.ceil((new Date(activeSprint.endsAt).getTime() - Date.now()) / 86400000)
                      if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'} left`
                      if (days === 0) return 'Ends today'
                      return 'Past end date'
                    })()}
                  </span>
                </div>

                <div className="hidden sm:block w-px h-3.5 bg-border-default/60 shrink-0" />

                <div className="flex items-center gap-2">
                  <span>Completion: {activeSprint.completionPct ?? dynamicCompletionPct}%</span>
                  <div className="w-24 sm:w-36 bg-surface-strong rounded-full h-[5px] overflow-hidden shrink-0">
                    <div
                      className="bg-primary h-full rounded-full transition-all"
                      style={{ width: `${activeSprint.completionPct ?? dynamicCompletionPct}%` }}
                    />
                  </div>
                </div>
              </>
            }
            actions={
              <Button
                type="button"
                onClick={() => setCompleteConfirmOpen(true)}
                disabled={!activeSprint || activeSprint.status !== 'ACTIVE' || completeSprint.isPending}
                className="h-10 px-4 rounded-[10px] font-semibold shadow-sm whitespace-nowrap"
              >
                {completeSprint.isPending ? 'Completing...' : 'Complete Sprint'}
              </Button>
            }
            className="bg-surface mb-4"
          />

          {/* ── Main Split View ── */}
          <div className="flex-1 min-h-0 flex flex-col xl:flex-row gap-6 px-6 pb-6 overflow-hidden bg-surface">

            {/* Left: Issue List Area */}
            <div className="flex-1 min-w-0 h-full overflow-y-auto pr-1 scrollbar-soft">

              {/* a. Burndown: one 44px white strip when empty, 180px chart when points exist */}
              <div className="mb-4">
                {burndownLoading ? (
                  <div className="h-11 min-h-[44px] px-4 flex items-center justify-center text-xs text-muted bg-surface-raised border-0 rounded-[14px] shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                    Loading burndown…
                  </div>
                ) : burndownError ? (
                  <div className="h-11 min-h-[44px] px-4 flex items-center justify-center text-xs text-danger bg-surface-raised border-0 rounded-[14px] shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                    Burndown could not be loaded.
                  </div>
                ) : (!burndownData?.startDate || burndownData?.points?.length === 0) ? (
                  <div className="h-11 min-h-[44px] px-4 flex items-center justify-between gap-4 text-xs bg-surface-raised border-0 rounded-[14px] shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                    <span className="font-medium text-heading shrink-0">Sprint burndown</span>
                    <span className="text-muted text-center truncate">
                      {!burndownData?.startDate
                        ? 'Sprint start date is unknown, so no historical line is shown.'
                        : 'No issue history is available for this sprint yet.'}
                    </span>
                    {burndownData?.undatedCompleted > 0 ? (
                      <span className="text-caption shrink-0">
                        {burndownData.undatedCompleted} completed without a date
                      </span>
                    ) : (
                      <span className="shrink-0" />
                    )}
                  </div>
                ) : (
                  <section className="p-4 bg-surface-raised border-0 rounded-[14px] shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <h2 className="text-sm font-medium text-heading">Sprint burndown</h2>
                        <p className="text-xs text-muted mt-0.5">Remaining issues by recorded completion date</p>
                      </div>
                      {burndownData?.undatedCompleted > 0 && (
                        <span className="text-xs text-muted shrink-0">{burndownData.undatedCompleted} completed without a date</span>
                      )}
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={burndownData.points} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={date => date.slice(5)} tick={{ fill: 'var(--color-caption)', fontSize: 11 }} />
                        <YAxis allowDecimals={false} domain={[0, 'dataMax']} tick={{ fill: 'var(--color-caption)', fontSize: 11 }} />
                        <Tooltip labelFormatter={date => date} />
                        <Line type="monotone" dataKey="remaining" name="Remaining" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                        <Line type="linear" dataKey="ideal" name="Ideal" stroke="var(--color-caption)" strokeDasharray="4 4" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </section>
                )}
              </div>

              {/* b. Toolbar (PageToolbar) */}
              <PageToolbar
                className="mb-4 gap-4"
                left={
                  <>
                    <div className="relative flex-1 min-w-[160px] max-w-[260px]">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
                      <Input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search issues..."
                        aria-label="Search issues"
                        title="Search issues"
                        className="pl-9 pr-4 h-10 text-sm border-0 rounded-[10px] bg-surface-raised text-heading placeholder:text-caption shadow-[0_1px_2px_rgba(16,24,40,0.04)] w-full"
                      />
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setGroupBy(prev => prev === 'status' ? 'priority' : 'status')}
                      className="flex items-center gap-1.5 border-0 bg-surface-raised text-body px-3.5 h-10 rounded-[10px] text-xs font-medium hover:bg-surface-muted transition-colors shrink-0 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                      aria-label={`Group by ${groupBy === 'status' ? 'Status' : 'Priority'}`}
                    >
                      Group: {groupBy === 'status' ? 'Status' : 'Priority'} <ChevronDown size={13} className="text-caption" />
                    </Button>
                  </>
                }
                right={
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIssueOpen(true)}
                    disabled={!activeSprint || activeSprint.status !== 'ACTIVE'}
                    className="h-10 px-4 rounded-[10px] border-0 bg-surface-raised text-body text-sm font-medium hover:bg-surface-muted transition-colors shrink-0 shadow-[0_1px_2px_rgba(16,24,40,0.04)] whitespace-nowrap"
                  >
                    New Issue
                  </Button>
                }
              />

              {/* c. Issue list (GroupedList) */}
              {groupBy === 'priority' ? (
                <>
                  <GroupedList
                    title="Urgent & High"
                    count={urgentIssues.length}
                    dotColor="bg-danger"
                    isEmpty={urgentIssues.length === 0}
                    emptyMessage="No urgent issues."
                  >
                    {urgentIssues.map(issue => renderIssueRow(issue, issue.status === 'DONE'))}
                  </GroupedList>

                  <GroupedList
                    title="Medium"
                    count={mediumIssues.length}
                    dotColor="bg-warning"
                    isEmpty={mediumIssues.length === 0}
                    emptyMessage="No medium priority issues."
                  >
                    {mediumIssues.map(issue => renderIssueRow(issue, issue.status === 'DONE'))}
                  </GroupedList>

                  <GroupedList
                    title="Low"
                    count={lowIssues.length}
                    dotColor="bg-caption"
                    isEmpty={lowIssues.length === 0}
                    emptyMessage="No low priority issues."
                  >
                    {lowIssues.map(issue => renderIssueRow(issue, issue.status === 'DONE'))}
                  </GroupedList>
                </>
              ) : (
                <>
                  <GroupedList
                    title="Todo"
                    count={todoIssues.length}
                    dotColor="bg-caption"
                    isEmpty={todoIssues.length === 0}
                    emptyMessage="No issues in todo."
                  >
                    {todoIssues.map(issue => renderIssueRow(issue, false))}
                  </GroupedList>

                  <GroupedList
                    title="In Progress"
                    count={inProgressIssues.length}
                    dotColor="bg-info"
                    isEmpty={inProgressIssues.length === 0}
                    emptyMessage="No issues in progress."
                  >
                    {inProgressIssues.map(issue => renderIssueRow(issue, false))}
                  </GroupedList>

                  <GroupedList
                    title="In Review"
                    count={inReviewIssues.length}
                    dotColor="bg-warning"
                    isEmpty={inReviewIssues.length === 0}
                    emptyMessage="No issues in review."
                  >
                    {inReviewIssues.map(issue => renderIssueRow(issue, false))}
                  </GroupedList>

                  <GroupedList
                    title="Done"
                    count={doneIssues.length}
                    dotColor="bg-success"
                    isEmpty={doneIssues.length === 0}
                    emptyMessage="No completed issues."
                  >
                    {doneIssues.map(issue => renderIssueRow(issue, true))}
                  </GroupedList>
                </>
              )}
            </div>

            {/* Right: Detail Panel (One continuous white surface, radius 14px, 20px padding, soft shadow, no border) */}
            <div className="w-full xl:w-[clamp(340px,26vw,420px)] xl:flex-none h-full bg-surface-raised rounded-[14px] shadow-[0_1px_2px_rgba(16,24,40,0.04)] border-0 flex flex-col overflow-hidden">

              {selectedIssue ? (
                <>
                  {/* Details Scrollable Content: ONE continuous surface */}
                  <div className="flex-1 min-h-0 overflow-y-auto p-5 scrollbar-soft">

                    {/* Top Header Section */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className="text-xs font-medium text-muted tabular-nums"
                          title={selectedIssue.id}
                        >
                          {shortId(selectedIssue.id)}
                        </span>
                        <div className="flex items-center gap-1.5 text-caption">
                          <button disabled className="p-1 hover:text-body transition-colors disabled:opacity-60 cursor-not-allowed" aria-label="More options"><MoreHorizontal size={17} /></button>
                          <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)} className="h-7 w-7 text-caption hover:text-body" aria-label="Close detail panel"><X size={17} /></Button>
                        </div>
                      </div>

                      <h1 className="text-2xl font-medium text-heading leading-tight tracking-tight mb-3">
                        {selectedIssue.key ? `${selectedIssue.key}: ` : ''}{selectedIssue.title}
                      </h1>

                      {/* Status & Priority Tags */}
                      <div className="flex items-center gap-2">
                        {(() => {
                          const statusConfig = {
                            DONE: {
                              bg: 'bg-success-light text-success-text',
                              icon: <CheckSquare size={14} className="text-success shrink-0" />,
                            },
                            IN_PROGRESS: {
                              bg: 'bg-info-light text-info',
                              icon: <HalfCircleIcon className="w-3.5 h-3.5 text-info shrink-0" />,
                            },
                            IN_REVIEW: {
                              bg: 'bg-warning-light text-warning-text',
                              icon: <Eye size={14} className="text-warning shrink-0" />,
                            },
                            TODO: {
                              bg: 'bg-surface-active text-body',
                              icon: <Circle size={14} className="text-caption shrink-0" />,
                            },
                          };
                          const currentConfig = statusConfig[selectedIssue.status] || statusConfig.TODO;
                          return (
                            <label className={`inline-flex items-center gap-1.5 ${currentConfig.bg} px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer`}>
                              {currentConfig.icon}
                              <select
                                value={selectedIssue.status}
                                disabled={issueMutation.isPending}
                                onChange={event => issueMutation.mutate(event.target.value)}
                                className="bg-transparent uppercase outline-none cursor-pointer font-medium text-xs"
                              >
                                <option value="TODO" className="bg-surface-raised text-heading">To Do</option>
                                <option value="IN_PROGRESS" className="bg-surface-raised text-heading">In Progress</option>
                                <option value="IN_REVIEW" className="bg-surface-raised text-heading">In Review</option>
                                <option value="DONE" className="bg-surface-raised text-heading">Done</option>
                              </select>
                            </label>
                          );
                        })()}
                        {selectedIssue.priority === 'HIGH' || selectedIssue.priority === 'URGENT' ? (
                          <Badge variant="outline" className="gap-1 bg-danger-light text-danger-text px-2.5 py-1 rounded-full text-xs font-medium border-danger-border">
                            <ChevronsUp size={14} strokeWidth={2.5} /> High Priority
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    {/* Checklist Section - separated by hairline */}
                    <SidePanelSection
                      title="Checklist"
                      badge={selectedIssue.checklist?.length ? `(${selectedIssue.checklist.filter(c => c.done).length}/${selectedIssue.checklist.length})` : null}
                    >
                      <div className="space-y-2.5">
                        {(!selectedIssue.checklist || selectedIssue.checklist.length === 0) ? (
                          <div className="text-[13px] text-muted">No checklist items yet.</div>
                        ) : (
                          selectedIssue.checklist.map((item) => (
                            <div key={item.id} className="flex items-center justify-between group text-sm">
                              <label className="flex items-center gap-2.5 cursor-pointer select-none flex-1 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={item.done}
                                  onChange={(e) => updateChecklistMutation.mutate({ itemId: item.id, done: e.target.checked })}
                                  className="rounded border-border-default text-accent focus:ring-accent"
                                />
                                <span className={`truncate ${item.done ? "line-through text-muted" : "text-body font-normal"}`}>
                                  {item.text}
                                </span>
                              </label>
                              <button
                                type="button"
                                onClick={() => deleteChecklistMutation.mutate(item.id)}
                                className="opacity-0 group-hover:opacity-100 text-caption hover:text-danger p-1 transition-opacity cursor-pointer"
                                title="Delete item"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))
                        )}

                        {/* Inline Add Checklist Item (40px, rounded-[10px]) */}
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (newChecklistText.trim()) {
                              createChecklistMutation.mutate(newChecklistText.trim());
                            }
                          }}
                          className="pt-2 flex items-center gap-2"
                        >
                          <Input
                            type="text"
                            value={newChecklistText}
                            onChange={(e) => setNewChecklistText(e.target.value)}
                            placeholder="Add item..."
                            className="flex-1 bg-surface-muted/50 border-0 rounded-[10px] px-3.5 h-10 text-xs text-body"
                          />
                          <Button
                            type="submit"
                            disabled={!newChecklistText.trim() || createChecklistMutation.isPending}
                            className="px-4 h-10 bg-accent text-white rounded-[10px] text-xs font-medium hover:bg-accent-hover shrink-0"
                          >
                            Add
                          </Button>
                        </form>
                      </div>
                    </SidePanelSection>

                    {/* Activity Section - separated by hairline */}
                    <SidePanelSection title="Activity">
                      <div className="relative pl-1 space-y-3">
                        {(!selectedIssue.comments || selectedIssue.comments.length === 0) ? (
                          <div className="text-[13px] text-muted">No recent activity.</div>
                        ) : (
                          selectedIssue.comments.map((comment) => (
                            <div key={comment.id} className="relative text-sm">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-heading text-xs">
                                  {comment.authorName || 'Team Member'}
                                </span>
                                <span className="text-[11px] text-caption font-normal">
                                  {formatDate(comment.createdAt)}
                                </span>
                              </div>
                              <p className="text-body text-xs whitespace-pre-wrap font-normal">{comment.body}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </SidePanelSection>

                  </div>

                  {/* Comment Footer (Pinned with hairline above, 40px input, rounded-[10px]) */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (commentText.trim()) {
                        createCommentMutation.mutate(commentText.trim());
                      }
                    }}
                    className="p-4 bg-surface-raised border-t border-border-subtle/50 shrink-0"
                  >
                    <div className="relative">
                      <Input
                        type="text"
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                            e.preventDefault();
                            if (commentText.trim()) {
                              createCommentMutation.mutate(commentText.trim());
                            }
                          }
                        }}
                        placeholder="Write a comment..."
                        className="w-full bg-surface-muted/50 border-0 rounded-[10px] pl-3.5 pr-10 h-10 text-xs text-body placeholder:text-caption"
                      />
                      <button
                        type="submit"
                        disabled={!commentText.trim() || createCommentMutation.isPending}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-accent disabled:text-caption hover:opacity-80 transition-opacity p-1 cursor-pointer disabled:cursor-not-allowed"
                        title="Send comment (⌘+Enter)"
                        aria-label="Send comment"
                      >
                        {createCommentMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="h-full flex items-center justify-center p-6 text-center text-muted">
                  Select an issue from the list to view details
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center p-8 text-center text-muted">
          {isLoading ? 'Loading active sprint…' : isError ? 'Could not load sprint.' : 'No active sprint found.'}
        </div>
      )}
      <FormDialog open={issueOpen} onClose={() => setIssueOpen(false)} title="New issue" subtitle={activeSprint?.name} busy={createIssue.isPending} onConfirm={() => createIssue.mutate()} confirmLabel="Create issue">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-body">
            Issue title
            <Input required value={issueTitle} onChange={event => setIssueTitle(event.target.value)} className="mt-1 w-full" />
          </label>
          <label className="block text-sm font-medium text-body">
            Story points
            <Input type="number" min="0" max="1000" step="1" value={issueStoryPoints} onChange={event => setIssueStoryPoints(event.target.value)} className="mt-1 w-full" />
          </label>
        </div>
      </FormDialog>
      <ConfirmDialog
        open={completeConfirmOpen}
        onClose={() => setCompleteConfirmOpen(false)}
        onConfirm={() => {
          setCompleteConfirmOpen(false);
          completeSprint.mutate();
        }}
        title={`Complete ${activeSprint?.name}?`}
        description="This will mark the sprint as completed. Open issues will remain in their current state."
        confirmLabel="Complete Sprint"
        busy={completeSprint.isPending}
      />
    </div>
  );
}
