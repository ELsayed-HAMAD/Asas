import { useEffect, useState } from 'react';
import {
  Search,
  ChevronsUpDown,
  Clock,
  Loader2,
  ClipboardList,
  Pencil,
  Trash2,
  FolderKanban
} from 'lucide-react';
import { Progress } from '../../../components/ui/progress';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../../../lib/api/projects';
import { hrApi } from '../../../lib/api/hr';
import { queryKeys } from '../../../lib/queryKeys';
import { formatCompactTableMoney, formatDate, formatMoney } from '../../../lib/format';
import TopBarActions from '../../../components/TopBarActions';
import FormDialog from '../../../components/common/FormDialog';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/table';

const getBadgeStyle = (status) => {
  if (status === 'ACTIVE' || status === 'ON_TRACK' || status === 'COMPLETED') return "bg-success-light text-success-text border border-success-border";
  if (status === 'PLANNING') return "bg-info-light text-info border border-info-border";
  if (status === 'AT_RISK') return "bg-warning-light text-warning-text border border-warning/30";
  if (status === 'DELAYED' || status === 'CANCELLED') return "bg-danger-light text-danger-text border border-danger-border";
  return "bg-surface-strong text-body border border-border-default";
};

const formatStatus = (status) => {
  if (!status) return '';
  return status.replace(/_/g, ' ').replace(/\w\S*/g, (t) => {
    return t.charAt(0).toUpperCase() + t.substring(1).toLowerCase();
  });
};

// The utilization endpoint has no budget to divide by → `null`; the old page rendered a
// hardcoded "0". We surface "—" instead of a fake zero (see PORT RULES / judgments).
const pct = (value) => (value == null ? '—' : `${Math.round(value)}%`);

export default function PortfolioOverview() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('ALL');
  const [projectOpen, setProjectOpen] = useState(false)
  const [sprintOpen, setSprintOpen] = useState(false)
  const [projectForm, setProjectForm] = useState({ name: '', budget: '' })
  const [sprintForm, setSprintForm] = useState({ name: '', endsAt: '' })
  const [editProjectOpen, setEditProjectOpen] = useState(false)
  const [editProjectForm, setEditProjectForm] = useState({ name: '', budget: '', status: 'ACTIVE' })
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const { data: responseData, isLoading, isError } = useQuery({
    queryKey: queryKeys.projects.portfolio.list({}),
    queryFn: projectsApi.getPortfolio,
  });

  // The old Sprints Tracker card listed each project's sprints with a completion %. The
  // utilization endpoint doesn't carry sprints, so we pull the tenant's real sprints and
  // filter to the selected project (each Sprint has a `projectId`).
  const { data: sprintsData } = useQuery({
    queryKey: queryKeys.projects.sprints.list({}),
    queryFn: projectsApi.getSprints,
  });
  const { data: deptData } = useQuery({
    queryKey: queryKeys.hr.departments.list(),
    queryFn: hrApi.getDepartments,
  });
  const departments = deptData?.items ?? [];

  const { data: velocityComparison } = useQuery({
    queryKey: [...queryKeys.projects.sprints.list({}), 'velocity-comparison', selectedId],
    queryFn: () => projectsApi.getSprintVelocityComparison(selectedId),
    enabled: Boolean(selectedId),
  });
  const createProject = useMutation({
    mutationFn: () => projectsApi.createProject({ name: projectForm.name.trim(), budget: projectForm.budget || null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() }); setProjectOpen(false); setProjectForm({ name: '', budget: '' }) },
  })
  const createSprint = useMutation({
    mutationFn: () => projectsApi.createSprint({ name: sprintForm.name.trim(), projectId: selectedProject?.id, endsAt: sprintForm.endsAt ? new Date(`${sprintForm.endsAt}T00:00:00`).toISOString() : null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() }); setSprintOpen(false); setSprintForm({ name: '', endsAt: '' }) },
  })
  const updateProject = useMutation({
    mutationFn: () => projectsApi.updateProject(selectedId, {
      name: editProjectForm.name.trim(),
      budget: editProjectForm.budget === '' ? null : editProjectForm.budget,
      status: editProjectForm.status,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() });
      setEditProjectOpen(false);
    },
  })
  const deleteProject = useMutation({
    mutationFn: (id) => projectsApi.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() });
      setDeleteConfirmOpen(false);
      setSelectedId(null);
    },
  })

  const summary = responseData?.summary;
  // Utilization rows use `projectId`; normalize to `id` so the rest of the (old) page body is unchanged.
  const projects = (responseData?.items || []).map(r => ({ ...r, id: r.projectId }));
  const sprints = sprintsData?.items || [];

  const visibleProjects = projects.filter(p => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchesDept = departmentId === 'ALL' || p.departmentId === departmentId;
    return matchesSearch && matchesDept;
  });

  // Auto-select first project if none selected
  useEffect(() => {
    if (!selectedId && visibleProjects.length > 0) {
      setSelectedId(visibleProjects[0].id);
    } else if (visibleProjects.length === 0 && selectedId !== null) {
      setSelectedId(null);
    }
  }, [visibleProjects, selectedId]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  if (isError || !responseData) {
    return (
      <div className="flex h-full items-center justify-center bg-surface text-danger">
        Failed to load portfolio overview.
      </div>
    );
  }



  const selectedProject = projects.find(p => p.id === selectedId);
  const selectedSprints = selectedProject
    ? sprints.filter(s => s.projectId === selectedProject.id)
    : [];

  // KPIs come straight from the server aggregate (no client-side roll-up).
  const activeProjects = summary?.activeProjects ?? 0;
  const totalProjects = summary?.totalProjects ?? projects.length;
  const totalBudget = summary?.totalBudget ?? null;
  const budgetUtilization = summary?.utilizationPct ?? null;
  const totalBudgetText = formatMoney(totalBudget, { maximumFractionDigits: 0 });
  const totalBudgetFontSize = `clamp(0.75rem, ${(130 / Math.max(1, totalBudgetText.length)).toFixed(2)}cqw, 1.75rem)`;
  const selectedBudgetUtil = selectedProject?.utilizationPct ?? null;

  const openEditProject = (proj) => {
    setEditProjectForm({
      name: proj.name,
      budget: proj.budget ? String(proj.budget.amount / 100) : '',
      status: proj.status || 'ACTIVE',
    });
    setEditProjectOpen(true);
  };

  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-0">

      <TopBarActions>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            aria-label="Filter by department"
            className="border border-border-default text-body px-3 h-9 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent w-auto cursor-pointer"
          >
            <option value="ALL">Filter: All Depts</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              aria-label="Search projects"
              title="Search projects"
              className="pl-9 pr-4 h-9 text-sm bg-surface-raised w-[220px]"
            />
          </div>

          <Button
            onClick={() => setProjectOpen(true)}
            className="h-9 px-4 font-semibold"
          >
            New Project
          </Button>
        </div>
      </TopBarActions>

      {/* ── KPIs Row ── */}
      <div className="px-6 py-5 flex-shrink-0 border-b border-border-default bg-surface-muted">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="border border-border-default rounded-button px-5 py-4 bg-surface-raised shadow-card flex flex-col justify-between">
            <p className="text-xs font-medium text-muted mb-2">Total Active Projects</p>
            <div>
              <p className="text-[28px] leading-tight font-bold text-heading">{activeProjects}</p>
            </div>
          </div>

          <div className="border border-border-default rounded-button px-5 py-4 bg-surface-raised shadow-card flex flex-col justify-between">
            <p className="text-xs font-medium text-muted mb-2">Portfolio Budget Utilization</p>
            <div>
              <p className="text-[28px] leading-tight font-bold text-heading">{pct(budgetUtilization)}</p>
            </div>
          </div>

          <div className="border border-border-default rounded-button px-5 py-4 bg-surface-raised shadow-card flex flex-col justify-between">
            <p className="text-xs font-medium text-muted mb-2">Total Projects</p>
            <div>
              <p className="text-[28px] leading-tight font-bold text-heading">{totalProjects}</p>
            </div>
          </div>

          <div className="border border-border-default rounded-button px-5 py-4 bg-surface-raised shadow-card flex flex-col justify-between" style={{ containerType: 'inline-size' }}>
            <p className="text-xs font-medium text-muted mb-2">Total Budget</p>
            <div>
              <p className="text-[28px] leading-tight font-bold text-heading" style={{ fontSize: totalBudgetFontSize }}>{totalBudgetText}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Split View ── */}
      <div className="flex-1 min-h-0 flex flex-col xl:flex-row gap-4 p-4 xl:p-5 overflow-hidden bg-surface">

        {/* Left: Table Card (fills height, card container like Inventory) */}
        <div data-testid="project-table-card" className="flex-1 min-w-0 bg-surface-raised border border-border-default rounded-card shadow-card flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:thin]">
            <Table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="min-w-[200px]" />
                <col style={{ width: '120px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '130px' }} />
              </colgroup>
              <TableHeader className="sticky top-0 z-10 bg-surface-muted/95 backdrop-blur-xs border-b border-border-default">
                <TableRow className="h-10 hover:bg-transparent border-0">
                  <TableHead className="h-10 ps-5 pe-3 text-start rtl:text-right text-[11px] font-semibold text-muted uppercase tracking-[0.06em] whitespace-nowrap">
                    <div className="flex items-center gap-1">Project <ChevronsUpDown size={12} className="text-caption" /></div>
                  </TableHead>
                  <TableHead className="h-10 px-3 text-start rtl:text-right text-[11px] font-semibold text-muted uppercase tracking-[0.06em] whitespace-nowrap">
                    <div className="flex items-center gap-1">Budget <ChevronsUpDown size={12} className="text-caption" /></div>
                  </TableHead>
                  <TableHead className="h-10 px-3 text-start rtl:text-right text-[11px] font-semibold text-muted uppercase tracking-[0.06em] whitespace-nowrap">
                    <div className="flex items-center gap-1">Utilization <ChevronsUpDown size={12} className="text-caption" /></div>
                  </TableHead>
                  <TableHead className="h-10 ps-3 pe-5 text-end rtl:text-left text-[11px] font-semibold text-muted uppercase tracking-[0.06em] whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">Status <ChevronsUpDown size={12} className="text-caption" /></div>
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody className="divide-y divide-border-subtle">
                {visibleProjects.length === 0 ? (
                  <TableRow className="h-32 hover:bg-transparent border-0">
                    <TableCell colSpan={4} className="px-6 py-8 text-center text-sm text-muted">
                      No projects found matching the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleProjects.map(project => {
                    const isSelected = selectedId === project.id;

                    return (
                      <TableRow
                        key={project.id}
                        onClick={() => setSelectedId(project.id)}
                        className={`relative h-14 cursor-pointer transition-colors border-0 ${
                          isSelected
                            ? 'bg-accent-light/30'
                            : 'bg-surface-raised hover:bg-surface-muted/60'
                        }`}
                      >
                        <TableCell className="relative ps-5 pe-3 py-0 align-middle">
                          {isSelected && (
                            <span className="absolute inset-y-0 start-0 w-[3px] bg-primary pointer-events-none" aria-hidden="true" />
                          )}
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded border border-border-default bg-surface-muted flex items-center justify-center shrink-0">
                              <FolderKanban size={16} className="text-body-light" />
                            </div>
                            <span className="text-sm font-medium text-heading truncate whitespace-nowrap" title={project.name}>
                              {project.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-0 align-middle text-sm font-semibold text-heading tabular-nums text-start rtl:text-right whitespace-nowrap" title={formatMoney(project.budget, { maximumFractionDigits: 0 })}>
                          {formatCompactTableMoney(project.budget)}
                        </TableCell>
                        <TableCell className="px-3 py-0 align-middle text-sm text-body-light font-medium tabular-nums text-start rtl:text-right whitespace-nowrap">
                          {pct(project.utilizationPct)}
                        </TableCell>
                        <TableCell className="ps-3 pe-5 py-0 align-middle text-end rtl:text-left whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={`h-[22px] min-w-[90px] px-2.5 rounded text-xs font-semibold whitespace-nowrap justify-center ${getBadgeStyle(project.status)}`}
                          >
                            {formatStatus(project.status)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Right: Detail Panel */}
        <div className="w-full xl:w-[clamp(340px,26vw,400px)] xl:flex-none h-full overflow-y-auto space-y-3">

          {selectedProject ? (
            <>
              {/* Header */}
              <div className="bg-surface-raised border border-border-default rounded-card-sm p-4 shadow-card flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-heading leading-tight truncate">{selectedProject.name}</h2>
                  <Badge variant="outline" className={`mt-1.5 px-2.5 py-0.5 rounded text-xs font-semibold tracking-wide ${getBadgeStyle(selectedProject.status)}`}>
                    Status: {formatStatus(selectedProject.status)}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditProject(selectedProject)}
                    className="h-8 w-8 text-muted hover:text-body"
                    title="Edit project"
                    aria-label="Edit project"
                  >
                    <Pencil size={15} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="h-8 w-8 text-muted hover:text-danger hover:bg-danger-light"
                    title="Delete project"
                    aria-label="Delete project"
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>

              {/* Financial Health Card */}
              <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card overflow-hidden flex flex-col p-4">
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Financial Health</h3>

                <div className="flex flex-col gap-3 mb-4 md:flex-row md:justify-between md:items-end xl:flex-col xl:items-stretch">
                  <div>
                    <p className="text-xs font-medium text-muted mb-1">Budget</p>
                    <p className="text-2xl font-bold text-heading tracking-tight tabular-nums">{formatMoney(selectedProject.budget, { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="text-left md:text-right xl:text-left">
                    <p className="text-xs font-medium text-muted mb-1">Settled Spend</p>
                    <p className="text-xl font-bold text-accent tracking-tight tabular-nums">{formatMoney(selectedProject.spent, { maximumFractionDigits: 0 })}</p>
                    {(selectedProject.unvaluedSettlementCount > 0 || summary.unassignedSettlementCount > 0) && (
                      <p className="mt-2 text-xs text-muted">
                        {selectedProject.unvaluedSettlementCount > 0 ? `${selectedProject.unvaluedSettlementCount} settlement${selectedProject.unvaluedSettlementCount === 1 ? '' : 's'} missing base currency value. ` : ''}
                        {summary.unassignedSettlementCount > 0 ? `${summary.unassignedSettlementCount} settlement${summary.unassignedSettlementCount === 1 ? '' : 's'} not assigned to a project.` : ''}
                      </p>
                    )}
                  </div>
                </div>

                <Progress
                  value={Math.min(100, Math.max(0, selectedBudgetUtil || 0))}
                  className="h-2 mb-2 bg-surface-strong"
                  indicatorClassName="bg-accent"
                />

                <div className="text-right">
                  <span className="text-xs font-semibold text-accent">{pct(selectedBudgetUtil)} Utilized</span>
                </div>
              </div>

              {/* Sprints Tracker Card */}
              <div className="bg-surface-raised border border-border-default rounded-card-sm p-4 shadow-card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Sprints</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSprintOpen(true)}
                    className="h-7 text-xs font-semibold uppercase tracking-wider"
                  >
                    + Add Sprint
                  </Button>
                </div>

                {velocityComparison?.current && velocityComparison?.previous ? (
                  <div className="mb-4 rounded-button bg-surface-muted p-3 text-xs text-body">
                    <p className="font-semibold text-heading">Completed story points</p>
                    <p className="mt-1">{velocityComparison.current.name}: {velocityComparison.current.completedStoryPoints ?? 'No estimates'} pts ({formatDate(velocityComparison.current.startsAt)} – {formatDate(velocityComparison.current.endsAt)})</p>
                    <p>{velocityComparison.previous.name}: {velocityComparison.previous.completedStoryPoints ?? 'No estimates'} pts ({formatDate(velocityComparison.previous.startsAt)} – {formatDate(velocityComparison.previous.endsAt)})</p>
                    <p className="mt-1 font-semibold">{velocityComparison.deltaStoryPoints == null ? 'Comparison unavailable: one or both sprints have no estimated completions.' : `${velocityComparison.deltaStoryPoints > 0 ? '+' : ''}${velocityComparison.deltaStoryPoints} pts${velocityComparison.deltaPct == null ? '' : ` (${velocityComparison.deltaPct > 0 ? '+' : ''}${velocityComparison.deltaPct}%)`}`}</p>
                  </div>
                ) : velocityComparison?.current || selectedSprints.length > 0 ? (
                  <p className="mb-4 rounded-button bg-surface-muted p-3 text-xs text-muted">A comparison needs two completed sprints with recorded estimates.</p>
                ) : null}

                <div className="space-y-3">
                  {selectedSprints.length > 0 ? (
                    selectedSprints.map(sprint => (
                      <div key={sprint.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Clock size={16} className="text-accent flex-shrink-0" />
                          <span className="text-sm font-semibold text-heading truncate">{sprint.name}</span>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="block text-sm font-medium text-muted">{sprint.completionPct}%</span>
                          <span className="block text-[11px] text-caption" title={sprint.velocity.unestimatedCompletedIssues ? `${sprint.velocity.unestimatedCompletedIssues} completed issues have no estimate` : undefined}>
                            {sprint.velocity.completedStoryPoints == null ? 'No estimates' : `${sprint.velocity.completedStoryPoints} pts completed`}
                            {sprint.velocity.unestimatedCompletedIssues > 0 ? ` · ${sprint.velocity.unestimatedCompletedIssues} unestimated` : ''}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6">
                      <div className="w-10 h-10 bg-surface-muted rounded-full flex items-center justify-center mb-2.5">
                        <ClipboardList size={20} className="text-faint" />
                      </div>
                      <p className="text-sm font-medium text-body-light mb-3">No sprints for this project.</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSprintOpen(true)}
                        className="h-8 text-xs font-semibold uppercase tracking-wider"
                      >
                        + Add Sprint
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-muted">
              Select a project to view details.
            </div>
          )}

        </div>
      </div>
      <FormDialog open={projectOpen} onClose={() => setProjectOpen(false)} title="New project" subtitle="Add a project to the portfolio." busy={createProject.isPending} onConfirm={() => createProject.mutate()} confirmLabel="Create project">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-body">
            Project name
            <Input required value={projectForm.name} onChange={event => setProjectForm(current => ({ ...current, name: event.target.value }))} className="mt-1 w-full" />
          </label>
          <label className="block text-sm font-medium text-body">
            Budget
            <Input type="number" min="0" step="0.01" value={projectForm.budget} onChange={event => setProjectForm(current => ({ ...current, budget: event.target.value }))} className="mt-1 w-full" />
          </label>
        </div>
      </FormDialog>
      <FormDialog open={sprintOpen} onClose={() => setSprintOpen(false)} title="Add sprint" subtitle={selectedProject?.name} busy={createSprint.isPending} onConfirm={() => createSprint.mutate()} confirmLabel="Create sprint">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-body">
            Sprint name
            <Input required value={sprintForm.name} onChange={event => setSprintForm(current => ({ ...current, name: event.target.value }))} className="mt-1 w-full" />
          </label>
          <label className="block text-sm font-medium text-body">
            End date
            <Input type="date" value={sprintForm.endsAt} onChange={event => setSprintForm(current => ({ ...current, endsAt: event.target.value }))} className="mt-1 w-full" />
          </label>
        </div>
      </FormDialog>
      <FormDialog
        open={editProjectOpen}
        onClose={() => setEditProjectOpen(false)}
        title="Edit project"
        subtitle={selectedProject?.name}
        busy={updateProject.isPending}
        onConfirm={() => updateProject.mutate()}
        confirmLabel="Save changes"
        error={updateProject.error?.message}
      >
        <div className="space-y-4">
          <label className="block text-sm font-medium text-body">
            Project name
            <Input
              required
              value={editProjectForm.name}
              onChange={event => setEditProjectForm(current => ({ ...current, name: event.target.value }))}
              className="mt-1 w-full"
            />
          </label>
          <label className="block text-sm font-medium text-body">
            Budget
            <Input
              type="number"
              min="0"
              step="0.01"
              value={editProjectForm.budget}
              onChange={event => setEditProjectForm(current => ({ ...current, budget: event.target.value }))}
              className="mt-1 w-full"
            />
          </label>
          <label className="block text-sm font-medium text-body">Status
            <select
              value={editProjectForm.status}
              onChange={event => setEditProjectForm(current => ({ ...current, status: event.target.value }))}
              className="mt-1 w-full rounded-input border border-border-default px-3 py-2 bg-surface"
            >
              <option value="PLANNING">Planning</option>
              <option value="ACTIVE">Active</option>
              <option value="ON_TRACK">On Track</option>
              <option value="AT_RISK">At Risk</option>
              <option value="DELAYED">Delayed</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
        </div>
      </FormDialog>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => selectedProject && deleteProject.mutate(selectedProject.id)}
        title="Delete project?"
        description={`Are you sure you want to delete "${selectedProject?.name}"? All associated sprints, issues, and roadmap tasks will be affected.`}
        confirmLabel="Delete project"
        busy={deleteProject.isPending}
        danger
      />
    </div>
  );
}
