import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronRight,
  ChevronDown,
  X,
  Folder,
  Edit2,
  Trash2,
  Loader2,
  Clock,
  List,
  Calendar,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../../../lib/api/projects';
import { queryKeys } from '../../../lib/queryKeys';
import { downloadRoadmapCsv } from '../../../lib/roadmapExport';
import FormDialog from '../../../components/common/FormDialog';
import SearchInput from '../../../components/common/SearchInput';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';

// Helper to compute Gantt timeline positioning based on the selected timeline scope
function getGanttPosition(task, phaseIndex, timelineScope = 'all') {
  let startDateStr = '2026-01-01T00:00:00Z';
  let endDateStr = '2026-08-31T23:59:59Z';

  if (timelineScope === 'h1') {
    startDateStr = '2026-01-01T00:00:00Z';
    endDateStr = '2026-06-30T23:59:59Z';
  } else if (timelineScope === 'h2') {
    startDateStr = '2026-07-01T00:00:00Z';
    endDateStr = '2026-12-31T23:59:59Z';
  } else if (timelineScope === 'q1') {
    startDateStr = '2026-01-01T00:00:00Z';
    endDateStr = '2026-03-31T23:59:59Z';
  } else if (timelineScope === 'q2') {
    startDateStr = '2026-04-01T00:00:00Z';
    endDateStr = '2026-06-30T23:59:59Z';
  } else if (timelineScope === 'q3') {
    startDateStr = '2026-07-01T00:00:00Z';
    endDateStr = '2026-09-30T23:59:59Z';
  } else if (timelineScope === 'q4') {
    startDateStr = '2026-10-01T00:00:00Z';
    endDateStr = '2026-12-31T23:59:59Z';
  }

  const timelineStart = new Date(startDateStr).getTime();
  const timelineEnd = new Date(endDateStr).getTime();
  const totalMs = timelineEnd - timelineStart;

  let startMs = task.startDate ? new Date(task.startDate).getTime() : null;
  let endMs = task.endDate ? new Date(task.endDate).getTime() : null;

  if (!startMs || isNaN(startMs)) {
    const offset = Math.min(phaseIndex * 0.22, 0.7);
    return { leftPct: offset * 100, widthPct: 18 };
  }
  if (!endMs || isNaN(endMs) || endMs <= startMs) {
    endMs = startMs + 30 * 24 * 60 * 60 * 1000;
  }

  const left = Math.max(0, Math.min(92, ((startMs - timelineStart) / totalMs) * 100));
  const right = Math.max(left + 6, Math.min(100, ((endMs - timelineStart) / totalMs) * 100));
  const width = Math.max(6, right - left);

  return { leftPct: left, widthPct: Math.min(width, 100 - left) };
}

// ── Unified Task Row with Priority Width for Title ──
function TaskRow({ task, isSelected, onClick }) {
  const statusStr = (task.statusLabel || 'PLANNED').toUpperCase();
  const isDone = statusStr === 'COMPLETED';
  const isInProgress = statusStr === 'IN_PROGRESS' || statusStr === 'IN PROGRESS';

  const dotColor = isDone
    ? 'bg-emerald-500'
    : isInProgress
    ? 'bg-indigo-600'
    : 'bg-slate-400';

  const badgeConfig = isDone
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
    : isInProgress
    ? 'bg-indigo-50 text-indigo-700 border-indigo-200/60'
    : 'bg-slate-100 text-slate-700 border-slate-200/60';

  const progressColor = isDone
    ? 'bg-emerald-500'
    : isInProgress
    ? 'bg-indigo-600'
    : 'bg-slate-400';

  const startFormatted = task.startDate
    ? new Date(task.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'TBD';
  const endFormatted = task.endDate
    ? new Date(task.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'TBD';

  return (
    <div
      onClick={onClick}
      className={`px-4 py-2.5 flex items-center justify-between gap-3 transition-colors hover:bg-slate-50/80 cursor-pointer ${
        isSelected ? 'bg-indigo-50/50' : ''
      }`}
    >
      {/* Left: Status dot + Code + Goal Title (Priority Width!) */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />

        {task.taskCode && (
          <span className="text-[11px] font-mono font-medium text-slate-400 shrink-0 tabular-nums">
            {task.taskCode}
          </span>
        )}

        <span
          className={`text-xs sm:text-sm font-semibold truncate ${
            isDone ? 'text-slate-600' : 'text-slate-800'
          }`}
          title={task.title}
        >
          {task.title}
        </span>
      </div>

      {/* Right Side: Aligned Fixed-Width Metadata Columns */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        {/* 1. Status Badge (w-20 fixed width) */}
        <span
          className={`w-20 text-center py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 border ${badgeConfig}`}
        >
          {task.statusLabel || (isDone ? 'Completed' : isInProgress ? 'In Progress' : 'Planned')}
        </span>

        {/* 2. Date Range (w-28 fixed width, hidden on small screens) */}
        <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-500 w-28 whitespace-nowrap shrink-0">
          <Clock size={12} className="text-slate-400 shrink-0" />
          <span className="truncate">
            {startFormatted} - {endFormatted}
          </span>
        </div>

        {/* 3. Progress Bar + Percentage (w-24 fixed width) */}
        <div className="w-20 sm:w-24 flex items-center gap-2 shrink-0">
          <div className="w-12 sm:w-14 bg-slate-100 rounded-full h-1.5 overflow-hidden shrink-0">
            <div
              className={`h-full rounded-full transition-all duration-300 ${progressColor}`}
              style={{ width: `${task.progressPct || 0}%` }}
            />
          </div>
          <span className="w-8 text-right text-xs font-semibold text-slate-700 tabular-nums shrink-0">
            {task.progressPct || 0}%
          </span>
        </div>

        {/* 4. Right Chevron (w-4) */}
        <ChevronRight
          size={16}
          className={`transition-colors shrink-0 ${
            isSelected ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-700'
          }`}
        />
      </div>
    </div>
  );
}

// ── Visual Timeline (Gantt) View ──
function GanttTimelineView({ phases, selectedId, onSelectTask, timelineScope = 'all' }) {
  const months = timelineScope === 'h2'
    ? ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    : timelineScope === 'h1'
    ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
    : timelineScope === 'q1'
    ? ['Jan', 'Feb', 'Mar']
    : timelineScope === 'q2'
    ? ['Apr', 'May', 'Jun']
    : timelineScope === 'q3'
    ? ['Jul', 'Aug', 'Sep']
    : timelineScope === 'q4'
    ? ['Oct', 'Nov', 'Dec']
    : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];

  return (
    <div className="bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)] overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          {/* Header Row: Task Name column + Months columns */}
          <div className="flex items-center bg-slate-50/90 border-b border-slate-200/70 text-xs font-semibold text-slate-600">
            <div className="w-56 sm:w-64 px-4 py-2.5 uppercase tracking-wider text-[11px] text-slate-500 border-r border-slate-200/70 shrink-0">
              Task Name
            </div>
            <div
              className="flex-1 divide-x divide-slate-200/50 text-center py-2.5"
              style={{ display: 'grid', gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
            >
              {months.map(m => (
                <div key={m} className="text-xs font-semibold text-slate-600">
                  {m} 2026
                </div>
              ))}
            </div>
          </div>

          {/* Phase groups */}
          {phases.map((phase, pIdx) => (
            <div key={phase.id} className="border-b border-slate-200/60 last:border-b-0">
              {/* Phase Header Lane */}
              <div className="flex items-center bg-slate-100/50 px-4 py-2 border-b border-slate-200/40">
                <div className="flex items-center gap-2">
                  <Folder size={14} className="text-slate-500" />
                  <span className="text-xs font-bold text-slate-900">{phase.title}</span>
                  <span className="text-[10px] text-slate-400 font-medium">({phase.tasks?.length || 0} tasks)</span>
                </div>
              </div>

              {/* Task Rows */}
              <div className="divide-y divide-slate-100/80">
                {(phase.tasks || []).map(task => {
                  const { leftPct, widthPct } = getGanttPosition(task, pIdx, timelineScope);
                  const isSelected = selectedId === task.id;
                  const isDone = (task.statusLabel || '').toUpperCase() === 'COMPLETED';
                  const isInProgress = (task.statusLabel || '').toUpperCase() === 'IN_PROGRESS' || (task.statusLabel || '').toUpperCase() === 'IN PROGRESS';

                  const barTheme = isDone
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : isInProgress
                    ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                    : 'bg-slate-100 text-slate-700 border-slate-300';

                  const fillTheme = isDone
                    ? 'bg-emerald-500'
                    : isInProgress
                    ? 'bg-indigo-600'
                    : 'bg-slate-400';

                  return (
                    <div
                      key={task.id}
                      onClick={() => onSelectTask(task.id)}
                      className={`flex items-center hover:bg-slate-50/60 transition-colors cursor-pointer group ${
                        isSelected ? 'bg-indigo-50/40' : ''
                      }`}
                    >
                      {/* Left: Task Title */}
                      <div className="w-56 sm:w-64 px-4 py-2 border-r border-slate-100 flex items-center gap-2 shrink-0 min-w-0">
                        <div
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isDone ? 'bg-emerald-500' : isInProgress ? 'bg-indigo-600' : 'bg-slate-400'
                          }`}
                        />
                        <span className="text-xs font-medium text-slate-800 truncate" title={task.title}>
                          {task.title}
                        </span>
                      </div>

                      {/* Right: Gantt lane with vertical month grid lines and horizontal bar */}
                      <div className="flex-1 relative h-9 px-2 flex items-center">
                        {/* Month grid lines */}
                        <div
                          className="absolute inset-0 divide-x divide-slate-100/80 pointer-events-none"
                          style={{ display: 'grid', gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
                        />

                        {/* Task Gantt Bar */}
                        <div
                          className={`absolute h-6 rounded-lg text-[10px] font-semibold border flex items-center px-2 shadow-xs transition-all ${barTheme} ${
                            isSelected ? 'ring-2 ring-indigo-500/50 border-indigo-500' : ''
                          }`}
                          style={{
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                          }}
                          title={`${task.title} (${task.progressPct || 0}%)`}
                        >
                          {/* Inner Progress fill */}
                          <div
                            className={`absolute left-0 top-0 bottom-0 rounded-lg opacity-25 ${fillTheme}`}
                            style={{ width: `${task.progressPct || 0}%` }}
                          />
                          <span className="relative z-10 truncate font-mono">
                            {task.progressPct || 0}% · {task.title}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Right Column: Fixed Inspector Component (Never Overlaps) ──
function RoadmapInspector({
  selectedTask,
  onClose,
  onEditTimeline,
  onDeleteTask,
  onViewTeam,
  isDeleting,
}) {
  if (!selectedTask) {
    return (
      <div className="bg-gradient-to-b from-white/95 to-slate-50/70 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.06)] flex flex-col items-center justify-center text-center text-slate-400 text-xs space-y-2">
        <p>Select a task in the timeline to view details.</p>
      </div>
    );
  }

  const isDone = (selectedTask.statusLabel || '').toUpperCase() === 'COMPLETED';
  const isInProgress = (selectedTask.statusLabel || '').toUpperCase() === 'IN_PROGRESS' || (selectedTask.statusLabel || '').toUpperCase() === 'IN PROGRESS';

  const badgeConfig = isDone
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
    : isInProgress
    ? 'bg-indigo-50 text-indigo-700 border-indigo-200/60'
    : 'bg-slate-100 text-slate-700 border-slate-200/60';

  const progressColor = isDone
    ? 'bg-emerald-500'
    : isInProgress
    ? 'bg-indigo-600'
    : 'bg-slate-400';

  const startFormatted = selectedTask.startDate
    ? new Date(selectedTask.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'TBD';
  const endFormatted = selectedTask.endDate
    ? new Date(selectedTask.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'TBD';

  return (
    <div className="bg-gradient-to-b from-white/95 to-slate-50/70 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-5 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.06)] flex flex-col gap-4">
      {/* 1. Top Bar */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Inspector
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center p-0 cursor-pointer"
          aria-label="Close inspector"
        >
          <X size={15} />
        </Button>
      </div>

      {/* 2. Goal Header */}
      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-900 leading-snug">
          {selectedTask.title}
        </h2>

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badgeConfig}`}>
            {selectedTask.statusLabel || (isDone ? 'Completed' : isInProgress ? 'In Progress' : 'Planned')}
          </span>
          {selectedTask.taskCode && (
            <span className="text-xs font-mono font-medium text-slate-400 tabular-nums">
              {selectedTask.taskCode}
            </span>
          )}
        </div>

        <div className="mt-2.5 bg-slate-50/80 border border-slate-200/60 rounded-xl px-3 py-2 text-xs text-slate-500 leading-relaxed">
          {selectedTask.description || 'No description provided.'}
        </div>
      </div>

      {/* 3. Dates & Progress Well */}
      <div className="bg-slate-50/80 border border-slate-200/60 rounded-xl p-3.5 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <div>
            <p className="text-[11px] font-normal text-slate-400 mb-0.5">Start Date</p>
            <p className="text-xs font-medium text-slate-900 font-mono">{startFormatted}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-normal text-slate-400 mb-0.5">End Date</p>
            <p className="text-xs font-medium text-slate-900 font-mono">{endFormatted}</p>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5 text-xs">
            <span className="font-medium text-slate-600">Progress</span>
            <span className="font-bold text-slate-900 tabular-nums">{selectedTask.progressPct || 0}%</span>
          </div>
          <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${progressColor}`}
              style={{ width: `${selectedTask.progressPct || 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* 4. Assigned Execution Team Section (Fully visible, never overlapped!) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-700">Assigned Execution Team</h3>
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={!selectedTask.assignees || selectedTask.assignees.length === 0}
            onClick={onViewTeam}
            className="h-auto p-0 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline disabled:opacity-50 cursor-pointer"
          >
            View All
          </Button>
        </div>

        <div className="bg-slate-50/80 border border-slate-200/60 rounded-xl p-3 flex items-center justify-between">
          {selectedTask.assignees && selectedTask.assignees.length > 0 ? (
            <div className="flex -space-x-1.5 overflow-hidden">
              {selectedTask.assignees.map((assignee, idx) => (
                <div
                  key={idx}
                  title={assignee.employee?.name || 'Assignee'}
                  className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-700 overflow-hidden shadow-xs"
                >
                  {assignee.employee?.name ? (
                    assignee.employee.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                  ) : (
                    (assignee.employee?.firstName?.[0] || '') + (assignee.employee?.lastName?.[0] || '') || '?'
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-400">No assignees</div>
          )}
        </div>
      </div>

      {/* 5. Action Footer */}
      <div className="pt-2 border-t border-slate-200/60 flex flex-col gap-2">
        <Button
          type="button"
          onClick={onEditTimeline}
          className="h-9 w-full rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
        >
          <Edit2 size={13} />
          Edit Timeline
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isDeleting}
          onClick={onDeleteTask}
          className="h-9 w-full rounded-xl bg-rose-50/60 hover:bg-rose-50 border border-rose-200/60 text-rose-600 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Trash2 size={13} />
          Delete Task
        </Button>
      </div>
    </div>
  );
}

export default function Roadmap() {
  const queryClient = useQueryClient();
  const [isInspectorOpen, setInspectorOpen] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [timelineScope, setTimelineScope] = useState('all'); // 'all' | 'h1' | 'h2' | 'q1' | 'q2' | 'q3' | 'q4'
  const [phaseFilter, setPhaseFilter] = useState('all'); // 'all' or phaseId
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'timeline'
  const [collapsedPhases, setCollapsedPhases] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const [phaseOpen, setPhaseOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [timelineTaskId, setTimelineTaskId] = useState(null);
  const [phaseTitle, setPhaseTitle] = useState('');
  const [taskForm, setTaskForm] = useState({ title: '', phaseId: '' });
  const [timelineForm, setTimelineForm] = useState({ startDate: '', endDate: '', progressPct: 0 });

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setTaskOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data: responseData, isLoading, isError } = useQuery({
    queryKey: queryKeys.projects.roadmap(),
    queryFn: projectsApi.getRoadmap,
  });

  const phases = responseData?.phases || [];

  // Auto-select first task if none selected
  useEffect(() => {
    if (!selectedId && phases.length > 0) {
      for (const p of phases) {
        if (p.tasks && p.tasks.length > 0) {
          setSelectedId(p.tasks[0].id);
          break;
        }
      }
    }
  }, [phases, selectedId]);

  // Find selected task directly from phases
  let selectedTask = null;
  if (selectedId) {
    phases.forEach(p => {
      (p.tasks || []).forEach(t => {
        if (t.id === selectedId) selectedTask = t;
      });
    });
  }

  // Mutation hooks
  const refreshRoadmap = () => queryClient.invalidateQueries({ queryKey: queryKeys.projects.roadmap() });
  const createPhase = useMutation({
    mutationFn: () => projectsApi.createRoadmapPhase({ title: phaseTitle.trim(), sortOrder: phases.length }),
    onSuccess: () => { setPhaseOpen(false); setPhaseTitle(''); refreshRoadmap(); }
  });
  const deletePhase = useMutation({
    mutationFn: (id) => projectsApi.deleteRoadmapPhase(id),
    onSuccess: () => refreshRoadmap()
  });
  const createTask = useMutation({
    mutationFn: () => projectsApi.createRoadmapTask({ title: taskForm.title.trim(), phaseId: taskForm.phaseId || phases[0]?.id }),
    onSuccess: () => { setTaskOpen(false); setTaskForm({ title: '', phaseId: '' }); refreshRoadmap(); }
  });
  const updateTimeline = useMutation({
    mutationFn: () => projectsApi.updateRoadmapTask(timelineTaskId, {
      ...timelineForm,
      startDate: timelineForm.startDate || null,
      endDate: timelineForm.endDate || null,
    }),
    onSuccess: () => { setTimelineOpen(false); refreshRoadmap(); }
  });
  const deleteTask = useMutation({
    mutationFn: (id) => projectsApi.deleteRoadmapTask(id),
    onSuccess: () => { setSelectedId(null); refreshRoadmap(); }
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  if (isError || !responseData) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised text-danger">
        Failed to load roadmap.
      </div>
    );
  }

  const totalTasks = phases.reduce((acc, p) => acc + (p.tasks?.length || 0), 0);

  const togglePhaseCollapse = (phaseId) => {
    setCollapsedPhases(prev => ({ ...prev, [phaseId]: !prev[phaseId] }));
  };

  const matchesTimelineScope = (phase, scope) => {
    if (scope === 'all') return true;
    const title = (phase.title || '').toLowerCase();
    if (scope === 'h1' && (title.includes('q1') || title.includes('q2'))) return true;
    if (scope === 'h2' && (title.includes('q3') || title.includes('q4'))) return true;
    if (scope === 'q1' && title.includes('q1')) return true;
    if (scope === 'q2' && title.includes('q2')) return true;
    if (scope === 'q3' && title.includes('q3')) return true;
    if (scope === 'q4' && title.includes('q4')) return true;

    return (phase.tasks || []).some(t => {
      if (!t.startDate) return false;
      const m = new Date(t.startDate).getUTCMonth();
      if (scope === 'h1') return m <= 5;
      if (scope === 'h2') return m >= 6;
      if (scope === 'q1') return m <= 2;
      if (scope === 'q2') return m >= 3 && m <= 5;
      if (scope === 'q3') return m >= 6 && m <= 8;
      if (scope === 'q4') return m >= 9;
      return true;
    });
  };

  // Filtered phases by timeline scope, quarter/phase pill, and search
  const filteredPhases = phases
    .filter(p => matchesTimelineScope(p, timelineScope))
    .filter(p => phaseFilter === 'all' || p.id === phaseFilter)
    .map(p => {
      if (!search.trim()) return p;
      const q = search.toLowerCase();
      const matchPhase = p.title.toLowerCase().includes(q);
      const matchingTasks = (p.tasks || []).filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.taskCode && t.taskCode.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
      if (matchPhase) return p;
      return { ...p, tasks: matchingTasks };
    })
    .filter(p => !search.trim() || p.tasks.length > 0 || p.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-surface-raised p-4 sm:p-6 space-y-4">
      {/* ── 1. Top Roadmap Command Bar (Apple-Glass Header Card) ── */}
      <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-2.5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex flex-wrap items-center justify-between gap-3">
        {/* Left Cluster: KPI Metric Badges */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Pill 1: Active Phases */}
          <div className="h-8.5 bg-slate-100/80 border border-slate-200/70 rounded-xl px-3 flex items-center gap-2 shrink-0">
            <span className="text-xs font-medium text-slate-500">Active Phases:</span>
            <span className="text-sm font-bold text-slate-900 tabular-nums">{phases.length}</span>
          </div>
          {/* Pill 2: Tracked Tasks */}
          <div className="h-8.5 bg-slate-100/80 border border-slate-200/70 rounded-xl px-3 flex items-center gap-2 shrink-0">
            <span className="text-xs font-medium text-slate-500">Tracked Tasks:</span>
            <span className="text-sm font-bold text-slate-900 tabular-nums">{totalTasks}</span>
          </div>
        </div>

        {/* Right Cluster: Tactile Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Button
            type="button"
            variant="outline"
            onClick={() => setPhaseOpen(true)}
            className="h-8.5 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/90 shadow-sm text-xs font-semibold text-slate-800 transition-all whitespace-nowrap cursor-pointer"
          >
            New Phase
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={!phases.length}
            onClick={() => { setTaskForm({ title: '', phaseId: phases[0]?.id || '' }); setTaskOpen(true); }}
            className="h-8.5 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/90 shadow-sm text-xs font-semibold text-slate-800 transition-all disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            New Task
          </Button>

          <Button
            type="button"
            onClick={() => downloadRoadmapCsv(phases)}
            className="h-8.5 px-3.5 rounded-xl text-xs font-semibold shadow-sm shrink-0 whitespace-nowrap cursor-pointer"
          >
            Export
          </Button>
        </div>
      </div>

      {/* ── 2. Full-Width Filter, Quarter Jump-Bar & View Switcher Toolbar ── */}
      <div className="w-full bg-white/85 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-2.5 shadow-sm flex flex-wrap xl:flex-nowrap items-center justify-between gap-2.5">
        {/* Left Cluster: Search & Timeline Dropdown */}
        <div className="flex items-center gap-2 shrink-0">
          <SearchInput
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            aria-label="Search roadmap"
            title="Search roadmap"
            wrapperClassName="w-48 sm:w-56 shrink-0"
            className="h-8.5 text-xs"
          />

          <Select
            value={timelineScope}
            onValueChange={(val) => {
              setTimelineScope(val);
              setPhaseFilter('all');
            }}
          >
            <SelectTrigger
              aria-label="Timeline scope"
              title="Select timeline scope"
              className="h-8.5 px-3 rounded-xl bg-slate-100/75 hover:bg-slate-100 border border-slate-200/70 text-xs font-medium text-slate-700 shrink-0 w-auto gap-1.5 shadow-none focus:ring-1 focus:ring-slate-300 cursor-pointer"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Timeline: All 2026</SelectItem>
              <SelectItem value="h2">Timeline: H2 2026</SelectItem>
              <SelectItem value="h1">Timeline: H1 2026</SelectItem>
              <SelectItem value="q1">Timeline: Q1 2026</SelectItem>
              <SelectItem value="q2">Timeline: Q2 2026</SelectItem>
              <SelectItem value="q3">Timeline: Q3 2026</SelectItem>
              <SelectItem value="q4">Timeline: Q4 2026</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Center/Right Cluster: Quarter Jump-Bar & View Switcher */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar min-w-0">
          {/* Quick-Filter Pills (Practical Quarter Controller) */}
          <div className="flex items-center gap-1 bg-slate-100/80 p-0.5 rounded-xl border border-slate-200/60 shrink-0">
            <button
              type="button"
              onClick={() => setPhaseFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                phaseFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              All
            </button>
            {phases.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPhaseFilter(phaseFilter === p.id ? 'all' : p.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  phaseFilter === p.id
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                {p.title}
              </button>
            ))}
          </div>

          {/* View-Mode Switcher */}
          <div className="bg-slate-100/90 p-0.5 rounded-xl border border-slate-200/60 inline-flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
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
              onClick={() => setViewMode('timeline')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'timeline'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
              aria-label="Timeline view"
            >
              <Calendar size={13} />
              <span>Timeline</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── 3. Master-Detail Workspace Grid ── */}
      <div className={`grid grid-cols-1 ${isInspectorOpen ? 'lg:grid-cols-12' : ''} gap-4 items-start`}>
        {/* Left Column (Phases & Tasks or Gantt Timeline) */}
        <div className={`${isInspectorOpen ? 'lg:col-span-8' : 'w-full'} space-y-4 min-w-0`}>
          {viewMode === 'timeline' ? (
            <GanttTimelineView
              phases={filteredPhases}
              selectedId={selectedId}
              onSelectTask={(id) => {
                setSelectedId(id);
                setInspectorOpen(true);
              }}
              timelineScope={timelineScope}
            />
          ) : (
            <>
              {filteredPhases.length === 0 ? (
                <div className="bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-12 text-center text-sm text-slate-400">
                  No roadmap data found.
                </div>
              ) : (
                filteredPhases.map(phase => {
                  const tasks = phase.tasks || [];
                  const phaseAvgProgress = tasks.length > 0
                    ? Math.round(tasks.reduce((sum, t) => sum + (t.progressPct || 0), 0) / tasks.length)
                    : 0;
                  const isCollapsed = collapsedPhases[phase.id];

                  return (
                    <div
                      key={phase.id}
                      className="bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)] overflow-hidden"
                    >
                      {/* Unified Phase Header Bar */}
                      <div className="bg-slate-50/90 border-b border-slate-200/70 px-4 py-2.5 flex items-center justify-between gap-3">
                        {/* Left: Collapsible chevron + Folder + Title + Count */}
                        <button
                          type="button"
                          onClick={() => togglePhaseCollapse(phase.id)}
                          className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group/title"
                        >
                          <ChevronDown
                            size={15}
                            className={`text-slate-400 group-hover/title:text-slate-700 transition-transform duration-200 shrink-0 ${
                              isCollapsed ? '-rotate-90' : ''
                            }`}
                          />
                          <Folder size={16} className="text-slate-500 shrink-0" />
                          <h3 className="text-sm font-bold text-slate-900 tracking-tight truncate">
                            {phase.title}
                          </h3>
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200/70 text-slate-700 tabular-nums shrink-0">
                            {tasks.length} Tasks
                          </span>
                        </button>

                        {/* Right: Avg Progress + Bar + Delete Button */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-600">
                            <span>{phaseAvgProgress}%</span>
                            <div className="w-16 sm:w-20 h-1.5 rounded-full bg-slate-200/80 overflow-hidden shrink-0">
                              <div
                                className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                                style={{ width: `${phaseAvgProgress}%` }}
                              />
                            </div>
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            disabled={deletePhase.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Delete phase "${phase.title}" and its tasks?`)) {
                                deletePhase.mutate(phase.id);
                              }
                            }}
                            className="w-7 h-7 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors disabled:opacity-50 p-0 cursor-pointer"
                            title="Delete phase"
                            aria-label={`Delete phase ${phase.title}`}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>

                      {/* Task Rows (Zero-Truncation Design) */}
                      {!isCollapsed && (
                        tasks.length === 0 ? (
                          <div className="py-8 text-center text-xs text-slate-400">
                            No tasks in this phase.
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {tasks.map(task => (
                              <TaskRow
                                key={task.id}
                                task={task}
                                isSelected={selectedId === task.id}
                                onClick={() => {
                                  setSelectedId(task.id);
                                  setInspectorOpen(true);
                                }}
                              />
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>

        {/* Right Column: Sticky Apple-Glass Inspector */}
        {isInspectorOpen && (
          <div className="lg:col-span-4 lg:sticky lg:top-4 min-w-0">
            <RoadmapInspector
              selectedTask={selectedTask}
              onClose={() => setInspectorOpen(false)}
              onEditTimeline={() => {
                if (selectedTask) {
                  setTimelineTaskId(selectedTask.id);
                  setTimelineForm({
                    startDate: selectedTask.startDate?.slice(0, 10) || '',
                    endDate: selectedTask.endDate?.slice(0, 10) || '',
                    progressPct: selectedTask.progressPct || 0,
                  });
                  setTimelineOpen(true);
                }
              }}
              onDeleteTask={() => {
                if (selectedTask && window.confirm(`Delete task "${selectedTask.title}"?`)) {
                  deleteTask.mutate(selectedTask.id);
                }
              }}
              onViewTeam={() => setTeamOpen(true)}
              isDeleting={deleteTask.isPending}
            />
          </div>
        )}
      </div>

      {/* New Phase Dialog */}
      <FormDialog open={phaseOpen} onClose={() => setPhaseOpen(false)} title="New roadmap phase" busy={createPhase.isPending} onConfirm={() => createPhase.mutate()} confirmLabel="Create phase">
        <label className="block text-sm font-medium text-body">
          Phase name
          <Input required value={phaseTitle} onChange={event => setPhaseTitle(event.target.value)} className="mt-1 w-full" />
        </label>
      </FormDialog>

      {/* New Task Dialog */}
      <FormDialog open={taskOpen} onClose={() => setTaskOpen(false)} title="New roadmap task" busy={createTask.isPending} onConfirm={() => createTask.mutate()} confirmLabel="Create task">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-body">
            Task name
            <Input required value={taskForm.title} onChange={event => setTaskForm(current => ({ ...current, title: event.target.value }))} className="mt-1 w-full" />
          </label>
          <div>
            <label htmlFor="task-phase-id" className="block text-sm font-medium text-body mb-1">
              Phase
            </label>
            <Select
              value={taskForm.phaseId || phases[0]?.id || ''}
              onValueChange={val => setTaskForm(current => ({ ...current, phaseId: val }))}
            >
              <SelectTrigger id="task-phase-id" className="h-9 w-full text-sm bg-surface-raised">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {phases.map(phase => (
                  <SelectItem key={phase.id} value={phase.id}>{phase.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </FormDialog>

      {/* Edit Timeline Dialog */}
      <FormDialog open={timelineOpen} onClose={() => setTimelineOpen(false)} title="Edit task timeline" subtitle={selectedTask?.title} busy={updateTimeline.isPending} onConfirm={() => updateTimeline.mutate()} confirmLabel="Save timeline">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-body">
            Start date
            <Input type="date" value={timelineForm.startDate} onChange={event => setTimelineForm(current => ({ ...current, startDate: event.target.value }))} className="mt-1 w-full" />
          </label>
          <label className="block text-sm font-medium text-body">
            End date
            <Input type="date" value={timelineForm.endDate} onChange={event => setTimelineForm(current => ({ ...current, endDate: event.target.value }))} className="mt-1 w-full" />
          </label>
          <label className="block text-sm font-medium text-body">
            Progress (%)
            <Input type="number" min="0" max="100" value={timelineForm.progressPct} onChange={event => setTimelineForm(current => ({ ...current, progressPct: Number(event.target.value) }))} className="mt-1 w-full" />
          </label>
        </div>
      </FormDialog>

      {/* Execution Team Dialog */}
      <FormDialog
        open={teamOpen}
        onClose={() => setTeamOpen(false)}
        title="Assigned Execution Team"
        subtitle={selectedTask?.title}
        confirmLabel="Close"
        onConfirm={() => setTeamOpen(false)}
      >
        <div className="space-y-3">
          {(!selectedTask?.assignees || selectedTask.assignees.length === 0) ? (
            <div className="text-sm text-muted">No team members assigned.</div>
          ) : (
            selectedTask.assignees.map((assignee, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-border-default last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-surface-strong flex items-center justify-center text-xs font-medium text-heading">
                    {assignee.employee?.name ? assignee.employee.name.slice(0, 2).toUpperCase() : '?'}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-heading">{assignee.employee?.name || 'Team Member'}</div>
                    {assignee.employee?.title ? <div className="text-xs text-caption">{assignee.employee.title}</div> : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </FormDialog>
    </div>
  );
}
