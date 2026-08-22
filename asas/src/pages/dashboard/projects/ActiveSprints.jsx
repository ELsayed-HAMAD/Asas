import React, { useState } from 'react';
import { 
  ChevronRight, 
  Search, 
  ChevronDown, 
  Rocket, 
  Clock, 
  Bell, 
  MoreHorizontal, 
  X,
  Circle,
  CheckSquare,
  Square,
  Eye,
  ChevronsUp,
  Equal,
  Send,
  MessageSquare,
  Code2,
  Loader2
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { projectsService } from '../../../services/projects.service';
import TopBarActions from '../../../components/TopBarActions';

export default function ActiveSprints() {
  const [selectedId, setSelectedId] = useState(null);
  
  const { data: responseData, isLoading, isError } = useQuery({
    queryKey: ['projects', 'sprints'],
    queryFn: projectsService.getSprints,
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
        Failed to load active sprints.
      </div>
    );
  }

  const sprints = responseData.data?.sprints || [];
  const activeSprint = sprints.length > 0 ? sprints[0] : null;
  const issues = activeSprint?.issues || [];

  const todoIssues = issues.filter(i => i.status === 'TODO');
  const inProgressIssues = issues.filter(i => i.status === 'IN_PROGRESS');
  const inReviewIssues = issues.filter(i => i.status === 'IN_REVIEW');
  const doneIssues = issues.filter(i => i.status === 'DONE');

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

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-[1000px]">
      
      <TopBarActions>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input 
              type="text" 
              placeholder="Search..." 
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-muted w-72 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
          
          <button className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors">
            Group: Status <ChevronDown size={14} className="text-caption" />
          </button>
          
          <button className="bg-primary text-white px-4 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">
            Complete Sprint
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
              
              <div className="flex items-center gap-2 text-muted font-medium">
                <Clock size={16} className="text-caption" />
                Time Remaining: TBD
              </div>

              <div className="w-px h-4 bg-gray-300"></div>

              <div className="flex items-center gap-3">
                <span className="text-muted font-medium">Completion: {dynamicCompletionPct}%</span>
                <div className="w-48 bg-surface-strong rounded-full h-1.5 overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{ width: `${dynamicCompletionPct}%` }}></div>
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
              
              {/* TODO GROUP */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-transparent border-2 border-gray-400"></div>
                  <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider">Todo <span className="ml-1 text-caption font-medium">{todoIssues.length}</span></h3>
                </div>
                <div className="space-y-2">
                  {todoIssues.length === 0 ? <div className="text-sm text-muted">No issues in todo.</div> : null}
                  {todoIssues.map(issue => {
                    const isSelected = selectedId === issue.id;
                    return (
                      <div 
                        key={issue.id}
                        onClick={() => setSelectedId(issue.id)}
                        className={`flex items-center justify-between p-3 rounded-button border cursor-pointer transition-colors ${
                          isSelected ? 'bg-accent-light/30 border-accent-light border-l-4 border-l-blue-600 shadow-card' : 'bg-surface-raised border-border-default hover:border-border-strong border-l-4 border-l-transparent shadow-card'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Circle size={20} className="text-faint" />
                          <span className="text-sm font-medium text-muted">{issue.key || issue.id.substring(issue.id.length - 8)}</span>
                          <span className="text-sm font-bold text-heading ml-1">{issue.title}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          {issue.tag && (
                            <span className="bg-surface-active text-body-light px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider">
                              {issue.tag}
                            </span>
                          )}
                          {issue.priority === 'HIGH' || issue.priority === 'URGENT' ? (
                            <ChevronsUp size={16} className="text-danger" strokeWidth={3} />
                          ) : (
                            <Equal size={16} className="text-caption" strokeWidth={3} />
                          )}
                          <div className="w-6 h-6 rounded-full bg-surface-active border border-border-default"></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* IN PROGRESS GROUP */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-[#3b82f6]"></div>
                  <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider">In Progress <span className="ml-1 text-caption font-medium">{inProgressIssues.length}</span></h3>
                </div>
                <div className="space-y-2">
                  {inProgressIssues.length === 0 ? <div className="text-sm text-muted">No issues in progress.</div> : null}
                  {inProgressIssues.map(issue => {
                    const isSelected = selectedId === issue.id;
                    return (
                      <div 
                        key={issue.id}
                        onClick={() => setSelectedId(issue.id)}
                        className={`flex items-center justify-between p-3 rounded-button border cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-accent-light/30 border-accent-light border-l-4 border-l-blue-600 shadow-card' 
                            : 'bg-surface-raised border-border-default hover:border-border-strong border-l-4 border-l-transparent shadow-card'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <HalfCircleIcon className="w-5 h-5 text-[#3b82f6]" />
                          <span className="text-sm font-medium text-muted">{issue.key || issue.id.substring(issue.id.length - 8)}</span>
                          <span className="text-sm font-bold text-heading ml-1">{issue.title}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          {issue.tag && (
                            <span className="bg-surface-active text-body-light px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider">
                              {issue.tag}
                            </span>
                          )}
                          {issue.priority === 'HIGH' || issue.priority === 'URGENT' ? (
                            <ChevronsUp size={16} className="text-danger" strokeWidth={3} />
                          ) : (
                            <Equal size={16} className="text-caption" strokeWidth={3} />
                          )}
                          <div className="w-6 h-6 rounded-full bg-surface-active border border-border-default"></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* IN REVIEW GROUP */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-[#eab308]"></div>
                  <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider">In Review <span className="ml-1 text-caption font-medium">{inReviewIssues.length}</span></h3>
                </div>
                <div className="space-y-2">
                  {inReviewIssues.length === 0 ? <div className="text-sm text-muted">No issues in review.</div> : null}
                  {inReviewIssues.map(issue => {
                    const isSelected = selectedId === issue.id;
                    return (
                      <div 
                        key={issue.id}
                        onClick={() => setSelectedId(issue.id)}
                        className={`flex items-center justify-between p-3 rounded-button border cursor-pointer transition-colors ${
                          isSelected ? 'bg-accent-light/30 border-accent-light border-l-4 border-l-blue-600 shadow-card' : 'bg-surface-raised border-border-default hover:border-border-strong border-l-4 border-l-transparent shadow-card'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Eye size={20} className="text-[#eab308]" />
                          <span className="text-sm font-medium text-muted">{issue.key || issue.id.substring(issue.id.length - 8)}</span>
                          <span className="text-sm font-bold text-heading ml-1">{issue.title}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          {issue.tag && (
                            <span className="bg-surface-active text-body-light px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider">
                              {issue.tag}
                            </span>
                          )}
                          {issue.priority === 'HIGH' || issue.priority === 'URGENT' ? (
                            <ChevronsUp size={16} className="text-danger" strokeWidth={3} />
                          ) : (
                            <Equal size={16} className="text-caption" strokeWidth={3} />
                          )}
                          <div className="w-6 h-6 rounded-full bg-surface-active border border-border-default"></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* DONE GROUP */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-success"></div>
                  <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider">Done <span className="ml-1 text-caption font-medium">{doneIssues.length}</span></h3>
                </div>
                <div className="space-y-2">
                  {doneIssues.length === 0 ? <div className="text-sm text-muted">No completed issues.</div> : null}
                  {doneIssues.map(issue => {
                    const isSelected = selectedId === issue.id;
                    return (
                      <div 
                        key={issue.id}
                        onClick={() => setSelectedId(issue.id)}
                        className={`flex items-center justify-between p-3 rounded-button border cursor-pointer transition-colors ${
                          isSelected ? 'bg-accent-light/30 border-accent-light border-l-4 border-l-blue-600 shadow-card' : 'bg-surface-raised border-border-default hover:border-border-strong border-l-4 border-l-transparent shadow-card opacity-60 hover:opacity-100'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <CheckSquare size={20} className="text-success" />
                          <span className="text-sm font-medium text-muted line-through">{issue.key || issue.id.substring(issue.id.length - 8)}</span>
                          <span className="text-sm font-bold text-heading ml-1 line-through">{issue.title}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          {issue.tag && (
                            <span className="bg-surface-active text-body-light px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider">
                              {issue.tag}
                            </span>
                          )}
                          <div className="w-6 h-6 rounded-full bg-surface-active border border-border-default"></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

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
                        <button className="hover:text-body transition-colors"><MoreHorizontal size={18} /></button>
                        <button onClick={() => setSelectedId(null)} className="hover:text-body transition-colors"><X size={18} /></button>
                      </div>
                    </div>

                    <h1 className="text-3xl font-extrabold text-heading leading-tight tracking-tight mb-4">
                      {selectedIssue.title}
                    </h1>

                    {/* Tags */}
                    <div className="flex items-center gap-2 mb-8">
                      <span className="inline-flex items-center gap-1.5 bg-[#eff6ff] text-[#3b82f6] px-2.5 py-1 rounded-full text-xs font-bold">
                        <HalfCircleIcon className="w-3.5 h-3.5" /> {selectedIssue.status.replace('_', ' ')}
                      </span>
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
                      <button className="absolute right-3 top-1/2 -translate-y-1/2 text-caption hover:text-black transition-colors">
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
    </div>
  );
}