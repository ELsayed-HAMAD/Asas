import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
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
  Loader2,
  LayoutGrid,
  List,
  BarChart3,
  AlertTriangle,
  Layers,
  Flame,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { projectsApi } from '../../../lib/api/projects';
import { queryKeys } from '../../../lib/queryKeys';
import { formatDate, shortId } from '../../../lib/format';
import { selectActiveSprint } from '../../../lib/projectSprint';
import FormDialog from '../../../components/common/FormDialog';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import SearchInput from '../../../components/common/SearchInput';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';

// Custom Icon for 'In Progress' (Half filled circle)
function HalfCircleIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a10 10 0 0 1 0 20Z" fill="currentColor" />
    </svg>
  );
}

// ── List View Status Group Card ──
function StatusGroupCard({
  title,
  count,
  dotColor = 'bg-slate-400',
  isEmpty = false,
  emptyMessage = 'No issues in this group.',
  children,
}) {
  return (
    <div className="bg-white/85 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-[0_2px_10px_-3px_rgba(15,23,42,0.03)] overflow-hidden">
      <div className="bg-slate-50/90 border-b border-slate-200/70 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
          <span className="text-xs font-semibold text-slate-700">{title}</span>
        </div>
        <span className="text-xs text-slate-400 font-medium">({count})</span>
      </div>
      {isEmpty ? (
        <div className="py-6 px-4 text-center text-xs text-slate-400">
          {emptyMessage}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Kanban Column Lane ──
function KanbanLane({
  title,
  count,
  totalCount,
  dotColor,
  barColor,
  children,
  emptyMessage = 'No issues in this stage',
}) {
  const sharePct = totalCount > 0 ? (count / totalCount) * 100 : 0;
  return (
    <div className="bg-slate-100/65 backdrop-blur-md border border-slate-200/70 rounded-2xl p-2.5 flex flex-col gap-2.5 min-h-[420px]">
      {/* Column Header */}
      <div className="px-1 pt-0.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">{title}</span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white border border-slate-200/80 text-slate-600">
            {count}
          </span>
        </div>
        {/* Stage share bar */}
        <div className="h-1 w-full rounded-full bg-slate-200/80 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${sharePct}%` }}
          />
        </div>
      </div>

      {/* Cards container */}
      <div className="flex flex-col gap-2.5 flex-1">
        {count === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400 font-medium border border-dashed border-slate-200/80 rounded-xl bg-white/40 flex items-center justify-center h-28">
            {emptyMessage}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// ── Kanban Ticket Card ──
function KanbanCard({ issue, isSelected, onClick }) {
  const isDone = issue.status === 'DONE';
  return (
    <div
      onClick={onClick}
      className={`bg-white/95 hover:bg-white border rounded-xl p-3 transition-all cursor-pointer space-y-2.5 ${
        isSelected
          ? 'border-indigo-400 ring-2 ring-indigo-500/30 shadow-md'
          : 'border-slate-200/80 shadow-[0_1px_4px_rgba(15,23,42,0.04)] hover:shadow-md'
      }`}
    >
      {/* Top Row: Issue Key on left, Type badge on right */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-900 tracking-tight">
          {issue.key || shortId(issue.id)}
        </span>
        {issue.tag ? (
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
            issue.tag.toLowerCase() === 'bug'
              ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
              : issue.tag.toLowerCase() === 'story'
              ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
              : 'bg-slate-100 text-slate-700 border border-slate-200/60'
          }`}>
            {issue.tag}
          </span>
        ) : null}
      </div>

      {/* Title */}
      <p
        className={`text-xs font-semibold text-slate-800 line-clamp-2 leading-relaxed ${isDone ? 'line-through text-slate-400' : ''}`}
        title={issue.title}
      >
        {issue.title}
      </p>

      {/* Bottom Row: Hash ID + Status icon on left, Priority icon + Assignee on right */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          {isDone ? (
            <CheckSquare size={13} className="text-emerald-600 shrink-0" />
          ) : issue.status === 'IN_PROGRESS' ? (
            <HalfCircleIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          ) : issue.status === 'IN_REVIEW' ? (
            <Eye size={13} className="text-amber-500 shrink-0" />
          ) : (
            <Circle size={13} className="text-slate-400 shrink-0" />
          )}
          <span className="text-[11px] font-mono text-slate-400 truncate" title={issue.id}>
            {shortId(issue.id)}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isDone && (
            issue.priority === 'HIGH' || issue.priority === 'URGENT' ? (
              <ChevronsUp size={14} className="text-rose-500 shrink-0" strokeWidth={2.5} title="High Priority" />
            ) : (
              <Equal size={14} className="text-slate-300 shrink-0" strokeWidth={2} title="Normal Priority" />
            )
          )}

          {issue.assignees && issue.assignees.length > 0 ? (
            <div className="flex -space-x-1 overflow-hidden shrink-0">
              {issue.assignees.slice(0, 1).map((a, idx) => (
                <div
                  key={a.id || idx}
                  title={a.employee?.name || 'Assignee'}
                  className="w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-700 overflow-hidden shadow-xs"
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
              className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[9px] text-slate-400 font-medium shrink-0"
            >
              —
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ActiveSprints() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [selectedSprintId, setSelectedSprintId] = useState(null);
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState('status');
  const [viewMode, setViewMode] = useState('board'); // 'board' | 'list' | 'insights'
  const [searchParams, setSearchParams] = useSearchParams();
  const [issueOpen, setIssueOpen] = useState(false);
  const hasAutoSelected = useRef(false);

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
  });

  const createIssue = useMutation({
    mutationFn: () => projectsApi.createIssue({
      title: issueTitle.trim(),
      sprintId: activeSprint.id,
      storyPoints: issueStoryPoints === '' ? null : Number(issueStoryPoints),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.issues.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.sprints.all() });
      setIssueOpen(false);
      setIssueTitle('');
      setIssueStoryPoints('');
    },
  });

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

  // Auto-select first issue only on initial load once so closing with X keeps it closed
  useEffect(() => {
    if (!hasAutoSelected.current && issues.length > 0) {
      hasAutoSelected.current = true;
      const firstActive = issues.find(i => i.status !== 'DONE');
      setSelectedId(firstActive ? firstActive.id : issues[0].id);
    }
  }, [issues]);

  // Clean up selection if the selected issue was deleted
  useEffect(() => {
    if (selectedId && !issues.some(i => i.id === selectedId)) {
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

  const totalIssuesCount = issues.length;
  const todoPct = totalIssuesCount > 0 ? (todoIssues.length / totalIssuesCount) * 100 : 0;
  const inProgPct = totalIssuesCount > 0 ? (inProgressIssues.length / totalIssuesCount) * 100 : 0;
  const inReviewPct = totalIssuesCount > 0 ? (inReviewIssues.length / totalIssuesCount) * 100 : 0;
  const donePct = totalIssuesCount > 0 ? (doneIssues.length / totalIssuesCount) * 100 : 0;

  const dynamicCompletionPct = totalIssuesCount > 0 ? Math.round((doneIssues.length / totalIssuesCount) * 100) : 0;
  const selectedIssue = issues.find(i => i.id === selectedId);

  // Issues by Type for Insights
  const bugIssues = issues.filter(i => (i.tag || '').toLowerCase() === 'bug');
  const storyIssues = issues.filter(i => (i.tag || '').toLowerCase() === 'story');
  const taskIssues = issues.filter(i => (i.tag || '').toLowerCase() === 'task' || !['bug', 'story'].includes((i.tag || '').toLowerCase()));

  // Stage with highest ticket count for Bottleneck analysis
  const stagesMetrics = [
    { name: 'Todo', count: todoIssues.length, color: 'text-slate-600', dot: 'bg-slate-400' },
    { name: 'In Progress', count: inProgressIssues.length, color: 'text-indigo-600', dot: 'bg-indigo-600' },
    { name: 'In Review', count: inReviewIssues.length, color: 'text-amber-600', dot: 'bg-amber-500' },
    { name: 'Done', count: doneIssues.length, color: 'text-emerald-600', dot: 'bg-emerald-500' },
  ];
  const bottleneckStage = stagesMetrics.reduce((max, s) => (s.count > max.count ? s : max), stagesMetrics[0]);
  const bottleneckPct = totalIssuesCount > 0 ? Math.round((bottleneckStage.count / totalIssuesCount) * 100) : 0;

  const renderIssueRow = (issue, isDone = false) => {
    const isSelected = selectedId === issue.id;
    return (
      <div
        key={issue.id}
        onClick={() => setSelectedId(issue.id)}
        className={`px-4 py-2.5 flex items-center justify-between gap-3 transition-colors hover:bg-slate-50/80 cursor-pointer ${
          isSelected
            ? 'bg-indigo-50/50'
            : isDone
            ? 'opacity-65 hover:opacity-100'
            : ''
        }`}
      >
        {/* Left side of row */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {isDone ? (
            <CheckSquare size={16} className="text-emerald-600 shrink-0" />
          ) : issue.status === 'IN_PROGRESS' ? (
            <HalfCircleIcon className="w-4 h-4 text-indigo-600 shrink-0" />
          ) : issue.status === 'IN_REVIEW' ? (
            <Eye size={16} className="text-amber-500 shrink-0" />
          ) : (
            <Circle size={16} className="text-slate-400 shrink-0" />
          )}
          <span
            className="text-xs font-mono text-slate-400 shrink-0"
            title={issue.id}
          >
            {shortId(issue.id)}
          </span>
          <span
            className={`text-sm font-semibold text-slate-800 truncate ${isDone ? 'line-through text-slate-400' : ''}`}
            title={issue.title}
          >
            {issue.key ? `${issue.key} ` : ''}{issue.title}
          </span>
        </div>

        {/* Right side of row (fixed slots for vertical alignment) */}
        <div className="flex items-center justify-end gap-2.5 shrink-0">
          {/* Type Badge (w-16 fixed width) */}
          {issue.tag ? (
            <span className={`w-16 text-center py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
              issue.tag.toLowerCase() === 'bug'
                ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
                : issue.tag.toLowerCase() === 'story'
                ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                : 'bg-slate-100 text-slate-700 border border-slate-200/60'
            }`}>
              {issue.tag}
            </span>
          ) : (
            <span className="w-16" />
          )}

          {/* Priority / Action slot (w-12 fixed width) */}
          <div className="w-12 flex items-center justify-end gap-1.5 shrink-0">
            {!isDone && (
              issue.priority === 'HIGH' || issue.priority === 'URGENT' ? (
                <ChevronsUp size={16} className="text-rose-500 shrink-0" strokeWidth={2.5} title="High Priority" />
              ) : (
                <Equal size={16} className="text-slate-300 shrink-0" strokeWidth={2} title="Normal Priority" />
              )
            )}

            {issue.assignees && issue.assignees.length > 0 ? (
              <div className="flex -space-x-1.5 overflow-hidden shrink-0">
                {issue.assignees.slice(0, 2).map((a, idx) => (
                  <div
                    key={a.id || idx}
                    title={a.employee?.name || 'Assignee'}
                    className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[9px] font-semibold text-slate-700 overflow-hidden shadow-xs"
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
                className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[9px] text-slate-400 font-medium shrink-0"
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
    <div className="flex-1 min-h-0 overflow-y-auto bg-surface-raised p-4 sm:p-6 space-y-4">
      {activeSprint ? (
        <>
          {/* ── 1. Top Sprint Command Header (Interactive & Scannable) ── */}
          <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-sm space-y-3">
            {/* Top Row: Sprint title/selector + Complete Sprint button */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="w-8 h-8 rounded-xl bg-slate-900/5 border border-slate-200/80 flex items-center justify-center text-slate-700 shrink-0">
                    <Rocket size={16} />
                  </div>
                  {sprints.length > 1 ? (
                    <Select
                      value={activeSprint.id}
                      onValueChange={(val) => setSelectedSprintId(val)}
                    >
                      <SelectTrigger
                        aria-label="Select sprint"
                        className="h-8 border-none bg-transparent font-bold text-slate-900 text-lg focus:ring-0 shadow-none px-1 tracking-tight inline-flex items-center gap-1.5 w-auto justify-start [&>span]:line-clamp-none"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {sprints.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} ({s.status})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-lg font-bold tracking-tight text-slate-900">{activeSprint.name}</span>
                  )}
                  {activeSprint.status === 'ACTIVE' && (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200/60 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                      ACTIVE
                    </Badge>
                  )}
                </div>

                {/* Metadata row with Live Stage Breakdown Pills */}
                <div className="flex items-center gap-3.5 text-xs text-slate-500 mt-1.5 flex-wrap">
                  <div className="flex items-center gap-1.5" title={activeSprint.endsAt ? formatDate(activeSprint.endsAt, { dateStyle: 'medium' }) : undefined}>
                    <Clock size={13} className="text-slate-400 shrink-0" />
                    <span>
                      Time Remaining: {(() => {
                        if (!activeSprint.endsAt) return 'TBD';
                        const days = Math.ceil((new Date(activeSprint.endsAt).getTime() - Date.now()) / 86400000);
                        if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'} left`;
                        if (days === 0) return 'Ends today';
                        return 'Past end date';
                      })()}
                    </span>
                  </div>

                  <div className="hidden sm:block h-3.5 w-px bg-slate-200 shrink-0" />

                  {/* Completion percentage + segmented progress bar */}
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-600">Completion: {activeSprint.completionPct ?? dynamicCompletionPct}%</span>
                    <div className="w-24 sm:w-28 h-2 bg-slate-100 rounded-full overflow-hidden shrink-0 flex">
                      <div style={{ width: `${donePct}%` }} className="bg-emerald-500 h-full transition-all duration-300" title={`Done: ${doneIssues.length}`} />
                      <div style={{ width: `${inReviewPct}%` }} className="bg-amber-400 h-full transition-all duration-300" title={`In Review: ${inReviewIssues.length}`} />
                      <div style={{ width: `${inProgPct}%` }} className="bg-indigo-500 h-full transition-all duration-300" title={`In Progress: ${inProgressIssues.length}`} />
                      <div style={{ width: `${todoPct}%` }} className="bg-slate-300 h-full transition-all duration-300" title={`Todo: ${todoIssues.length}`} />
                    </div>
                  </div>

                  <div className="hidden md:block h-3.5 w-px bg-slate-200 shrink-0" />

                  {/* Live Stage Breakdown Pills */}
                  <div className="hidden md:flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200/60" title="Todo issues">
                      Todo: {todoIssues.length}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60" title="In Progress issues">
                      In Progress: {inProgressIssues.length}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60" title="In Review issues">
                      In Review: {inReviewIssues.length}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60" title="Done issues">
                      Done: {doneIssues.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Complete Sprint action button */}
              <Button
                type="button"
                onClick={() => setCompleteConfirmOpen(true)}
                disabled={!activeSprint || activeSprint.status !== 'ACTIVE' || completeSprint.isPending}
                className="h-9 px-4 rounded-xl text-xs sm:text-sm font-medium shadow-sm shrink-0 whitespace-nowrap"
              >
                {completeSprint.isPending ? 'Completing...' : 'Complete Sprint'}
              </Button>
            </div>

            {/* Integrated Burndown Strip */}
            <div>
              {burndownLoading ? (
                <div className="bg-slate-100/75 border border-slate-200/70 rounded-xl px-3.5 py-2 flex items-center justify-center text-xs text-slate-500">
                  Loading burndown…
                </div>
              ) : burndownError ? (
                <div className="bg-slate-100/75 border border-slate-200/70 rounded-xl px-3.5 py-2 flex items-center justify-center text-xs text-rose-500">
                  Burndown could not be loaded.
                </div>
              ) : (!burndownData?.startDate || burndownData?.points?.length === 0) ? (
                <section aria-label="Sprint burndown" className="bg-slate-100/75 border border-slate-200/70 rounded-xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 shrink-0">
                    <h2 className="text-xs font-semibold text-slate-700">Sprint burndown</h2>
                  </div>
                  <span className="flex-1 min-w-[240px] text-slate-500">
                    {!burndownData?.startDate
                      ? 'Sprint start date is unknown, so no historical line is shown.'
                      : 'No issue history is available for this sprint yet.'}
                  </span>
                  {burndownData?.undatedCompleted > 0 ? (
                    <span className="text-slate-500 font-medium shrink-0">
                      {burndownData.undatedCompleted} completed without a date
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setViewMode('insights')}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 shrink-0 ml-auto transition-colors cursor-pointer"
                  >
                    View Insights →
                  </button>
                </section>
              ) : (
                <section aria-label="Sprint burndown" className="bg-slate-100/60 border border-slate-200/70 rounded-xl p-3.5">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <h2 className="text-xs font-semibold text-slate-800">Sprint burndown</h2>
                      <p className="text-[11px] text-slate-500 mt-0.5">Remaining issues by recorded completion date</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {burndownData?.undatedCompleted > 0 && (
                        <span className="text-xs text-slate-500 shrink-0 font-medium">{burndownData.undatedCompleted} completed without a date</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setViewMode('insights')}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                      >
                        View Insights →
                      </button>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={burndownData.points} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={date => date.slice(5)} tick={{ fill: '#64748b', fontSize: 11 }} />
                      <YAxis allowDecimals={false} domain={[0, 'dataMax']} tick={{ fill: '#64748b', fontSize: 11 }} />
                      <Tooltip labelFormatter={date => date} />
                      <Line type="monotone" dataKey="remaining" name="Remaining" stroke="#4f46e5" strokeWidth={2} dot={false} />
                      <Line type="linear" dataKey="ideal" name="Ideal" stroke="#94a3b8" strokeDasharray="4 4" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </section>
              )}
            </div>
          </div>

          {/* ── 2. Unified Action Toolbar + Apple Segmented View Switcher ── */}
          <div className="w-full bg-white/85 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-2.5 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)] flex flex-wrap items-center justify-between gap-3">
            {/* Left Cluster: Search + Grouping */}
            <div className="flex items-center gap-2.5 flex-1 min-w-[260px]">
              <SearchInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search issues..."
                aria-label="Search issues"
                title="Search issues"
                wrapperClassName="w-full sm:w-64 shrink-0"
              />

              {viewMode === 'list' && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setGroupBy(prev => prev === 'status' ? 'priority' : 'status')}
                  className="h-9 px-3.5 rounded-xl bg-slate-100/75 hover:bg-slate-100 border border-slate-200/70 text-xs sm:text-sm font-medium text-slate-700 shrink-0 transition-all inline-flex items-center gap-1.5 shadow-none"
                  aria-label={`Group by ${groupBy === 'status' ? 'Status' : 'Priority'}`}
                >
                  Group: {groupBy === 'status' ? 'Status' : 'Priority'} <ChevronDown size={13} className="text-slate-400" />
                </Button>
              )}
            </div>

            {/* Center/Right Cluster: Apple Segmented Switcher + New Issue */}
            <div className="flex items-center gap-2.5 shrink-0 ml-auto">
              {/* Apple-Style Segmented View Switcher */}
              <div className="bg-slate-100/90 p-1 rounded-xl border border-slate-200/60 inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setViewMode('board')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'board'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                  aria-label="Board view"
                >
                  <LayoutGrid size={13} />
                  <span>Board</span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                  aria-label="List view"
                >
                  <List size={13} />
                  <span>List</span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('insights')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'insights'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                  aria-label="Insights view"
                >
                  <BarChart3 size={13} />
                  <span>Insights</span>
                </button>
              </div>

              {/* + New Issue button */}
              <Button
                type="button"
                onClick={() => setIssueOpen(true)}
                disabled={!activeSprint || activeSprint.status !== 'ACTIVE'}
                className="h-9 px-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/90 shadow-sm text-xs sm:text-sm font-semibold text-slate-800 inline-flex items-center justify-center transition-all whitespace-nowrap"
              >
                New Issue
              </Button>
            </div>
          </div>

          {/* ── 3. Workspace Views (Board | List | Insights) ── */}

          {/* ════ MODE 1: BOARD VIEW (4-Column Horizontal Apple-Glass Kanban) ════ */}
          {viewMode === 'board' && (
            <div className={`grid grid-cols-1 ${selectedIssue ? 'lg:grid-cols-12' : ''} gap-4 items-start`}>
              {/* Kanban Lanes */}
              <div className={`${selectedIssue ? 'lg:col-span-8' : 'w-full'} min-w-0`}>
                <div className={`${selectedIssue ? 'overflow-x-auto pb-2' : ''}`}>
                  <div className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 items-start ${selectedIssue ? 'min-w-[640px]' : ''}`}>
                    {/* Lane 1: Todo */}
                    <KanbanLane
                      title="Todo"
                      count={todoIssues.length}
                      totalCount={totalIssuesCount}
                      dotColor="bg-slate-400"
                      barColor="bg-slate-400"
                      emptyMessage="No issues in Todo"
                    >
                      {todoIssues.map(issue => (
                        <KanbanCard
                          key={issue.id}
                          issue={issue}
                          isSelected={selectedId === issue.id}
                          onClick={() => setSelectedId(issue.id)}
                        />
                      ))}
                    </KanbanLane>

                    {/* Lane 2: In Progress */}
                    <KanbanLane
                      title="In Progress"
                      count={inProgressIssues.length}
                      totalCount={totalIssuesCount}
                      dotColor="bg-indigo-600"
                      barColor="bg-indigo-600"
                      emptyMessage="No issues In Progress"
                    >
                      {inProgressIssues.map(issue => (
                        <KanbanCard
                          key={issue.id}
                          issue={issue}
                          isSelected={selectedId === issue.id}
                          onClick={() => setSelectedId(issue.id)}
                        />
                      ))}
                    </KanbanLane>

                    {/* Lane 3: In Review */}
                    <KanbanLane
                      title="In Review"
                      count={inReviewIssues.length}
                      totalCount={totalIssuesCount}
                      dotColor="bg-amber-500"
                      barColor="bg-amber-500"
                      emptyMessage="No issues In Review"
                    >
                      {inReviewIssues.map(issue => (
                        <KanbanCard
                          key={issue.id}
                          issue={issue}
                          isSelected={selectedId === issue.id}
                          onClick={() => setSelectedId(issue.id)}
                        />
                      ))}
                    </KanbanLane>

                    {/* Lane 4: Done */}
                    <KanbanLane
                      title="Done"
                      count={doneIssues.length}
                      totalCount={totalIssuesCount}
                      dotColor="bg-emerald-500"
                      barColor="bg-emerald-500"
                      emptyMessage="No completed issues"
                    >
                      {doneIssues.map(issue => (
                        <KanbanCard
                          key={issue.id}
                          issue={issue}
                          isSelected={selectedId === issue.id}
                          onClick={() => setSelectedId(issue.id)}
                        />
                      ))}
                    </KanbanLane>
                  </div>
                </div>
              </div>

              {/* Sticky Inspector when an issue is selected */}
              {selectedIssue && (
                <div className="lg:col-span-4 lg:sticky lg:top-4 min-w-0">
                  <IssueInspector
                    selectedIssue={selectedIssue}
                    issueMutation={issueMutation}
                    createChecklistMutation={createChecklistMutation}
                    updateChecklistMutation={updateChecklistMutation}
                    deleteChecklistMutation={deleteChecklistMutation}
                    createCommentMutation={createCommentMutation}
                    newChecklistText={newChecklistText}
                    setNewChecklistText={setNewChecklistText}
                    commentText={commentText}
                    setCommentText={setCommentText}
                    onClose={() => setSelectedId(null)}
                  />
                </div>
              )}
            </div>
          )}

          {/* ════ MODE 2: LIST VIEW (Compact Grouped List) ════ */}
          {viewMode === 'list' && (
            <div className={`grid grid-cols-1 ${selectedIssue ? 'lg:grid-cols-12' : ''} gap-4 items-start`}>
              <div className={`${selectedIssue ? 'lg:col-span-8' : 'w-full'} space-y-3.5 min-w-0`}>
                {groupBy === 'priority' ? (
                  <div className="space-y-3.5">
                    <StatusGroupCard
                      title="Urgent & High"
                      count={urgentIssues.length}
                      dotColor="bg-rose-500"
                      isEmpty={urgentIssues.length === 0}
                      emptyMessage="No urgent issues."
                    >
                      {urgentIssues.map(issue => renderIssueRow(issue, issue.status === 'DONE'))}
                    </StatusGroupCard>

                    <StatusGroupCard
                      title="Medium"
                      count={mediumIssues.length}
                      dotColor="bg-amber-500"
                      isEmpty={mediumIssues.length === 0}
                      emptyMessage="No medium priority issues."
                    >
                      {mediumIssues.map(issue => renderIssueRow(issue, issue.status === 'DONE'))}
                    </StatusGroupCard>

                    <StatusGroupCard
                      title="Low"
                      count={lowIssues.length}
                      dotColor="bg-slate-400"
                      isEmpty={lowIssues.length === 0}
                      emptyMessage="No low priority issues."
                    >
                      {lowIssues.map(issue => renderIssueRow(issue, issue.status === 'DONE'))}
                    </StatusGroupCard>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    <StatusGroupCard
                      title="Todo"
                      count={todoIssues.length}
                      dotColor="bg-slate-400"
                      isEmpty={todoIssues.length === 0}
                      emptyMessage="No issues in todo."
                    >
                      {todoIssues.map(issue => renderIssueRow(issue, false))}
                    </StatusGroupCard>

                    <StatusGroupCard
                      title="In Progress"
                      count={inProgressIssues.length}
                      dotColor="bg-indigo-600"
                      isEmpty={inProgressIssues.length === 0}
                      emptyMessage="No issues in progress."
                    >
                      {inProgressIssues.map(issue => renderIssueRow(issue, false))}
                    </StatusGroupCard>

                    <StatusGroupCard
                      title="In Review"
                      count={inReviewIssues.length}
                      dotColor="bg-amber-500"
                      isEmpty={inReviewIssues.length === 0}
                      emptyMessage="No issues in review."
                    >
                      {inReviewIssues.map(issue => renderIssueRow(issue, false))}
                    </StatusGroupCard>

                    <StatusGroupCard
                      title="Done"
                      count={doneIssues.length}
                      dotColor="bg-emerald-500"
                      isEmpty={doneIssues.length === 0}
                      emptyMessage="No completed issues."
                    >
                      {doneIssues.map(issue => renderIssueRow(issue, true))}
                    </StatusGroupCard>
                  </div>
                )}
              </div>

              {/* Sticky Inspector when an issue is selected */}
              {selectedIssue && (
                <div className="lg:col-span-4 lg:sticky lg:top-4 min-w-0">
                  <IssueInspector
                    selectedIssue={selectedIssue}
                    issueMutation={issueMutation}
                    createChecklistMutation={createChecklistMutation}
                    updateChecklistMutation={updateChecklistMutation}
                    deleteChecklistMutation={deleteChecklistMutation}
                    createCommentMutation={createCommentMutation}
                    newChecklistText={newChecklistText}
                    setNewChecklistText={setNewChecklistText}
                    commentText={commentText}
                    setCommentText={setCommentText}
                    onClose={() => setSelectedId(null)}
                  />
                </div>
              )}
            </div>
          )}

          {/* ════ MODE 3: INSIGHTS VIEW (Visual Sprint Analytics Bento Grid) ════ */}
          {viewMode === 'insights' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
              {/* Card 1: Sprint Burndown & Completion Telemetry */}
              <div className="bg-gradient-to-b from-white/95 to-slate-50/70 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Burndown & Completion Telemetry
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 flex items-center justify-center">
                      <BarChart3 size={15} />
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                        {activeSprint.completionPct ?? dynamicCompletionPct}%
                      </span>
                      <span className="text-xs font-medium text-slate-500">
                        ({doneIssues.length} of {totalIssuesCount} issues done)
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 mt-1">
                      {!burndownData?.startDate
                        ? 'Sprint start date is unknown, so no historical line is shown.'
                        : 'Remaining issues by recorded completion date'}
                    </p>
                    {burndownData?.undatedCompleted > 0 && (
                      <p className="text-xs text-amber-600 font-medium mt-0.5">
                        {burndownData.undatedCompleted} completed without a date
                      </p>
                    )}
                  </div>
                </div>

                {/* Stage Funnel Telemetry */}
                <div className="space-y-2 pt-2 border-t border-slate-200/60">
                  <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    Stage Distribution
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-50/80 border border-slate-200/60 rounded-xl p-2.5">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Todo</span>
                      <span className="text-base font-bold text-slate-800">{todoIssues.length}</span>
                      <span className="text-[10px] text-slate-400 ml-1">({Math.round(todoPct)}%)</span>
                    </div>
                    <div className="bg-indigo-50/50 border border-indigo-200/50 rounded-xl p-2.5">
                      <span className="text-[10px] uppercase font-bold text-indigo-600 block">In Progress</span>
                      <span className="text-base font-bold text-indigo-700">{inProgressIssues.length}</span>
                      <span className="text-[10px] text-indigo-500 ml-1">({Math.round(inProgPct)}%)</span>
                    </div>
                    <div className="bg-amber-50/50 border border-amber-200/50 rounded-xl p-2.5">
                      <span className="text-[10px] uppercase font-bold text-amber-600 block">In Review</span>
                      <span className="text-base font-bold text-amber-700">{inReviewIssues.length}</span>
                      <span className="text-[10px] text-amber-500 ml-1">({Math.round(inReviewPct)}%)</span>
                    </div>
                    <div className="bg-emerald-50/50 border border-emerald-200/50 rounded-xl p-2.5">
                      <span className="text-[10px] uppercase font-bold text-emerald-600 block">Done</span>
                      <span className="text-base font-bold text-emerald-700">{doneIssues.length}</span>
                      <span className="text-[10px] text-emerald-500 ml-1">({Math.round(donePct)}%)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Issue Type Distribution (BUG vs STORY vs TASK) */}
              <div className="bg-gradient-to-b from-white/95 to-slate-50/70 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Issue Type Distribution
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 flex items-center justify-center">
                      <Layers size={15} />
                    </div>
                  </div>

                  <div className="mt-3">
                    <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                      {totalIssuesCount}
                    </span>
                    <span className="text-xs font-medium text-slate-500 ml-2">Total Sprint Issues</span>
                  </div>
                </div>

                {/* Type Breakdown Bars */}
                <div className="space-y-3 pt-2 border-t border-slate-200/60">
                  {/* BUG */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-rose-700 inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500" /> Bug
                      </span>
                      <span className="font-mono font-medium text-slate-600">
                        {bugIssues.length} ({totalIssuesCount > 0 ? Math.round((bugIssues.length / totalIssuesCount) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-rose-500 transition-all duration-300"
                        style={{ width: `${totalIssuesCount > 0 ? (bugIssues.length / totalIssuesCount) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* STORY */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-blue-700 inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500" /> Story
                      </span>
                      <span className="font-mono font-medium text-slate-600">
                        {storyIssues.length} ({totalIssuesCount > 0 ? Math.round((storyIssues.length / totalIssuesCount) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${totalIssuesCount > 0 ? (storyIssues.length / totalIssuesCount) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* TASK */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-slate-400" /> Task
                      </span>
                      <span className="font-mono font-medium text-slate-600">
                        {taskIssues.length} ({totalIssuesCount > 0 ? Math.round((taskIssues.length / totalIssuesCount) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-slate-400 transition-all duration-300"
                        style={{ width: `${totalIssuesCount > 0 ? (taskIssues.length / totalIssuesCount) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Stage Bottleneck & Priority Breakdown */}
              <div className="bg-gradient-to-b from-white/95 to-slate-50/70 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Bottleneck & Priority Breakdown
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center">
                      <AlertTriangle size={15} />
                    </div>
                  </div>

                  {/* Bottleneck Alert */}
                  <div className="mt-3 p-3 rounded-xl bg-amber-50/70 border border-amber-200/60 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 text-amber-800 font-bold">
                      <Flame size={14} className="text-amber-600" />
                      <span>Stage Concentration Alert</span>
                    </div>
                    <p className="text-amber-700 leading-relaxed">
                      <span className="font-semibold">{bottleneckStage.name}</span> holds{' '}
                      <span className="font-bold">{bottleneckStage.count}</span> of {totalIssuesCount} tickets ({bottleneckPct}% of active sprint).
                    </p>
                  </div>
                </div>

                {/* Priority Breakdown */}
                <div className="space-y-2 pt-2 border-t border-slate-200/60 text-xs">
                  <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">
                    Priority Breakdown
                  </span>
                  <div className="flex items-center justify-between bg-slate-50/80 border border-slate-200/60 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ChevronsUp size={14} className="text-rose-500" strokeWidth={2.5} />
                      <span className="font-medium text-slate-700">Urgent & High</span>
                    </div>
                    <span className="font-bold text-rose-600">{urgentIssues.length} tickets</span>
                  </div>

                  <div className="flex items-center justify-between bg-slate-50/80 border border-slate-200/60 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Equal size={14} className="text-slate-400" strokeWidth={2} />
                      <span className="font-medium text-slate-700">Normal & Low</span>
                    </div>
                    <span className="font-bold text-slate-700">{mediumIssues.length + lowIssues.length} tickets</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center p-8 text-center text-muted">
          {isLoading ? 'Loading active sprint…' : isError ? 'Could not load sprint.' : 'No active sprint found.'}
        </div>
      )}

      {/* New Issue Dialog */}
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

      {/* Complete Sprint Dialog */}
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

// ── Docked / Sticky Issue Inspector Component ──
function IssueInspector({
  selectedIssue,
  issueMutation,
  createChecklistMutation,
  updateChecklistMutation,
  deleteChecklistMutation,
  createCommentMutation,
  newChecklistText,
  setNewChecklistText,
  commentText,
  setCommentText,
  onClose,
}) {
  return (
    <div className="bg-gradient-to-b from-white/95 to-slate-50/70 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-5 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.06),inset_0_1px_0_0_rgba(255,255,255,0.9)] space-y-4">
      {/* Top Header Section */}
      <div>
        <div className="flex items-center justify-between mb-2 text-xs text-slate-400 font-mono">
          <span
            className="tabular-nums"
            title={selectedIssue.id}
          >
            {shortId(selectedIssue.id)}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled
              className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 disabled:opacity-60 cursor-not-allowed"
              aria-label="More options"
            >
              <MoreHorizontal size={15} />
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center p-0 cursor-pointer"
              aria-label="Close detail panel"
            >
              <X size={15} />
            </Button>
          </div>
        </div>

        <h1 className="text-xl font-bold tracking-tight text-slate-900 mt-1 leading-snug">
          {selectedIssue.key ? `${selectedIssue.key}: ` : ''}{selectedIssue.title}
        </h1>

        {/* Status & Priority */}
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          {(() => {
            const statusConfig = {
              DONE: {
                bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
                icon: <CheckSquare size={13} className="text-emerald-600 shrink-0" />,
              },
              IN_PROGRESS: {
                bg: 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
                icon: <HalfCircleIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />,
              },
              IN_REVIEW: {
                bg: 'bg-amber-50 text-amber-700 border-amber-200/60',
                icon: <Eye size={13} className="text-amber-600 shrink-0" />,
              },
              TODO: {
                bg: 'bg-slate-100 text-slate-700 border-slate-200/60',
                icon: <Circle size={13} className="text-slate-400 shrink-0" />,
              },
            };
            const currentConfig = statusConfig[selectedIssue.status] || statusConfig.TODO;
            return (
              <Select
                value={selectedIssue.status}
                disabled={issueMutation.isPending}
                onValueChange={val => issueMutation.mutate(val)}
              >
                <SelectTrigger
                  aria-label="Issue status"
                  className={`h-8 w-auto inline-flex items-center gap-1.5 ${currentConfig.bg} px-3 rounded-xl text-xs font-semibold border shadow-none focus:ring-1 focus:ring-indigo-500 cursor-pointer`}
                >
                  {currentConfig.icon}
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODO">To Do</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="IN_REVIEW">In Review</SelectItem>
                  <SelectItem value="DONE">Done</SelectItem>
                </SelectContent>
              </Select>
            );
          })()}

          {selectedIssue.priority === 'HIGH' || selectedIssue.priority === 'URGENT' ? (
            <Badge variant="outline" className="gap-1 bg-rose-50 text-rose-700 border-rose-200/60 px-2.5 py-1 rounded-full text-xs font-medium">
              <ChevronsUp size={13} strokeWidth={2.5} /> High Priority
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Checklist Section */}
      <div className="border-t border-slate-200/60 pt-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Checklist {selectedIssue.checklist?.length ? `(${selectedIssue.checklist.filter(c => c.done).length}/${selectedIssue.checklist.length})` : ''}
          </h3>
        </div>

        <div className="space-y-1.5">
          {(!selectedIssue.checklist || selectedIssue.checklist.length === 0) ? (
            <div className="bg-slate-50/80 border border-slate-200/50 rounded-xl px-3 py-2 text-xs text-slate-500">
              No checklist items yet.
            </div>
          ) : (
            selectedIssue.checklist.map((item) => (
              <div key={item.id} className="flex items-center justify-between group text-xs bg-slate-50/60 hover:bg-slate-50 border border-slate-200/50 rounded-xl px-3 py-2 transition-colors">
                <label className="flex items-center gap-2.5 cursor-pointer select-none flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={(e) => updateChecklistMutation.mutate({ itemId: item.id, done: e.target.checked })}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                  />
                  <span className={`truncate text-xs ${item.done ? "line-through text-slate-400" : "text-slate-700 font-medium"}`}>
                    {item.text}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => deleteChecklistMutation.mutate(item.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 p-0.5 transition-opacity cursor-pointer ml-2"
                  title="Delete item"
                >
                  <X size={14} />
                </button>
              </div>
            ))
          )}

          {/* Add item row */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newChecklistText.trim()) {
                createChecklistMutation.mutate(newChecklistText.trim());
              }
            }}
            className="flex items-center gap-2 pt-1"
          >
            <Input
              type="text"
              value={newChecklistText}
              onChange={(e) => setNewChecklistText(e.target.value)}
              placeholder="Add item..."
              className="flex-1 h-8.5 px-3 rounded-xl bg-white border border-slate-200/80 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <Button
              type="submit"
              disabled={!newChecklistText.trim() || createChecklistMutation.isPending}
              className="h-8.5 px-3.5 rounded-xl text-xs font-semibold shrink-0 cursor-pointer"
            >
              Add
            </Button>
          </form>
        </div>
      </div>

      {/* Activity & Comments Section */}
      <div className="border-t border-slate-200/60 pt-3.5 space-y-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Activity
        </h3>

        <div className="space-y-2">
          {(!selectedIssue.comments || selectedIssue.comments.length === 0) ? (
            <div className="bg-slate-50/80 border border-slate-200/50 rounded-xl px-3 py-2 text-xs text-slate-500">
              No recent activity.
            </div>
          ) : (
            selectedIssue.comments.map((comment) => (
              <div key={comment.id} className="bg-slate-50/60 border border-slate-200/50 rounded-xl p-3 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-800 text-xs">
                    {comment.authorName || 'Team Member'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {formatDate(comment.createdAt)}
                  </span>
                </div>
                <p className="text-slate-600 text-xs whitespace-pre-wrap">{comment.body}</p>
              </div>
            ))
          )}
        </div>

        {/* Write comment input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (commentText.trim()) {
              createCommentMutation.mutate(commentText.trim());
            }
          }}
          className="pt-1"
        >
          <div className="relative flex items-center">
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
              className="w-full h-9 pl-3.5 pr-9 rounded-xl bg-white border border-slate-200/80 text-xs text-slate-700 placeholder:text-slate-400 shadow-inner focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <Button
              variant="ghost"
              size="icon"
              type="submit"
              disabled={!commentText.trim() || createCommentMutation.isPending}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 hover:text-slate-600 p-0 disabled:opacity-40 cursor-pointer"
              title="Send comment (⌘+Enter)"
              aria-label="Send comment"
            >
              {createCommentMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
