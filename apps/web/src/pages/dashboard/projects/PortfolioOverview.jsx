import { useEffect, useState } from 'react';
import {
  Activity,
  Percent,
  Layers,
  Wallet,
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
import FormDialog from '../../../components/common/FormDialog';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import SearchInput from '../../../components/common/SearchInput';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';

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
      <div className="flex h-full items-center justify-center bg-surface-raised">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  if (isError || !responseData) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised text-danger">
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
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-0">

      {/* ── KPIs Row ── */}
      <div className="px-4 xl:px-5 pt-4 pb-1 flex-shrink-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Active Projects */}
          <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] transition-all duration-200 hover:border-slate-300/80 hover:shadow-[0_4px_16px_-4px_rgba(15,23,42,0.08)] flex flex-col justify-between min-h-[124px]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Active Projects</p>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-slate-900 my-1 tabular-nums">{activeProjects}</p>
            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${totalProjects > 0 ? Math.min(100, Math.max(0, (activeProjects / totalProjects) * 100)) : 0}%` }}
              />
            </div>
          </div>

          {/* Card 2: Portfolio Budget Utilization */}
          <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] transition-all duration-200 hover:border-slate-300/80 hover:shadow-[0_4px_16px_-4px_rgba(15,23,42,0.08)] flex flex-col justify-between min-h-[124px]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Portfolio Budget Utilization</p>
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 flex items-center justify-center shrink-0">
                <Percent className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-slate-900 my-1 tabular-nums">{pct(budgetUtilization)}</p>
            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, budgetUtilization || 0))}%` }}
              />
            </div>
          </div>

          {/* Card 3: Total Projects */}
          <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] transition-all duration-200 hover:border-slate-300/80 hover:shadow-[0_4px_16px_-4px_rgba(15,23,42,0.08)] flex flex-col justify-between min-h-[124px]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Projects</p>
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 flex items-center justify-center shrink-0">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-slate-900 my-1 tabular-nums">{totalProjects}</p>
            <div className="h-1.5 w-full rounded-full bg-slate-100 flex overflow-hidden gap-0.5">
              <div className="h-full flex-[4] rounded-full bg-emerald-500" />
              <div className="h-full flex-[3] rounded-full bg-blue-500" />
              <div className="h-full flex-[2] rounded-full bg-amber-500" />
              <div className="h-full flex-[1] rounded-full bg-rose-500" />
            </div>
          </div>

          {/* Card 4: Total Budget */}
          <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] transition-all duration-200 hover:border-slate-300/80 hover:shadow-[0_4px_16px_-4px_rgba(15,23,42,0.08)] flex flex-col justify-between min-h-[124px] relative" style={{ containerType: 'inline-size' }}>
            <div className="absolute top-4 end-4 w-8 h-8 rounded-xl bg-slate-900/5 border border-slate-900/10 text-slate-700 flex items-center justify-center shrink-0 pointer-events-none">
              <Wallet className="w-4 h-4" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 pe-10">Total Budget</p>
            <p className="text-2xl text-[28px] font-bold tracking-tight text-slate-900 my-1 tabular-nums truncate" title={totalBudgetText} style={{ fontSize: totalBudgetFontSize }}>{totalBudgetText}</p>
            <div className="h-1.5 w-full rounded-full bg-slate-200/80" />
          </div>
        </div>
      </div>

      {/* ── Main Master-Detail Grid ── */}
      <div className="flex-1 p-4 xl:p-5 pt-2 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">

          {/* Left Column (lg:col-span-8 space-y-3) */}
          <div className="lg:col-span-8 space-y-3">
            {/* Standalone Filter Toolbar */}
            <div className="bg-white/80 backdrop-blur-xl border border-slate-200/70 rounded-2xl p-2.5 sm:p-3 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)] flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5">
              {/* Left Cluster inside this toolbar */}
              <div className="flex flex-1 flex-wrap sm:flex-nowrap items-center gap-2.5 min-w-0">
                <SearchInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  aria-label="Search projects"
                  title="Search projects"
                  wrapperClassName="w-full sm:w-64 md:w-72 shrink-0"
                />

                <Select
                  value={departmentId}
                  onValueChange={(val) => setDepartmentId(val)}
                >
                  <SelectTrigger
                    aria-label="Filter by department"
                    className="h-9 w-auto min-w-[140px] pl-3.5 pr-8 rounded-xl bg-slate-100/75 hover:bg-slate-100 border border-slate-200/70 text-xs sm:text-sm font-medium text-slate-700 shrink-0 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50"
                  >
                    <SelectValue placeholder="Filter: All Depts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Filter: All Depts</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Right Cluster inside this toolbar */}
              <div className="shrink-0">
                <Button
                  onClick={() => setProjectOpen(true)}
                  className="h-9 px-3.5 rounded-xl text-xs sm:text-sm font-medium inline-flex items-center justify-center whitespace-nowrap shadow-sm"
                >
                  New Project
                </Button>
              </div>
            </div>

            {/* Projects Table Card */}
            <div data-testid="project-table-card" className="bg-white/80 backdrop-blur-xl border border-slate-200/70 rounded-2xl shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)] overflow-hidden">
              <div className="max-h-[386px] xl:max-h-[440px] overflow-y-auto overflow-x-hidden">
                <Table wrapperClassName="overflow-x-hidden" className="w-full table-fixed border-collapse">
                  <colgroup>
                    <col className="min-w-[180px]" />
                    <col style={{ width: '110px' }} />
                    <col style={{ width: '105px' }} />
                    <col style={{ width: '120px' }} />
                  </colgroup>
                  <TableHeader className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                    <TableRow className="hover:bg-transparent border-0">
                  <TableHead className="py-2.5 px-4 text-start rtl:text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                    <div className="flex items-center gap-1">Project <ChevronsUpDown size={12} className="text-slate-400" /></div>
                  </TableHead>
                  <TableHead className="py-2.5 px-4 text-start rtl:text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                    <div className="flex items-center gap-1">Budget <ChevronsUpDown size={12} className="text-slate-400" /></div>
                  </TableHead>
                  <TableHead className="py-2.5 px-4 text-start rtl:text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                    <div className="flex items-center gap-1">Utilization <ChevronsUpDown size={12} className="text-slate-400" /></div>
                  </TableHead>
                  <TableHead className="py-2.5 px-4 text-end rtl:text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">Status <ChevronsUpDown size={12} className="text-slate-400" /></div>
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody className="divide-y divide-slate-100/80">
                {visibleProjects.length === 0 ? (
                  <TableRow className="h-28 hover:bg-transparent border-0">
                    <TableCell colSpan={4} className="px-6 py-6 text-center text-sm text-slate-500">
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
                        className={`relative cursor-pointer transition-colors border-0 border-b border-slate-100/80 last:border-b-0 ${
                          isSelected
                            ? 'bg-accent-light/30'
                            : 'bg-transparent hover:bg-slate-50/70'
                        }`}
                      >
                        <TableCell className="relative py-2.5 px-4 align-middle">
                          {isSelected && (
                            <span className="absolute inset-y-0 start-0 w-[3px] bg-primary pointer-events-none rounded-r" aria-hidden="true" />
                          )}
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg border border-slate-200/70 bg-slate-50 flex items-center justify-center shrink-0">
                              <FolderKanban size={15} className="text-slate-500" />
                            </div>
                            <span className="text-sm font-medium text-slate-900 truncate whitespace-nowrap" title={project.name}>
                              {project.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 px-4 align-middle text-sm font-semibold text-slate-900 tabular-nums text-start rtl:text-right whitespace-nowrap" title={formatMoney(project.budget, { maximumFractionDigits: 0 })}>
                          {formatCompactTableMoney(project.budget)}
                        </TableCell>
                        <TableCell className="py-2.5 px-4 align-middle text-sm text-slate-600 font-medium tabular-nums text-start rtl:text-right whitespace-nowrap">
                          {pct(project.utilizationPct)}
                        </TableCell>
                        <TableCell className="py-2.5 px-4 align-middle text-end rtl:text-left whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={`h-[22px] min-w-[85px] px-2 rounded-full text-xs font-semibold whitespace-nowrap justify-center ${getBadgeStyle(project.status)}`}
                          >
                            {formatStatus(project.status)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

        {/* Right Column — Project Inspector Panel (lg:col-span-4 space-y-3) */}
        <div className="lg:col-span-4 space-y-3">
            {selectedProject ? (
              <>
                {/* Card 1: Project Header Card */}
                <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] transition-all duration-200 hover:border-slate-300/80 hover:shadow-[0_4px_16px_-4px_rgba(15,23,42,0.08)] flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-slate-900/5 border border-slate-200/80 flex items-center justify-center text-slate-700 shrink-0 mt-0.5">
                      <FolderKanban size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-semibold text-slate-900 leading-tight break-words">{selectedProject.name}</h2>
                      <Badge variant="outline" className={`mt-1.5 inline-flex text-xs px-2.5 py-0.5 rounded-full font-semibold ${getBadgeStyle(selectedProject.status)}`}>
                        Status: {formatStatus(selectedProject.status)}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditProject(selectedProject)}
                      className="w-8 h-8 rounded-xl bg-white/80 hover:bg-slate-100 border border-slate-200/70 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors"
                      title="Edit project"
                      aria-label="Edit project"
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirmOpen(true)}
                      className="w-8 h-8 rounded-xl bg-white/80 hover:bg-red-50 border border-slate-200/70 flex items-center justify-center text-slate-500 hover:text-red-600 transition-colors"
                      title="Delete project"
                      aria-label="Delete project"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>

                {/* Card 2: Financial Health Card */}
                <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] transition-all duration-200 hover:border-slate-300/80 hover:shadow-[0_4px_16px_-4px_rgba(15,23,42,0.08)] flex flex-col">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2.5">Financial Health</h3>

                  <div className="grid grid-cols-2 gap-2.5 mb-3">
                    <div className="bg-slate-50/80 border border-slate-200/60 rounded-xl p-3 min-w-0" style={{ containerType: 'inline-size' }}>
                      <p className="text-xs text-slate-500 font-medium">Budget</p>
                      <p
                        className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5 tabular-nums truncate"
                        style={{ fontSize: 'clamp(0.75rem, 8cqw, 1.125rem)' }}
                        title={formatMoney(selectedProject.budget, { maximumFractionDigits: 0 })}
                      >
                        {formatMoney(selectedProject.budget, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                    <div className="bg-indigo-50/40 border border-indigo-100/80 rounded-xl p-3 min-w-0" style={{ containerType: 'inline-size' }}>
                      <p className="text-xs text-indigo-600/80 font-medium">Settled Spend</p>
                      <p
                        className="text-2xl font-bold tracking-tight text-indigo-600 mt-0.5 tabular-nums truncate"
                        style={{ fontSize: 'clamp(0.75rem, 8cqw, 1.125rem)' }}
                        title={formatMoney(selectedProject.spent, { maximumFractionDigits: 0 })}
                      >
                        {formatMoney(selectedProject.spent, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>

                  {(selectedProject.unvaluedSettlementCount > 0 || summary.unassignedSettlementCount > 0) && (
                    <p className="mb-2.5 text-[11px] text-slate-400">
                      {selectedProject.unvaluedSettlementCount > 0 ? `${selectedProject.unvaluedSettlementCount} settlement${selectedProject.unvaluedSettlementCount === 1 ? '' : 's'} missing base currency value. ` : ''}
                      {summary.unassignedSettlementCount > 0 ? `${summary.unassignedSettlementCount} settlement${summary.unassignedSettlementCount === 1 ? '' : 's'} not assigned to a project.` : ''}
                    </p>
                  )}

                  <div className="flex items-center gap-3 mt-0.5">
                    <Progress
                      value={Math.min(100, Math.max(0, selectedBudgetUtil || 0))}
                      className="flex-1 h-2 rounded-full bg-slate-100"
                      indicatorClassName="bg-indigo-600"
                    />
                    <span className="text-xs font-semibold text-indigo-600 shrink-0">
                      {pct(selectedBudgetUtil)} Utilized
                    </span>
                  </div>
                </div>

                {/* Card 3: Sprints Card */}
                <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] transition-all duration-200 hover:border-slate-300/80 hover:shadow-[0_4px_16px_-4px_rgba(15,23,42,0.08)]">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sprints</h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSprintOpen(true)}
                      className="h-7 px-2.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider bg-white/80 hover:bg-slate-100 border-slate-200/80 shadow-xs"
                    >
                      + Add Sprint
                    </Button>
                  </div>

                  {velocityComparison?.current && velocityComparison?.previous ? (
                    <div className="mb-3 rounded-lg bg-slate-50 border border-slate-200/60 p-2.5 text-xs text-slate-600">
                      <p className="font-semibold text-slate-900">Completed story points</p>
                      <p className="mt-0.5 text-[11px]">{velocityComparison.current.name}: {velocityComparison.current.completedStoryPoints ?? 'No estimates'} pts ({formatDate(velocityComparison.current.startsAt)} – {formatDate(velocityComparison.current.endsAt)})</p>
                      <p className="text-[11px]">{velocityComparison.previous.name}: {velocityComparison.previous.completedStoryPoints ?? 'No estimates'} pts ({formatDate(velocityComparison.previous.startsAt)} – {formatDate(velocityComparison.previous.endsAt)})</p>
                      <p className="mt-1 text-[11px] font-semibold">{velocityComparison.deltaStoryPoints == null ? 'Comparison unavailable: one or both sprints have no estimated completions.' : `${velocityComparison.deltaStoryPoints > 0 ? '+' : ''}${velocityComparison.deltaStoryPoints} pts${velocityComparison.deltaPct == null ? '' : ` (${velocityComparison.deltaPct > 0 ? '+' : ''}${velocityComparison.deltaPct}%)`}`}</p>
                    </div>
                  ) : velocityComparison?.current || selectedSprints.length > 0 ? (
                    <p className="mb-3 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-500">A comparison needs two completed sprints with recorded estimates.</p>
                  ) : null}

                  <div className="space-y-2">
                    {selectedSprints.length > 0 ? (
                      selectedSprints.map(sprint => (
                        <div key={sprint.id} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-slate-50/60 border border-slate-200/50">
                          <div className="flex items-center gap-2 min-w-0">
                            <Clock size={14} className="text-indigo-600 shrink-0" />
                            <span className="text-xs font-semibold text-slate-900 truncate">{sprint.name}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="block text-xs font-medium text-slate-600">{sprint.completionPct}%</span>
                            <span className="block text-[10px] text-slate-400" title={sprint.velocity.unestimatedCompletedIssues ? `${sprint.velocity.unestimatedCompletedIssues} completed issues have no estimate` : undefined}>
                              {sprint.velocity.completedStoryPoints == null ? 'No estimates' : `${sprint.velocity.completedStoryPoints} pts completed`}
                              {sprint.velocity.unestimatedCompletedIssues > 0 ? ` · ${sprint.velocity.unestimatedCompletedIssues} unestimated` : ''}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="bg-slate-50/60 border border-dashed border-slate-200/80 rounded-xl py-5 px-4 flex flex-col items-center justify-center text-center gap-2">
                        <div className="w-9 h-9 rounded-xl bg-white shadow-sm border border-slate-200/60 flex items-center justify-center text-slate-400">
                          <ClipboardList size={18} />
                        </div>
                        <p className="text-xs text-slate-500 font-medium">No sprints for this project.</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-gradient-to-b from-white/95 to-slate-50/60 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-6 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.05),inset_0_1px_0_0_rgba(255,255,255,0.9)] flex items-center justify-center text-slate-400 text-sm">
                Select a project to view details.
              </div>
            )}
          </div>
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
          <div>
            <label htmlFor="edit-project-status" className="block text-sm font-medium text-body mb-1">Status</label>
            <Select
              value={editProjectForm.status}
              onValueChange={val => setEditProjectForm(current => ({ ...current, status: val }))}
            >
              <SelectTrigger id="edit-project-status" className="h-9 w-full text-sm bg-surface-raised">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PLANNING">Planning</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="ON_TRACK">On Track</SelectItem>
                <SelectItem value="AT_RISK">At Risk</SelectItem>
                <SelectItem value="DELAYED">Delayed</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
