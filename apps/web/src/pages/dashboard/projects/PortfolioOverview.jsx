import React, { useState } from 'react';
import {
  Search,
  ChevronDown,
  ChevronsUpDown,
  Clock,
  Loader2,
  ClipboardList
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../../../lib/api/projects';
import { queryKeys } from '../../../lib/queryKeys';
import { formatMoney } from '../../../lib/format';
import TopBarActions from '../../../components/TopBarActions';
import FormDialog from '../../../components/common/FormDialog';

const getBadgeStyle = (status) => {
  if (status === 'ACTIVE' || status === 'ON_TRACK') return "bg-success-light text-success-text";
  if (status === 'COMPLETED') return "bg-green-100 text-green-700";
  if (status === 'PLANNING') return "bg-blue-100 text-blue-700";
  if (status === 'AT_RISK') return "bg-yellow-100 text-yellow-700";
  if (status === 'DELAYED' || status === 'CANCELLED') return "bg-danger-light text-danger";
  return "bg-surface-strong text-body";
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
  const [projectOpen, setProjectOpen] = useState(false)
  const [sprintOpen, setSprintOpen] = useState(false)
  const [projectForm, setProjectForm] = useState({ name: '', budget: '' })
  const [sprintForm, setSprintForm] = useState({ name: '', endsAt: '' })

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
  const createProject = useMutation({
    mutationFn: () => projectsApi.createProject({ name: projectForm.name.trim(), budget: projectForm.budget || null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() }); setProjectOpen(false); setProjectForm({ name: '', budget: '' }) },
  })
  const createSprint = useMutation({
    mutationFn: () => projectsApi.createSprint({ name: sprintForm.name.trim(), projectId: selectedProject?.id, endsAt: sprintForm.endsAt ? new Date(`${sprintForm.endsAt}T00:00:00`).toISOString() : null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() }); setSprintOpen(false); setSprintForm({ name: '', endsAt: '' }) },
  })

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

  const summary = responseData.summary;
  // Utilization rows use `projectId`; normalize to `id` so the rest of the (old) page body is unchanged.
  const projects = (responseData.items || []).map(r => ({ ...r, id: r.projectId }));
  const sprints = sprintsData?.items || [];

  // Auto-select first project if none selected
  if (!selectedId && projects.length > 0) {
    setSelectedId(projects[0].id);
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
  const selectedBudgetUtil = selectedProject?.utilizationPct ?? null;

  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-[1000px]">

      <TopBarActions>
        <div className="flex items-center gap-3">
          <button
            disabled
            className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors bg-surface-raised disabled:opacity-60"
          >
            Filter: All Depts
            <ChevronDown size={14} className="text-caption" />
          </button>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              placeholder="Search..."
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-raised w-56 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          <button
            onClick={() => setProjectOpen(true)}
            className="bg-primary text-white px-4 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60"
          >
            New Project
          </button>
        </div>
      </TopBarActions>

      {/* ── KPIs Row ── */}
      <div className="px-6 py-5 flex-shrink-0 border-b border-border-default bg-surface-muted">
        <div className="grid grid-cols-4 gap-4">
          <div className="border border-border-default rounded-button p-5 bg-surface-raised shadow-card flex flex-col justify-between">
            <p className="text-[11px] font-bold text-muted tracking-wide mb-3">Total Active Projects</p>
            <p className="text-3xl font-bold text-heading">{activeProjects}</p>
          </div>

          <div className="border border-border-default rounded-button p-5 bg-surface-raised shadow-card flex flex-col justify-between">
            <p className="text-[11px] font-bold text-muted tracking-wide mb-3">Portfolio Budget Utilization</p>
            <p className="text-3xl font-bold text-heading">{pct(budgetUtilization)}</p>
          </div>

          <div className="border border-border-default rounded-button p-5 bg-surface-raised shadow-card flex flex-col justify-between relative">
            <div className="flex justify-between items-start mb-3">
              <p className="text-[11px] font-bold text-muted tracking-wide">Total Projects</p>
            </div>
            <p className="text-3xl font-bold text-heading">{totalProjects}</p>
          </div>

          <div className="border border-border-default rounded-button p-5 bg-surface-raised shadow-card flex flex-col justify-between">
            <p className="text-[11px] font-bold text-muted tracking-wide mb-3">Total Budget</p>
            <p className="text-3xl font-bold text-heading">{formatMoney(totalBudget, { maximumFractionDigits: 0 })}</p>
          </div>
        </div>
      </div>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: Table Area */}
        <div className="flex-1 overflow-y-auto bg-surface-raised flex flex-col border-r border-border-default">

          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-raised sticky top-0 z-10 border-b border-border-default shadow-card">
              <tr>
                <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">
                  <div className="flex items-center gap-1">Project <ChevronsUpDown size={12} className="text-caption" /></div>
                </th>
                <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">
                  <div className="flex items-center gap-1">Budget <ChevronsUpDown size={12} className="text-caption" /></div>
                </th>
                <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">
                  <div className="flex items-center gap-1">Utilization <ChevronsUpDown size={12} className="text-caption" /></div>
                </th>
                <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">
                  <div className="flex items-center gap-1">Status <ChevronsUpDown size={12} className="text-caption" /></div>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border-subtle">
              {projects.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-8 text-center text-sm text-muted">
                    No projects found.
                  </td>
                </tr>
              ) : (
                projects.map(project => {
                  const isSelected = selectedId === project.id;

                  return (
                    <tr
                      key={project.id}
                      onClick={() => setSelectedId(project.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-accent-light/60 border-l-4 border-l-blue-600' : 'bg-surface-raised hover:bg-surface-muted border-l-4 border-l-transparent'
                      }`}
                    >
                      <td className="px-6 py-3.5">
                        <span className="text-sm font-bold text-heading">{project.name}</span>
                      </td>
                      <td className="px-6 py-3.5 text-sm font-bold text-heading tabular-nums">
                        {formatMoney(project.budget, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-6 py-3.5 text-sm text-body-light font-medium">
                        {pct(project.utilizationPct)}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex px-2.5 py-1 rounded text-[11px] font-bold tracking-wider ${getBadgeStyle(project.status)}`}>
                          {formatStatus(project.status)}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Right: Detail Panel */}
        <div className="w-[440px] bg-surface-muted overflow-y-auto p-6 flex-shrink-0 space-y-6">

          {selectedProject ? (
            <>
              {/* Header */}
              <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card flex items-center justify-between">
                <h2 className="text-lg font-bold text-heading leading-tight">{selectedProject.name}</h2>
                <div className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wider ${getBadgeStyle(selectedProject.status)}`}>
                  Status: {formatStatus(selectedProject.status)}
                </div>
              </div>

              {/* Financial Health Card */}
              <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card overflow-hidden flex flex-col p-6">
                <h3 className="text-[11px] font-bold text-muted uppercase tracking-widest mb-6">Financial Health</h3>

                <div className="flex justify-between items-end mb-4">
                  <div>
                    <p className="text-[11px] font-medium text-muted mb-1">Budget</p>
                    <p className="text-2xl font-black text-heading tracking-tight tabular-nums">{formatMoney(selectedProject.budget, { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-medium text-muted mb-1">Spent</p>
                    <p className="text-2xl font-black text-accent tracking-tight tabular-nums">{formatMoney(selectedProject.spent, { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>

                <div className="w-full bg-surface-strong rounded-full h-2 mb-2 overflow-hidden">
                  <motion.div
                    layout
                    initial={{ width: 0 }}
                    animate={{ width: `${selectedBudgetUtil || 0}%` }}
                    transition={{ type: "spring", stiffness: 100, damping: 20 }}
                    className="bg-accent h-full rounded-full"
                  />
                </div>

                <div className="text-right">
                  <span className="text-[11px] font-bold text-accent">{pct(selectedBudgetUtil)} Utilized</span>
                </div>
              </div>

              {/* Sprints Tracker Card */}
              <div className="bg-surface-raised border border-border-default rounded-card-sm p-6 shadow-card">
                <h3 className="text-[11px] font-bold text-muted uppercase tracking-widest mb-6">Sprints</h3>

                <div className="space-y-4">
                  {selectedSprints.length > 0 ? (
                    selectedSprints.map(sprint => (
                      <div key={sprint.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Clock size={18} className="text-accent" />
                          <span className="text-sm font-bold text-heading">{sprint.name}</span>
                        </div>
                        <span className="text-sm font-medium text-muted">{sprint.completionPct}%</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8">
                      <div className="w-12 h-12 bg-surface-muted rounded-full flex items-center justify-center mb-3">
                        <ClipboardList size={24} className="text-faint" />
                      </div>
                      <p className="text-sm font-medium text-body-light mb-4">No sprints for this project.</p>
                      <button
                        onClick={() => setSprintOpen(true)}
                        className="border border-border-default text-body px-4 py-1.5 rounded-button text-[11px] font-bold hover:bg-surface-muted transition-colors uppercase tracking-wider disabled:opacity-60"
                      >
                        + Add Sprint
                      </button>
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
        <div className="space-y-4"><label className="block text-sm font-medium text-body">Project name<input required value={projectForm.name} onChange={event => setProjectForm(current => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label><label className="block text-sm font-medium text-body">Budget<input type="number" min="0" step="0.01" value={projectForm.budget} onChange={event => setProjectForm(current => ({ ...current, budget: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label></div>
      </FormDialog>
      <FormDialog open={sprintOpen} onClose={() => setSprintOpen(false)} title="Add sprint" subtitle={selectedProject?.name} busy={createSprint.isPending} onConfirm={() => createSprint.mutate()} confirmLabel="Create sprint">
        <div className="space-y-4"><label className="block text-sm font-medium text-body">Sprint name<input required value={sprintForm.name} onChange={event => setSprintForm(current => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label><label className="block text-sm font-medium text-body">End date<input type="date" value={sprintForm.endsAt} onChange={event => setSprintForm(current => ({ ...current, endsAt: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label></div>
      </FormDialog>
    </div>
  );
}
