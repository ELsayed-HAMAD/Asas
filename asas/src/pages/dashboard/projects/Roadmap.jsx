import React, { useState } from 'react';
import { 
  ChevronRight, 
  Search, 
  ChevronDown, 
  X,
  Folder,
  AlertTriangle,
  Lock,
  Edit2
} from 'lucide-react';

// ── Mock Data for Gantt ────────────────────────────────────────

const GANTT_ROWS = [
  { id: 'p1', type: 'phase', title: 'PHASE 1: INFRASTRUCTURE' },
  { 
    id: 't1', type: 'task', title: 'Site Preparation', 
    barText: 'Site Prep v2.1', color: 'blue', start: 10, width: 15, rowIdx: 1 
  },
  { 
    id: 't2', type: 'task', title: 'Conveyor Installation', 
    barText: 'Main Assembly', color: 'green', start: 28, width: 25, rowIdx: 2, selected: true 
  },
  { 
    id: 't3', type: 'task', title: 'Electrical Routing', 
    barText: 'HV Wiring', color: 'orange', start: 45, width: 15, rowIdx: 3 
  },
  { id: 'p2', type: 'phase', title: 'PHASE 2: SOFTWARE INTEGRATION' },
  { 
    id: 't4', type: 'task', title: 'API Gateway', 
    barText: 'Endpoints', color: 'purple', start: 40, width: 10, rowIdx: 5 
  },
  { 
    id: 't5', type: 'task', title: 'WMS Sync', 
    barText: 'Warehouse DB Sync', color: 'blue', start: 48, width: 18, rowIdx: 6, milestone: 'red' 
  },
  { 
    id: 't6', type: 'task', title: 'Database Migration', 
    barText: 'Schema V3', color: 'orange', start: 52, width: 15, rowIdx: 7 
  },
  { 
    id: 't7', type: 'task', title: 'UI Refinement', 
    barText: 'Dashboard', color: 'green', start: 62, width: 10, rowIdx: 8 
  },
  { 
    id: 't8', type: 'task', title: 'Load Testing', 
    barText: 'Stress', color: 'purple', start: 68, width: 8, rowIdx: 9 
  },
  { 
    id: 't9', type: 'task', title: 'Security Audit', 
    barText: 'External Pen', color: 'blue', start: 72, width: 12, rowIdx: 10 
  },
  { 
    id: 't10', type: 'task', title: 'Beta Launch', 
    barText: 'Internal', color: 'orange', start: 75, width: 8, rowIdx: 11 
  },
  { 
    id: 't11', type: 'task', title: 'Mobile App Sync', 
    barText: 'iOS/Android API', color: 'green', start: 65, width: 15, rowIdx: 12 
  },
  { 
    id: 't12', type: 'task', title: 'Third-Party Connectors', 
    barText: 'ERP Hooks', color: 'purple', start: 68, width: 18, rowIdx: 13 
  },
  { 
    id: 't13', type: 'task', title: 'Documentation', 
    barText: 'API Docs', color: 'blue', start: 80, width: 10, rowIdx: 14 
  },
  { 
    id: 't14', type: 'task', title: 'Final Release', 
    barText: '', color: 'none', start: 95, width: 0, rowIdx: 15, milestone: 'black' 
  },
];

const COLOR_MAP = {
  blue: { bg: 'bg-[#dbeafe]', text: '#1d4ed8', border: 'border-[#3b82f6]' },
  green: { bg: 'bg-success-light', text: '#166534', border: 'border-[#22c55e]' },
  orange: { bg: 'bg-[#ffedd5]', text: '#9a3412', border: 'border-[#f97316]' },
  purple: { bg: 'bg-[#f3e8ff]', text: '#6b21a8', border: 'border-[#a855f7]' },
};

import TopBarActions from '../../../components/TopBarActions';

export default function Roadmap() {
  const [isInspectorOpen, setInspectorOpen] = useState(true);

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-[1200px]">
      
      <TopBarActions>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input 
              type="text" 
              placeholder="Search..." 
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-muted w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 border border-border-default rounded px-1.5 py-0.5 bg-surface-raised">
              <span className="text-[10px] text-caption font-medium">⌘K</span>
            </div>
          </div>
          
          <button className="flex items-center gap-2 text-sm font-medium text-body hover:text-heading transition-colors">
            Timeline: H2 2026 <ChevronDown size={14} className="text-caption" />
          </button>
          
          <button className="bg-primary text-white px-5 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">
            Export
          </button>
        </div>
      </TopBarActions>

      {/* ── Stats Sub-header ── */}
      <div className="flex items-center gap-8 px-6 py-3 border-b border-border-default bg-surface-raised flex-shrink-0 text-[11px] font-bold tracking-wide uppercase text-muted">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
          Active Epics: <span className="text-heading ml-1">14</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-success"></div>
          Schedule Variance: <span className="text-success ml-1">+2 Days</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
          Tracked Dependencies: <span className="text-heading ml-1">28</span>
        </div>
      </div>

      {/* ── Main Workspace ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left & Middle: Gantt Scrollable Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col bg-surface-raised">
          
          {/* Gantt Header (Sticky) */}
          <div className="flex border-b border-border-default sticky top-0 bg-surface-raised z-20">
            <div className="w-72 shrink-0 border-r border-border-default bg-surface-raised"></div>
            <div className="flex-1 grid grid-cols-4 text-center">
              <div className="py-3 text-[10px] font-bold text-muted uppercase tracking-widest border-r border-border-subtle">Aug</div>
              <div className="py-3 text-[10px] font-bold text-muted uppercase tracking-widest border-r border-border-subtle">Sep</div>
              <div className="py-3 text-[10px] font-bold text-muted uppercase tracking-widest border-r border-border-subtle">Oct</div>
              <div className="py-3 text-[10px] font-bold text-muted uppercase tracking-widest">Nov</div>
            </div>
          </div>

          {/* Gantt Body */}
          <div className="relative flex-1">
            
            {/* Background Grid Lines & Current Time Line */}
            <div className="absolute top-0 right-0 bottom-0 left-72 flex pointer-events-none z-0">
              <div className="flex-1 border-r border-border-subtle"></div>
              <div className="flex-1 border-r border-border-subtle"></div>
              <div className="flex-1 border-r border-border-subtle"></div>
              <div className="flex-1"></div>
              {/* Current Date Line (Dashed Blue) */}
              <div className="absolute top-0 bottom-0 border-l border-dashed border-blue-400" style={{ left: '60%' }}></div>
            </div>

            {/* SVG Dependency Lines (Absolute Overlay) */}
            <svg className="absolute top-0 right-0 bottom-0 left-72 w-full h-full pointer-events-none z-10" style={{ minWidth: 'calc(100% - 18rem)' }}>
              {/* Curve from Site Prep (Row 1) to Main Assembly (Row 2) */}
              {/* Row height is 48px. Site Prep bottom is ~96px. Main Assembly center is ~120px. */}
              <path 
                d="M 22% 90 C 22% 115, 27% 120, 27.5% 120" 
                fill="none" 
                stroke="#9ca3af" 
                strokeWidth="1.5" 
                strokeDasharray="4 2"
              />
              <polygon points="27.5%,120 26.5%,117 26.5%,123" fill="#9ca3af" />
            </svg>

            {/* Rows */}
            {GANTT_ROWS.map((row, idx) => {
              const isPhase = row.type === 'phase';
              const isSelected = row.selected;

              return (
                <div key={row.id} className={`flex h-12 border-b border-border-subtle relative z-10 ${isSelected ? 'bg-surface-muted/80' : 'bg-transparent'}`}>
                  
                  {/* Left Column: Task Name */}
                  <div className={`w-72 shrink-0 border-r border-border-default px-6 flex items-center ${isPhase ? 'bg-surface-muted/50' : ''}`}>
                    {isPhase ? (
                      <div className="flex items-center gap-2 text-[10px] font-bold text-muted uppercase tracking-wider">
                        <Folder size={14} className="text-caption" />
                        {row.title}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="w-1 h-1 rounded-full bg-gray-300"></div>
                        <span className={`text-sm ${isSelected ? 'font-bold text-heading' : 'font-medium text-body-light'}`}>
                          {row.title}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Timeline Area */}
                  <div className="flex-1 relative">
                    {!isPhase && row.type === 'task' && (
                      <div 
                        className={`absolute top-1/2 -translate-y-1/2 h-7 rounded-input rounded-l-none border-l-4 flex items-center px-3 shadow-card transition-transform hover:scale-[1.02] cursor-pointer
                          ${COLOR_MAP[row.color]?.bg || 'bg-transparent'} 
                          ${COLOR_MAP[row.color]?.border || 'border-transparent'}
                        `}
                        style={{ left: `${row.start}%`, width: `${row.width}%` }}
                      >
                        <span 
                          className="text-[10px] font-bold truncate"
                          style={{ color: COLOR_MAP[row.color]?.text }}
                        >
                          {row.barText}
                        </span>
                      </div>
                    )}

                    {/* Red Milestone Diamond (WMS Sync) */}
                    {row.milestone === 'red' && (
                      <div 
                        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-danger-light0 rotate-45 transform origin-center shadow-card z-20"
                        style={{ left: `calc(${row.start + row.width}% - 6px)` }}
                      ></div>
                    )}

                    {/* Black Milestone Diamond (Final Release) */}
                    {row.milestone === 'black' && (
                      <div 
                        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-primary rotate-45 transform origin-center shadow-card z-20"
                        style={{ left: `${row.start}%` }}
                      ></div>
                    )}
                  </div>
                </div>
              );
            })}
            
            {/* Empty padding rows to match image style */}
            <div className="flex h-12 border-b border-border-subtle"><div className="w-72 border-r border-border-default"></div><div className="flex-1"></div></div>
            <div className="flex h-12 border-b border-border-subtle"><div className="w-72 border-r border-border-default"></div><div className="flex-1"></div></div>

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
              
              {/* Task Details Card */}
              <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card">
                <h2 className="text-xl font-extrabold text-heading leading-tight mb-3">Conveyor Installation</h2>
                <div className="flex items-center gap-3 mb-4">
                  <span className="inline-flex items-center gap-1.5 bg-success-light text-success-text px-2 py-0.5 rounded-full text-[10px] font-bold">
                    <div className="w-1.5 h-1.5 rounded-full bg-success"></div>
                    On Track
                  </span>
                  <span className="text-[11px] font-semibold text-caption">TASK-8492</span>
                </div>
                <p className="text-sm text-body-light leading-relaxed">
                  Main assembly of the overhead sorting mechanism for Zone A.
                </p>
              </div>

              {/* Progress Card */}
              <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card">
                <div className="flex justify-between items-end mb-6">
                  <div>
                    <p className="text-[10px] font-medium text-caption mb-1">Start Date</p>
                    <p className="text-sm font-bold text-heading font-mono">Sep 01, 2026</p>
                  </div>
                  <div className="h-6 w-px bg-surface-strong mx-2"></div>
                  <div className="text-right">
                    <p className="text-[10px] font-medium text-caption mb-1">End Date</p>
                    <p className="text-sm font-bold text-heading font-mono">Oct 30, 2026</p>
                  </div>
                </div>
                
                <div className="flex justify-between items-end mb-2">
                  <span className="text-[11px] font-semibold text-muted">Progress</span>
                  <span className="text-[11px] font-bold text-heading">30%</span>
                </div>
                <div className="w-full bg-surface-strong rounded-full h-1.5 overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{ width: '30%' }}></div>
                </div>
              </div>

              {/* Dependencies Card */}
              <div>
                <h3 className="text-[10px] font-bold text-caption uppercase tracking-widest mb-3 px-1">Dependencies</h3>
                <div className="space-y-3">
                  {/* Blocked By */}
                  <div className="bg-danger-light border border-[#fee2e2] rounded-button p-4 flex items-start gap-3">
                    <AlertTriangle size={16} className="text-danger mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] font-medium text-danger mb-0.5">Blocked By</p>
                      <p className="text-sm font-bold text-danger-hover">Site Preparation</p>
                    </div>
                  </div>
                  
                  {/* Blocks */}
                  <div className="bg-surface-muted border border-border-default rounded-button p-4 flex items-start gap-3">
                    <Lock size={16} className="text-caption mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] font-medium text-muted mb-0.5">Blocks</p>
                      <p className="text-sm font-bold text-heading">Electrical Routing</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Assigned Team */}
              <div>
                <h3 className="text-[10px] font-bold text-caption uppercase tracking-widest mb-3 px-1 mt-6">Assigned Execution Team</h3>
                <div className="flex items-center justify-between bg-surface-raised border border-border-default p-4 rounded-button shadow-card">
                  <div className="flex -space-x-2">
                    <div className="w-7 h-7 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-accent-hover z-30">JD</div>
                    <div className="w-7 h-7 rounded-full bg-surface-strong border-2 border-white flex items-center justify-center text-[10px] font-bold text-body z-20">AW</div>
                    <div className="w-7 h-7 rounded-full bg-gray-300 border-2 border-white flex items-center justify-center text-[10px] font-bold text-heading z-10">MR</div>
                  </div>
                  <button className="text-[11px] font-bold text-heading hover:underline">View All</button>
                </div>
              </div>
            </div>

            {/* Inspector Footer */}
            <div className="p-5 border-t border-border-default bg-surface-raised mt-auto">
              <button className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">
                <Edit2 size={14} />
                Edit Timeline
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}