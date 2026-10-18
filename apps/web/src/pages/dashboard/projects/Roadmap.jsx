import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronRight,
  Search,
  ChevronDown,
  X,
  Folder,
  Edit2,
  Trash2,
  Loader2,
  Clock
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../../../lib/api/projects';
import { queryKeys } from '../../../lib/queryKeys';
import { downloadRoadmapCsv } from '../../../lib/roadmapExport';
import PageHeader from '../../../components/common/PageHeader';
import PageToolbar from '../../../components/common/PageToolbar';
import FormDialog from '../../../components/common/FormDialog';
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

export default function Roadmap() {
  const queryClient = useQueryClient()
  const [isInspectorOpen, setInspectorOpen] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
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

  // The old page filtered phases to "Q3/Q4 2026" and rewrote status/progress client-side.
  // The new endpoint already ships ordered phases with dated, pre-computed tasks, so we
  // render them as-is.
  const phases = responseData?.phases || [];

  // Find selected task directly from phases
  let selectedTask = null;
  if (selectedId) {
    phases.forEach(p => {
      (p.tasks || []).forEach(t => {
        if (t.id === selectedId) selectedTask = t;
      });
    });
  }

  // Mutation hooks must run on every render (before the loading/error early returns).
  const refreshRoadmap = () => queryClient.invalidateQueries({ queryKey: queryKeys.projects.roadmap() });
  const createPhase = useMutation({ mutationFn: () => projectsApi.createRoadmapPhase({ title: phaseTitle.trim(), sortOrder: phases.length }), onSuccess: () => { setPhaseOpen(false); setPhaseTitle(''); refreshRoadmap(); } });
  const deletePhase = useMutation({ mutationFn: (id) => projectsApi.deleteRoadmapPhase(id), onSuccess: () => refreshRoadmap() });
  const createTask = useMutation({ mutationFn: () => projectsApi.createRoadmapTask({ title: taskForm.title.trim(), phaseId: taskForm.phaseId || phases[0]?.id }), onSuccess: () => { setTaskOpen(false); setTaskForm({ title: '', phaseId: '' }); refreshRoadmap(); } });
  const updateTimeline = useMutation({ mutationFn: () => projectsApi.updateRoadmapTask(timelineTaskId, { ...timelineForm, startDate: timelineForm.startDate || null, endDate: timelineForm.endDate || null }), onSuccess: () => { setTimelineOpen(false); refreshRoadmap(); } });
  const deleteTask = useMutation({ mutationFn: (id) => projectsApi.deleteRoadmapTask(id), onSuccess: () => { setSelectedId(null); refreshRoadmap(); } });

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

  // Count total tasks for the header
  const totalTasks = phases.reduce((acc, p) => acc + (p.tasks?.length || 0), 0);

  const filteredPhases = phases.map(p => {
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
  }).filter(p => !search.trim() || p.tasks.length > 0 || p.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-0">

      {/* ── Page Header (Quiet stats on left, actions on right) ── */}
      <PageHeader
        title={
          <div className="flex items-center gap-6">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-normal text-muted">Active Phases:</span>
              <span className="text-xl font-medium text-heading tabular-nums">{phases.length}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-normal text-muted">Tracked Tasks:</span>
              <span className="text-xl font-medium text-heading tabular-nums">{totalTasks}</span>
            </div>
          </div>
        }
        actions={
          <div className="flex items-center gap-3 shrink-0 flex-nowrap">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPhaseOpen(true)}
              className="h-10 px-3.5 rounded-[10px] border-0 bg-surface-raised text-body text-sm font-medium hover:bg-surface-muted transition-colors shadow-[0_1px_2px_rgba(16,24,40,0.04)] whitespace-nowrap"
            >
              New Phase
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={!phases.length}
              onClick={() => { setTaskForm({ title: '', phaseId: phases[0]?.id || '' }); setTaskOpen(true); }}
              className="h-10 px-3.5 rounded-[10px] border-0 bg-surface-raised text-body text-sm font-medium hover:bg-surface-muted transition-colors disabled:opacity-60 shadow-[0_1px_2px_rgba(16,24,40,0.04)] whitespace-nowrap"
            >
              New Task
            </Button>

            <Button
              type="button"
              onClick={() => downloadRoadmapCsv(phases)}
              className="h-10 px-4 rounded-[10px] font-semibold shadow-sm shrink-0 whitespace-nowrap"
            >
              Export
            </Button>
          </div>
        }
        className="bg-surface mb-2 px-6"
      />

      {/* ── Main Split View ── */}
      <div className="flex-1 min-h-0 flex flex-col xl:flex-row gap-5 px-6 pb-6 overflow-hidden bg-surface">

        {/* Left Column (List column): Toolbar + Phase Groups */}
        <div className="flex-1 min-w-0 h-full overflow-y-auto pr-1 scrollbar-soft">

          {/* Toolbar: Search roadmap + Timeline */}
          <PageToolbar
            className="mb-4"
            left={
              <>
                <div className="relative flex-1 min-w-[160px] max-w-[280px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
                  <Input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search..."
                    aria-label="Search roadmap"
                    title="Search roadmap"
                    className="pl-9 pr-4 h-10 text-sm border-0 rounded-[10px] bg-surface-raised text-heading placeholder:text-caption shadow-[0_1px_2px_rgba(16,24,40,0.04)] w-full"
                  />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  disabled
                  className="flex items-center gap-1.5 h-10 px-3.5 border-0 bg-surface-raised text-body rounded-[10px] text-xs font-medium shadow-[0_1px_2px_rgba(16,24,40,0.04)] disabled:opacity-60 cursor-not-allowed shrink-0"
                  title="Timeline: H2 2026"
                  aria-label="Timeline: H2 2026"
                >
                  <span>Timeline: H2 2026</span>
                  <ChevronDown size={13} className="text-caption" />
                </Button>
              </>
            }
          />

          {/* Phase Groups & Task Rows */}
          {filteredPhases.length === 0 ? (
            <div className="flex w-full items-center justify-center text-sm text-muted py-12">
              No roadmap data found.
            </div>
          ) : (
            filteredPhases.map(phase => (
              <div key={phase.id} className="mt-7 first:mt-0">

                {/* Phase Header */}
                <div className="group/phase flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2.5">
                    <Folder size={16} className="text-muted shrink-0" />
                    <h3 className="text-base font-medium text-heading tracking-normal">
                      {phase.title}
                    </h3>
                    <Badge variant="outline" className="text-[11px] font-medium text-muted bg-surface-muted px-2.5 py-0.5 rounded-full tabular-nums border-border-default">
                      {phase.tasks?.length || 0} Tasks
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    disabled={deletePhase.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete phase "${phase.title}" and its tasks?`)) {
                        deletePhase.mutate(phase.id);
                      }
                    }}
                    className="opacity-40 group-hover/phase:opacity-100 group-focus-within/phase:opacity-100 reveal-on-hover text-caption hover:text-danger h-7 w-7 p-0 transition-opacity disabled:opacity-50"
                    title="Delete phase"
                    aria-label={`Delete phase ${phase.title}`}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>

                {/* Task List: One white rounded container per phase */}
                <div className="bg-surface-raised rounded-[14px] p-1 shadow-[0_1px_2px_rgba(16,24,40,0.04)] border-0 flex flex-col gap-1">
                  {(phase.tasks || []).map(task => {
                    const isSelected = selectedId === task.id;
                    return (
                      <div
                        key={task.id}
                        onClick={() => { setSelectedId(task.id); setInspectorOpen(true); }}
                        className={`group h-[52px] min-h-[52px] px-4 py-0 rounded-[10px] border-0 shadow-none flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-accent-light/40 text-heading'
                            : 'hover:bg-surface-muted/60'
                        }`}
                      >
                        {/* Left: Status dot + Code + Title + Inline Status chip */}
                        <div className="flex items-center gap-2.5 min-w-0 pr-4 flex-1">
                          <div className="w-2 h-2 rounded-full bg-primary shrink-0" />

                          {task.taskCode && (
                            <span className="text-[11px] font-medium text-caption shrink-0 tabular-nums">
                              {task.taskCode}
                            </span>
                          )}

                          <span className="text-sm font-medium text-heading truncate" title={task.title}>
                            {task.title}
                          </span>

                          <Badge variant="outline" className="bg-surface-active/60 px-2 py-0.5 rounded-full text-[11px] font-medium text-body capitalize tracking-normal shrink-0 border-transparent">
                            {task.statusLabel ? task.statusLabel.toLowerCase() : 'scheduled'}
                          </Badge>
                        </div>

                        {/* Right: Fixed columns on ONE line */}
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="hidden sm:flex items-center gap-1.5 text-xs font-normal text-muted w-[150px] shrink-0">
                            <Clock size={12} className="text-caption shrink-0" />
                            <span className="truncate">
                              {task.startDate ? new Date(task.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD'} -{task.endDate ? new Date(task.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD'}
                            </span>
                          </div>

                          <div className="w-[110px] bg-surface-strong rounded-full h-[5px] overflow-hidden shrink-0">
                            <div
                              className="bg-primary h-full rounded-full transition-all"
                              style={{ width: `${task.progressPct || 0}%` }}
                            />
                          </div>

                          <span className="text-xs font-medium text-body w-11 min-w-[44px] text-right tabular-nums shrink-0">
                            {task.progressPct || 0}%
                          </span>

                          <div className="w-6 min-w-[24px] flex items-center justify-center shrink-0">
                            <ChevronRight size={16} className={`transition-colors ${isSelected ? 'text-primary' : 'text-muted group-hover:text-heading'}`} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right: Inspector Panel (One white surface, radius 14px, no border, sticky) */}
        {isInspectorOpen && (
          <div className="w-full xl:w-[clamp(320px,22vw,380px)] xl:flex-none h-full bg-surface-raised rounded-[14px] shadow-[0_1px_2px_rgba(16,24,40,0.04)] border-0 flex flex-col overflow-hidden">

            {/* Inspector Header */}
            <div className="flex items-center justify-between p-5 pb-3">
              <span className="text-xs font-medium text-muted">Inspector</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setInspectorOpen(false)}
                className="h-7 w-7 text-caption hover:text-body"
                aria-label="Close inspector"
              >
                <X size={16} />
              </Button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 space-y-4 scrollbar-soft">
              {selectedTask ? (
                <>
                  {/* Task Details Section */}
                  <div>
                    <h2 className="text-xl font-medium text-heading leading-tight mb-2">
                      {selectedTask.title}
                    </h2>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="outline" className="bg-surface-active/60 px-2 py-0.5 rounded-full text-xs font-medium text-body capitalize border-transparent">
                        {selectedTask.statusLabel ? selectedTask.statusLabel.toLowerCase() : 'scheduled'}
                      </Badge>
                      {selectedTask.taskCode && (
                        <span className="text-xs font-medium text-caption tabular-nums">
                          {selectedTask.taskCode}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-body leading-relaxed">
                      {selectedTask.description || 'No description provided.'}
                    </p>
                  </div>

                  {/* Progress & Dates Section - Hairline divider */}
                  <div className="border-t border-border-subtle/50 pt-4 space-y-3">
                    <div className="flex justify-between items-baseline">
                      <div>
                        <p className="text-[11px] font-normal text-caption mb-0.5">Start Date</p>
                        <p className="text-xs font-medium text-heading font-mono">
                          {selectedTask.startDate ? new Date(selectedTask.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] font-normal text-caption mb-0.5">End Date</p>
                        <p className="text-xs font-medium text-heading font-mono">
                          {selectedTask.endDate ? new Date(selectedTask.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'}
                        </p>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs font-normal text-muted">Progress</span>
                        <span className="text-xs font-medium text-heading tabular-nums">{selectedTask.progressPct || 0}%</span>
                      </div>
                      <div className="w-full bg-surface-strong rounded-full h-[5px] overflow-hidden">
                        <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${selectedTask.progressPct || 0}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Assigned Execution Team Section - Hairline divider */}
                  <div className="border-t border-border-subtle/50 pt-4">
                    <div className="flex items-center justify-between mb-2.5">
                      <h3 className="text-xs font-medium text-heading">Assigned Execution Team</h3>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        disabled={!selectedTask.assignees || selectedTask.assignees.length === 0}
                        onClick={() => setTeamOpen(true)}
                        className="h-auto p-0 text-xs font-medium text-accent hover:underline disabled:opacity-50"
                      >
                        View All
                      </Button>
                    </div>

                    <div className="flex items-center justify-between bg-surface-muted/40 p-3 rounded-[10px]">
                      {selectedTask.assignees && selectedTask.assignees.length > 0 ? (
                        <div className="flex -space-x-1.5 overflow-hidden">
                          {selectedTask.assignees.map((assignee, idx) => (
                            <div
                              key={idx}
                              title={assignee.employee?.name || 'Assignee'}
                              className="w-6 h-6 rounded-full bg-surface-raised border border-border-default flex items-center justify-center text-[9px] font-medium text-heading overflow-hidden"
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
                        <div className="text-xs text-muted">No assignees</div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-muted text-[13px] text-center p-6">
                  Select a task in the timeline to view details.
                </div>
              )}
            </div>

            {/* Inspector Footer (Pinned with hairline above, 40px buttons, rounded-[10px]) */}
            {selectedTask && (
              <div className="p-4 border-t border-border-subtle/50 bg-surface-raised shrink-0 space-y-2">
                <Button
                  type="button"
                  onClick={() => { setTimelineTaskId(selectedTask.id); setTimelineForm({ startDate: selectedTask.startDate?.slice(0, 10) || '', endDate: selectedTask.endDate?.slice(0, 10) || '', progressPct: selectedTask.progressPct || 0 }); setTimelineOpen(true); }}
                  className="w-full h-10 gap-2 font-semibold shadow-sm"
                >
                  <Edit2 size={14} />
                  Edit Timeline
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={deleteTask.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete task "${selectedTask.title}"?`)) {
                      deleteTask.mutate(selectedTask.id);
                    }
                  }}
                  className="w-full h-10 gap-2 border-0 text-danger bg-danger-light/20 hover:bg-danger-light/30 rounded-[10px] text-xs font-medium"
                >
                  <Trash2 size={13} />
                  Delete Task
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      <FormDialog open={phaseOpen} onClose={() => setPhaseOpen(false)} title="New roadmap phase" busy={createPhase.isPending} onConfirm={() => createPhase.mutate()} confirmLabel="Create phase">
        <label className="block text-sm font-medium text-body">
          Phase name
          <Input required value={phaseTitle} onChange={event => setPhaseTitle(event.target.value)} className="mt-1 w-full" />
        </label>
      </FormDialog>
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
              <SelectTrigger id="task-phase-id" className="h-9 w-full text-sm bg-surface">
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
