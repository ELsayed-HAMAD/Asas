import React from 'react';
import { 
  ChevronRight, 
  Search, 
  ChevronDown,
  RefreshCw,
  Database,
  FileText
} from 'lucide-react';
import TopBarActions from '../../../components/TopBarActions';
import SettingsTabs from './SettingsTabs';

// ── Reusable Toggle Component ──────────────────────────────────
const Toggle = ({ on, color = 'green' }) => {
  let bgClass = 'bg-surface-strong';
  if (on) {
    bgClass = color === 'red' ? 'bg-danger' : 'bg-success';
  }
  const translateClass = on ? 'translate-x-5' : 'translate-x-0';
  const borderClass = !on ? 'border border-border-strong' : '';

  return (
    <div className={`w-10 h-5 rounded-full relative flex items-center px-0.5 cursor-pointer transition-colors shadow-panel ${bgClass}`}>
      <div className={`w-4 h-4 bg-on-primary rounded-full shadow-card transition-transform ${translateClass} ${borderClass}`}></div>
    </div>
  );
};

export default function SettingsDataExport() {
  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-[1000px]">
      
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
          
          <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-strong shrink-0"></div>
          
          <button className="bg-primary text-on-primary px-5 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card whitespace-nowrap">
            Create New
          </button>
        </div>
      </TopBarActions>

      <SettingsTabs />

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Configuration Content Area */}
        <div className="flex-1 overflow-y-auto p-8 max-w-4xl space-y-6">
          
          {/* New Export Request Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <h2 className="text-lg font-bold text-heading mb-6">New Export Request</h2>
            
            <div className="space-y-5">
              {/* Row 1: Scope & Format */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-muted mb-1.5">Data Scope</label>
                  <div className="relative">
                    <select className="w-full appearance-none border border-border-strong rounded-input px-3 py-2 text-sm text-heading bg-surface-raised focus:outline-none focus:ring-2 focus:ring-primary">
                      <option>Full Workspace</option>
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted mb-1.5">Format</label>
                  <div className="relative">
                    <select className="w-full appearance-none border border-border-strong rounded-input px-3 py-2 text-sm text-heading bg-surface-raised focus:outline-none focus:ring-2 focus:ring-primary">
                      <option>JSON & CSV</option>
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Row 2: Date Range */}
              <div>
                <label className="block text-xs font-bold text-muted mb-1.5">Date Range</label>
                <div className="relative">
                  <select className="w-full appearance-none border border-border-strong rounded-input px-3 py-2 text-sm text-heading bg-surface-raised focus:outline-none focus:ring-2 focus:ring-primary">
                    <option>All Time</option>
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button className="w-full bg-primary text-on-primary py-2.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card">
                  Generate Export Archive
                </button>
              </div>
            </div>
          </div>

          {/* Scheduled Backups Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <h2 className="text-lg font-bold text-heading mb-6">Scheduled Backups</h2>
            
            <div className="space-y-6">
              {/* Daily S3 Sync */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-surface-raised rounded-badge flex items-center justify-center shrink-0">
                    <RefreshCw size={22} className="text-accent" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-heading">Daily AWS S3 Sync</h3>
                    <p className="text-[11px] font-medium text-muted mt-0.5">Runs at 00:00 UTC</p>
                  </div>
                </div>
                <Toggle on={true} color="green" />
              </div>

              {/* Weekly Postgres Dump */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-surface-raised rounded-badge flex items-center justify-center shrink-0">
                    <Database size={22} className="text-muted" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-heading">Weekly PostgreSQL Dump</h3>
                    <p className="text-[11px] font-medium text-muted mt-0.5">Runs Sunday 02:00 UTC</p>
                  </div>
                </div>
                <Toggle on={false} />
              </div>
            </div>
          </div>

        </div>

        {/* Right: Recent Exports Panel */}
        <div className="w-[360px] bg-surface-raised border-l border-border-default flex flex-col flex-shrink-0 z-10">
          
          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <h2 className="text-lg font-bold text-heading mb-2">Recent Exports</h2>
            
            {/* Live Jobs Card */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card">
              <h3 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-4">Live Jobs</h3>
              
              <div className="mb-1">
                <div className="flex justify-between items-end mb-1.5">
                  <span className="text-sm font-semibold text-heading">Finance_Q3_Ledger.csv</span>
                  <span className="text-[11px] font-bold text-accent">65%</span>
                </div>
                <div className="w-full bg-surface-muted rounded-full h-1.5 overflow-hidden">
                  <div className="bg-accent h-full rounded-full" style={{ width: '65%' }}></div>
                </div>
                <div className="text-right mt-1.5">
                  <span className="text-[10px] font-medium text-muted">Processing...</span>
                </div>
              </div>
            </div>

            {/* Available Downloads Card */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card">
              <h3 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-4">Available Downloads</h3>
              
              <div className="space-y-5">
                {/* Download 1 */}
                <div>
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2 overflow-hidden mr-2">
                      <FileText size={14} className="text-muted shrink-0" />
                      <span className="text-sm font-semibold text-heading truncate">Workspace_Backup_O...</span>
                    </div>
                    <button className="text-[11px] font-semibold text-accent hover:text-accent-hover transition-colors shrink-0">
                      Download
                    </button>
                  </div>
                  <p className="text-[10px] font-medium text-warning ml-5">Link expires in 12h</p>
                </div>

                {/* Download 2 */}
                <div>
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2 overflow-hidden mr-2">
                      <FileText size={14} className="text-muted shrink-0" />
                      <span className="text-sm font-semibold text-heading truncate">HR_Roster_Export.json</span>
                    </div>
                    <button className="text-[11px] font-semibold text-accent hover:text-accent-hover transition-colors shrink-0">
                      Download
                    </button>
                  </div>
                  <p className="text-[10px] font-medium text-warning ml-5">Link expires in 2h</p>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}