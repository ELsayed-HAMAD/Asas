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
  Code2
} from 'lucide-react';

// ── Mock Data ────────────────────────────────────────────────
const SPRINT_ISSUES = {
  inProgress: [
    { id: 'PROJ-201', title: 'Integrate RFID Scanner API', tag: 'Backend', priority: 'high', selected: true },
    { id: 'PROJ-198', title: 'Optimize Database Queries for Inventory', tag: 'Database', priority: 'medium', selected: false },
    { id: 'PROJ-195', title: 'Implement OAuth 2.0 Flow', tag: 'Auth', priority: 'high', selected: false },
  ],
  inReview: [
    { id: 'PROJ-182', title: 'Audit Logging Middleware', tag: 'Security', priority: 'medium', selected: false },
    { id: 'PROJ-180', title: 'Update Dependency Vulnerabilities', tag: 'Security', priority: 'high', selected: false },
  ],
  todo: [
    { id: 'PROJ-205', title: 'Draft API Documentation', selected: false },
    { id: 'PROJ-206', title: 'Setup Staging Environment', selected: false },
    { id: 'PROJ-207', title: 'Design System QA', selected: false },
    { id: 'PROJ-208', title: 'Client Sync Meeting Prep', selected: false },
  ]
};

import TopBarActions from '../../../components/TopBarActions';

export default function ActiveSprints() {
  const [selectedId, setSelectedId] = useState('PROJ-201');

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
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 border border-border-default rounded px-1.5 py-0.5 bg-surface-raised shadow-card">
              <span className="text-[10px] text-caption font-medium">⌘K</span>
            </div>
          </div>
          
          <button className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors">
            Group: Status <ChevronDown size={14} className="text-caption" />
          </button>
          
          <button className="bg-primary text-white px-4 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">
            Complete Sprint
          </button>
        </div>
      </TopBarActions>

      {/* ── Sprint Info Bar ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border-default bg-surface-raised flex-shrink-0 text-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 font-bold text-heading">
            <Rocket size={16} className="text-body" />
            Sprint 42: Warehouse Automation
          </div>
          
          <div className="w-px h-4 bg-gray-300"></div>
          
          <div className="flex items-center gap-2 text-muted font-medium">
            <Clock size={16} className="text-caption" />
            Time Remaining: 3 Days
          </div>

          <div className="w-px h-4 bg-gray-300"></div>

          <div className="flex items-center gap-3">
            <span className="text-muted font-medium">Completion: 68%</span>
            <div className="w-48 bg-surface-strong rounded-full h-1.5 overflow-hidden">
              <div className="bg-primary h-full rounded-full" style={{ width: '68%' }}></div>
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
          
          {/* IN PROGRESS GROUP */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[#475569]"></div>
              <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider">In Progress <span className="ml-1 text-caption font-medium">5</span></h3>
            </div>
            <div className="space-y-2">
              {SPRINT_ISSUES.inProgress.map(issue => {
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
                      <HalfCircleIcon className="w-5 h-5 text-[#475569]" />
                      <span className="text-sm font-medium text-muted">{issue.id}</span>
                      <span className="text-sm font-bold text-heading ml-1">{issue.title}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      {issue.tag && (
                        <span className="bg-surface-active text-body-light px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider">
                          {issue.tag}
                        </span>
                      )}
                      {issue.priority === 'high' ? (
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
              <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider">In Review <span className="ml-1 text-caption font-medium">3</span></h3>
            </div>
            <div className="space-y-2">
              {SPRINT_ISSUES.inReview.map(issue => {
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
                      <span className="text-sm font-medium text-muted">{issue.id}</span>
                      <span className="text-sm font-bold text-heading ml-1">{issue.title}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      {issue.tag && (
                        <span className="bg-surface-active text-body-light px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider">
                          {issue.tag}
                        </span>
                      )}
                      {issue.priority === 'high' ? (
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

          {/* TODO GROUP */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-transparent border-2 border-gray-400"></div>
              <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider">Todo <span className="ml-1 text-caption font-medium">8</span></h3>
            </div>
            <div className="space-y-2">
              {SPRINT_ISSUES.todo.map(issue => {
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
                      <span className="text-sm font-medium text-muted">{issue.id}</span>
                      <span className="text-sm font-bold text-heading ml-1">{issue.title}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>

        {/* Right: Detail Panel */}
        <div className="w-[450px] bg-surface border-l border-border-default flex flex-col flex-shrink-0">
          
          {/* Details Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6">
            
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-muted">PROJ-201</span>
              <div className="flex items-center gap-2 text-caption">
                <button className="hover:text-body transition-colors"><MoreHorizontal size={18} /></button>
                <button className="hover:text-body transition-colors"><X size={18} /></button>
              </div>
            </div>

            <h1 className="text-3xl font-extrabold text-heading leading-tight tracking-tight mb-4">
              Integrate RFID Scanner API
            </h1>

            {/* Tags */}
            <div className="flex items-center gap-2 mb-8">
              <span className="inline-flex items-center gap-1.5 bg-[#eff6ff] text-[#3b82f6] px-2.5 py-1 rounded-full text-xs font-bold">
                <HalfCircleIcon className="w-3.5 h-3.5" /> In Progress
              </span>
              <span className="inline-flex items-center gap-1 bg-danger-light text-danger px-2.5 py-1 rounded-full text-xs font-bold">
                <ChevronsUp size={14} strokeWidth={3} /> High Priority
              </span>
            </div>

            {/* Checklist Box */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card mb-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-bold text-heading">Checklist (33%)</h3>
                <div className="w-24 bg-surface-strong rounded-full h-2 overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{ width: '33%' }}></div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckSquare size={18} className="text-black shrink-0 mt-0.5" fill="black" stroke="white" />
                  <span className="text-sm font-medium text-muted line-through">Auth Token implementation</span>
                </div>
                <div className="flex items-start gap-3">
                  <Square size={18} className="text-faint shrink-0 mt-0.5" />
                  <span className="text-sm font-medium text-body">Webhook payload parsing</span>
                </div>
                <div className="flex items-start gap-3">
                  <Square size={18} className="text-faint shrink-0 mt-0.5" />
                  <span className="text-sm font-medium text-body">Unit tests</span>
                </div>
              </div>
            </div>

            {/* Activity Feed Box */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card">
              <h3 className="text-sm font-bold text-heading mb-6">Activity & Pull Requests</h3>
              
              <div className="relative pl-4 space-y-8">
                {/* Vertical Timeline Line */}
                <div className="absolute left-[31px] top-4 bottom-0 w-px bg-surface-strong"></div>
                
                {/* PR Item */}
                <div className="relative z-10 flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-surface-active border border-border-default flex items-center justify-center shrink-0 shadow-card mt-0.5"></div>
                  <div>
                    <p className="text-sm text-body leading-relaxed">
                      <span className="font-bold text-heading">Mark D. opened PR #402</span> in <span className="font-semibold text-heading bg-surface-active px-1 rounded">asas-backend</span>
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="inline-flex items-center gap-1.5 border border-[#bbf7d0] bg-[#f0fdf4] text-success-text px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase">
                        <div className="w-1.5 h-1.5 rounded-full bg-success"></div>
                        Build: Passing
                      </span>
                      <Code2 size={14} className="text-caption" />
                    </div>
                    <p className="text-xs text-muted mt-2 font-medium">2 hours ago</p>
                  </div>
                </div>

                {/* Status Update Item */}
                <div className="relative z-10 flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-surface-active border border-border-default flex items-center justify-center shrink-0 shadow-card mt-0.5">
                    <MessageSquare size={14} className="text-muted" />
                  </div>
                  <div>
                    <p className="text-sm text-body leading-relaxed">
                      <span className="font-bold text-heading">System marked issue as</span> <span className="text-[#3b82f6] font-semibold">In Progress</span>
                    </p>
                    <p className="text-xs text-muted mt-1 font-medium">Yesterday</p>
                  </div>
                </div>

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

        </div>
      </div>
    </div>
  );
}