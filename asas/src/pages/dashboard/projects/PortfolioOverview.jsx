import React, { useState } from 'react';
import { 
  ChevronRight, 
  Search, 
  ChevronDown, 
  ChevronsUpDown,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  Info,
  Loader2,
  ClipboardList
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { projectsService } from '../../../services/projects.service';
import TopBarActions from '../../../components/TopBarActions';

const formatCurrency = (num) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0
  }).format(num);
};

const formatDate = (dateString) => {
  if (!dateString) return 'TBD';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

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

export default function PortfolioOverview() {
  const [selectedId, setSelectedId] = useState(null);

  const { data: responseData, isLoading, isError } = useQuery({
    queryKey: ['projects', 'portfolio'],
    queryFn: projectsService.getPortfolio,
  });

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

  const projects = responseData.data?.projects || [];

  // Auto-select first project if none selected
  if (!selectedId && projects.length > 0) {
    setSelectedId(projects[0].id);
  }

  const selectedProject = projects.find(p => p.id === selectedId);

  // Calculate metrics
  const activeProjects = projects.filter(p => ['ACTIVE', 'ON_TRACK', 'DELAYED', 'AT_RISK'].includes(p.status)).length;
  const totalBudget = projects.reduce((sum, p) => sum + (p.budget || 0), 0);
  const totalSpent = projects.reduce((sum, p) => sum + (p.spent || 0), 0);
  const budgetUtilization = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const selectedBudgetUtil = selectedProject?.budget ? Math.round((selectedProject.spent / selectedProject.budget) * 100) : 0;


  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-[1000px]">
      
      <TopBarActions>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors bg-surface-raised">
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
          
          <button className="bg-primary text-white px-4 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">
            Generate Report
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
            <p className="text-3xl font-bold text-heading">{budgetUtilization}%</p>
          </div>

          <div className="border border-border-default rounded-button p-5 bg-surface-raised shadow-card flex flex-col justify-between relative">
            <div className="flex justify-between items-start mb-3">
              <p className="text-[11px] font-bold text-muted tracking-wide">Total Projects</p>
            </div>
            <p className="text-3xl font-bold text-heading">{projects.length}</p>
          </div>

          <div className="border border-border-default rounded-button p-5 bg-surface-raised shadow-card flex flex-col justify-between">
            <p className="text-[11px] font-bold text-muted tracking-wide mb-3">Total Budget</p>
            <p className="text-3xl font-bold text-heading">{formatCurrency(totalBudget)}</p>
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
                  <div className="flex items-center gap-1">Timeline <ChevronsUpDown size={12} className="text-caption" /></div>
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
                        {formatCurrency(project.budget || 0)}
                      </td>
                      <td className="px-6 py-3.5 text-sm text-body-light font-medium">
                        {formatDate(project.timeline)}
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
                    <p className="text-2xl font-black text-heading tracking-tight tabular-nums">{formatCurrency(selectedProject.budget || 0)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-medium text-muted mb-1">Spent</p>
                    <p className="text-2xl font-black text-accent tracking-tight tabular-nums">{formatCurrency(selectedProject.spent || 0)}</p>
                  </div>
                </div>

                <div className="w-full bg-surface-strong rounded-full h-2 mb-2 overflow-hidden">
                  <motion.div 
                    layout 
                    initial={{ width: 0 }}
                    animate={{ width: `${selectedBudgetUtil}%` }}
                    transition={{ type: "spring", stiffness: 100, damping: 20 }}
                    className="bg-accent h-full rounded-full" 
                  />
                </div>
                
                <div className="text-right">
                  <span className="text-[11px] font-bold text-accent">{selectedBudgetUtil}% Utilized</span>
                </div>
              </div>

              {/* Sprints Tracker Card */}
              <div className="bg-surface-raised border border-border-default rounded-card-sm p-6 shadow-card">
                <h3 className="text-[11px] font-bold text-muted uppercase tracking-widest mb-6">Sprints</h3>
                
                <div className="space-y-4">
                  {selectedProject.sprints && selectedProject.sprints.length > 0 ? (
                    selectedProject.sprints.map(sprint => (
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
                      <button className="border border-border-default text-body px-4 py-1.5 rounded-button text-[11px] font-bold hover:bg-surface-muted transition-colors uppercase tracking-wider">
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
    </div>
  );
}