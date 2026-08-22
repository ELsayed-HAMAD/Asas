import React, { useState } from 'react';
import { 
  ChevronRight, 
  Search, 
  ChevronDown, 
  X,
  Folder,
  AlertTriangle,
  Lock,
  Edit2,
  Loader2,
  Clock
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { projectsService } from '../../../services/projects.service';
import TopBarActions from '../../../components/TopBarActions';

const COLOR_MAP = {
  blue: { bg: 'bg-[#dbeafe]', text: '#1d4ed8', border: 'border-[#3b82f6]' },
  green: { bg: 'bg-success-light', text: '#166534', border: 'border-[#22c55e]' },
  orange: { bg: 'bg-[#ffedd5]', text: '#9a3412', border: 'border-[#f97316]' },
  purple: { bg: 'bg-[#f3e8ff]', text: '#6b21a8', border: 'border-[#a855f7]' },
  red: { bg: 'bg-[#fee2e2]', text: '#b91c1c', border: 'border-[#ef4444]' },
  default: { bg: 'bg-surface-muted', text: '#475569', border: 'border-border-strong' }
};

export default function Roadmap() {
  const [isInspectorOpen, setInspectorOpen] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const { data: responseData, isLoading, isError } = useQuery({
    queryKey: ['projects', 'roadmap'],
    queryFn: projectsService.getRoadmap,
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

  const rawPhases = responseData.data?.phases || [];

  // Filter phases to H2 2026 (Q3/Q4) and fix completed progress logic
  const phases = rawPhases
    .filter(phase => phase.title.includes('Q3') || phase.title.includes('Q4'))
    .map(phase => {
      const visibleTasks = (phase.tasks || []).map(task => {
        let statusLabel = task.statusLabel;
        let progressPct = task.progressPct || 0;
        
        if (statusLabel === 'Completed') {
          progressPct = 100;
        } else if (statusLabel === 'Planned' && progressPct > 0) {
          statusLabel = 'In Progress';
        }
        
        return {
          ...task,
          statusLabel,
          progressPct
        };
      });
      return { ...phase, tasks: visibleTasks };
    });

  // Find selected task directly from phases
  let selectedTask = null;
  if (selectedId) {
    phases.forEach(p => {
      (p.tasks || []).forEach(t => {
        if (t.id === selectedId) selectedTask = t;
      });
    });
  }

  // Count total tasks for the header
  const totalTasks = phases.reduce((acc, p) => acc + (p.tasks?.length || 0), 0);

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-0">
      
      <TopBarActions>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input 
              type="text" 
              placeholder="Search..." 
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-muted w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
          
          <button className="bg-primary text-white px-5 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">
            Export
          </button>
        </div>
      </TopBarActions>

      {/* ── Main Workspace ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Pane Wrapper */}
        <div className="flex-1 flex flex-col bg-surface-raised min-w-0">
          
          {/* ── Stats Sub-header ── */}
          <div className="flex items-center justify-between px-6 md:px-8 py-3 border-b border-border-default flex-shrink-0">
            <div className="flex items-center gap-8 text-[11px] font-bold tracking-wide uppercase text-muted">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                Active Phases: <span className="text-heading ml-1">{phases.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
                Tracked Tasks: <span className="text-heading ml-1">{totalTasks}</span>
              </div>
            </div>
            
            <button className="flex items-center gap-2 text-xs font-semibold text-body hover:text-heading transition-colors bg-surface-muted px-3 py-1.5 rounded border border-border-subtle shadow-sm">
              Timeline: H2 2026 <ChevronDown size={14} className="text-caption" />
            </button>
          </div>
          
          {/* Left: Linear List Area */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8">
          
          <div className="max-w-4xl mx-auto space-y-8 pb-12">
            {phases.length === 0 ? (
              <div className="flex w-full items-center justify-center text-sm text-muted py-12">No roadmap data found.</div>
            ) : (
              phases.map(phase => (
                <div key={phase.id} className="space-y-4">
                  
                  {/* Phase Header */}
                  <div className="flex items-center gap-3 border-b border-border-default pb-2">
                    <Folder size={18} className="text-muted" />
                    <h3 className="text-sm font-bold text-heading uppercase tracking-widest">{phase.title}</h3>
                    <span className="text-[10px] font-bold text-muted bg-surface-muted px-2 py-0.5 rounded-full">
                      {phase.tasks?.length || 0} Tasks
                    </span>
                  </div>
                  
                  {/* Task List */}
                  <div className="flex flex-col gap-2">
                    {(phase.tasks || []).map(task => {
                      const isSelected = selectedId === task.id;
                      return (
                        <div 
                          key={task.id} 
                          onClick={() => { setSelectedId(task.id); setInspectorOpen(true); }}
                          className={`group flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-all ${isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border-default bg-surface hover:border-border-strong hover:shadow-sm'}`}
                        >
                          {/* Left: Info */}
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            {/* Status Indicator */}
                            <div className="w-2 h-2 rounded-full bg-primary shrink-0"></div>
                            
                            <div className="flex flex-col gap-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {task.taskCode && (
                                  <span className="text-[11px] font-semibold text-caption">{task.taskCode}</span>
                                )}
                                <span className="inline-flex items-center bg-surface-active px-2 py-0.5 rounded-full text-[10px] font-bold text-body">
                                  {task.statusLabel || 'Scheduled'}
                                </span>
                              </div>
                              <h4 className="text-[15px] font-bold text-heading truncate">{task.title}</h4>
                            </div>
                          </div>
                          
                          {/* Right: Meta & Actions */}
                          <div className="flex items-center gap-4 md:gap-6 shrink-0 pl-4">
                            {/* Dates */}
                            <div className="hidden md:flex items-center gap-1.5 text-[11px] font-medium text-caption bg-surface-muted px-2.5 py-1 rounded-md">
                              <Clock size={12} className="text-muted" />
                              <span>
                                {task.startDate ? new Date(task.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD'} - 
                                {task.endDate ? new Date(task.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD'}
                              </span>
                            </div>
                            
                            {/* Progress Ring */}
                            <div className="flex items-center gap-2 w-20 md:w-24">
                              <div className="w-full bg-surface-strong rounded-full h-1.5 overflow-hidden">
                                <div className="bg-primary h-full rounded-full" style={{ width: `${task.progressPct || 0}%` }}></div>
                              </div>
                              <span className="text-[11px] font-bold text-body w-7 text-right">{task.progressPct || 0}%</span>
                            </div>
                            
                            <ChevronRight size={16} className={`transition-colors ${isSelected ? 'text-primary' : 'text-muted group-hover:text-heading'}`} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
        </div>

        {/* Right: Inspector Panel */}
        {isInspectorOpen && (
          <div className="w-[340px] bg-surface-muted border-l border-border-default flex flex-col flex-shrink-0 shadow-panel">
            
            {/* Inspector Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border-default">
              <span className="text-[10px] font-bold text-caption uppercase tracking-widest">Inspector</span>
              <button onClick={() => setInspectorOpen(false)} className="text-caption hover:text-body transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              
              {selectedTask ? (
                <>
                  {/* Task Details Card */}
                  <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card">
                    <h2 className="text-xl font-extrabold text-heading leading-tight mb-3">{selectedTask.title}</h2>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="inline-flex items-center gap-1.5 bg-surface-active px-2 py-0.5 rounded-full text-[10px] font-bold">
                        {selectedTask.statusLabel || 'Scheduled'}
                      </span>
                      <span className="text-[11px] font-semibold text-caption">{selectedTask.taskCode}</span>
                    </div>
                    <p className="text-sm text-body-light leading-relaxed">
                      {selectedTask.description || 'No description provided.'}
                    </p>
                  </div>

                  {/* Progress Card */}
                  <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card">
                    <div className="flex justify-between items-end mb-6">
                      <div>
                        <p className="text-[10px] font-medium text-caption mb-1">Start Date</p>
                        <p className="text-sm font-bold text-heading font-mono">
                          {selectedTask.startDate ? new Date(selectedTask.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'}
                        </p>
                      </div>
                      <div className="h-6 w-px bg-surface-strong mx-2"></div>
                      <div className="text-right">
                        <p className="text-[10px] font-medium text-caption mb-1">End Date</p>
                        <p className="text-sm font-bold text-heading font-mono">
                          {selectedTask.endDate ? new Date(selectedTask.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-[11px] font-semibold text-muted">Progress</span>
                      <span className="text-[11px] font-bold text-heading">{selectedTask.progressPct || 0}%</span>
                    </div>
                    <div className="w-full bg-surface-strong rounded-full h-1.5 overflow-hidden">
                      <div className="bg-primary h-full rounded-full" style={{ width: `${selectedTask.progressPct || 0}%` }}></div>
                    </div>
                  </div>

                  {/* Assigned Team */}
                  <div>
                    <h3 className="text-[10px] font-bold text-caption uppercase tracking-widest mb-3 px-1 mt-6">Assigned Execution Team</h3>
                    <div className="flex items-center justify-between bg-surface-raised border border-border-default p-4 rounded-button shadow-card">
                      {selectedTask.assignees && selectedTask.assignees.length > 0 ? (
                        <div className="flex -space-x-2">
                          {selectedTask.assignees.map((assignee, idx) => (
                            <div key={idx} className="w-7 h-7 rounded-full bg-surface-strong border-2 border-white flex items-center justify-center text-[10px] font-bold text-body z-20" style={{ zIndex: 10 - idx }}>
                              {assignee.employee?.firstName?.[0]}{assignee.employee?.lastName?.[0]}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted">No assignees</div>
                      )}
                      <button className="text-[11px] font-bold text-heading hover:underline">View All</button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-muted text-sm text-center">
                  Select a task in the timeline to view details.
                </div>
              )}
            </div>

            {/* Inspector Footer */}
            {selectedTask && (
              <div className="p-5 border-t border-border-default bg-surface-raised mt-auto">
                <button className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">
                  <Edit2 size={14} />
                  Edit Timeline
                </button>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}