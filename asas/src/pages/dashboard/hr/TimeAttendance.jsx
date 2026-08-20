import React, { useState } from 'react';
import { 
  ChevronRight, 
  Download, 
  ChevronDown, 
  X, 
  AlertTriangle, 
  Clock, 
  MoreHorizontal, 
  Pencil
} from 'lucide-react';

// ── Mock Data ────────────────────────────────────────────────

const EXCEPTIONS = [
  { id: 'exc_1', name: 'Sarah Jenkins', avatar: 'SJ', type: 'missing_out', label: 'Missing Out-Punch', date: 'Jun 04', alert: true },
  { id: 'exc_2', name: 'Marcus Chen', avatar: 'MC', type: 'overtime', label: 'Overtime +2h', date: 'Jun 03', alert: false },
  { id: 'exc_3', name: 'Elena Rodriguez', avatar: 'ER', type: 'missing_in', label: 'Missing In-Punch', date: 'Jun 02', alert: true },
  { id: 'exc_4', name: 'David Kim', avatar: 'DK', type: 'overtime', label: 'Overtime +1.5h', date: 'Jun 01', alert: false },
];

const LEAVE_REQUESTS = [
  { id: 'req_1', name: 'James Wilson', avatar: 'JW', type: 'Vacation', date: 'Jun 10 - Jun 14' },
  { id: 'req_2', name: 'Maria Garcia', avatar: 'MG', type: 'Sick Leave', date: 'Jun 05' },
  { id: 'req_3', name: 'Robert Taylor', avatar: 'RT', type: 'Vacation', date: 'Jul 01 - Jul 05' },
  { id: 'req_4', name: 'Linda Martinez', avatar: 'LM', type: 'Personal', date: 'Jun 12' },
  { id: 'req_5', name: 'William Anderson', avatar: 'WA', type: 'Vacation', date: 'Aug 15 - Aug 20' },
  { id: 'req_6', name: 'Patricia Thomas', avatar: 'PT', type: 'Sick Leave', date: 'Jun 04' },
  { id: 'req_7', name: 'Charles Jackson', avatar: 'CJ', type: 'Vacation', date: 'Sep 01 - Sep 10' },
  { id: 'req_8', name: 'Susan White', avatar: 'SW', type: 'Personal', date: 'Jun 18' },
];

import TopBarActions from '../../../components/TopBarActions';

export default function TimeAttendance() {
  const [selectedId, setSelectedId] = useState('exc_1');

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-[1000px]">
      
      <TopBarActions>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 border border-border-default text-body px-4 py-2 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors">
            <Download size={16} /> Export
          </button>
          <button className="bg-primary text-white px-5 py-2 rounded-input text-sm font-medium hover:bg-primary-hover transition-colors">
            Approve All Valid
          </button>
        </div>
      </TopBarActions>

      {/* ── Toolbar & KPIs ── */}
      <div className="px-6 py-5 flex-shrink-0 border-b border-border-default bg-surface-raised z-10">
        
        {/* Filters & Toggle */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted font-medium text-xs tracking-wider uppercase">Filter</span>
              <button className="flex items-center gap-2 border border-border-strong text-body px-3 py-1.5 rounded-input hover:bg-surface-muted">
                Engineering <ChevronDown size={14} className="text-caption" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-sm ml-2">
              <span className="text-muted font-medium text-xs tracking-wider uppercase">Status</span>
              <div className="flex items-center gap-1.5 border border-border-strong bg-surface-muted text-body px-3 py-1.5 rounded-input">
                Needs Action <X size={14} className="text-caption cursor-pointer hover:text-body-light" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-body">Auto-Flag Overtime</span>
            {/* Custom Toggle Switch */}
            <div className="w-10 h-5 bg-accent rounded-full relative cursor-pointer flex items-center px-0.5 shadow-panel">
              <div className="w-4 h-4 bg-surface-raised rounded-full translate-x-5 transition-transform shadow-card" />
            </div>
          </div>
        </div>

        {/* KPIs Row */}
        <div className="grid grid-cols-4 gap-4">
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-semibold text-muted mb-2">Pending PTO</p>
            <p className="text-2xl font-bold text-heading">12</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-semibold text-muted mb-2">Missing Punches</p>
            <p className="text-2xl font-bold text-danger">8</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-semibold text-muted mb-2">Total Overtime</p>
            <p className="text-2xl font-bold text-heading">42h</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-semibold text-muted mb-2">Approval Rate</p>
            <p className="text-2xl font-bold text-heading">88%</p>
          </div>
        </div>
      </div>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Interactive List Area */}
        <div className="flex-1 flex flex-col bg-surface-raised overflow-y-auto">
          
          {/* Section: Exceptions */}
          <div className="px-6 py-2.5 bg-surface-muted/80 border-b border-border-default sticky top-0 z-10">
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
              Timesheet Exceptions · 4 Items
            </span>
          </div>
          <div className="divide-y divide-border-subtle">
            {EXCEPTIONS.map(item => {
              const isSelected = selectedId === item.id;
              return (
                <div 
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`flex items-center justify-between px-6 py-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-accent-light/50 border-l-4 border-l-blue-600' : 'bg-surface-raised hover:bg-surface-muted border-l-4 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-8 h-8 rounded-full bg-surface-strong flex items-center justify-center text-xs font-semibold text-body-light border border-border-strong">
                      {item.avatar}
                    </div>
                    <div className="w-40 font-semibold text-sm text-heading">{item.name}</div>
                    <div className={`flex items-center gap-1.5 text-sm font-medium ${item.alert ? 'text-danger' : 'text-body-light'}`}>
                      {item.alert ? <AlertTriangle size={14} /> : <Clock size={14} className="text-caption" />}
                      {item.label}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted">{item.date}</span>
                    <MoreHorizontal size={16} className="text-caption" />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Section: Leave Requests */}
          <div className="px-6 py-2.5 bg-surface-muted/80 border-y border-border-default sticky top-0 z-10">
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
              Leave Requests · 12 Items
            </span>
          </div>
          <div className="divide-y divide-border-subtle">
            {LEAVE_REQUESTS.map(item => {
              const isSelected = selectedId === item.id;
              return (
                <div 
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`flex items-center justify-between px-6 py-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-accent-light/50 border-l-4 border-l-blue-600' : 'bg-surface-raised hover:bg-surface-muted border-l-4 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-8 h-8 rounded-full bg-surface-strong flex items-center justify-center text-xs font-semibold text-body-light border border-border-strong">
                      {item.avatar}
                    </div>
                    <div className="w-40 font-semibold text-sm text-heading">{item.name}</div>
                    <div className="text-sm text-body-light font-medium">
                      {item.type}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted">{item.date}</span>
                    <MoreHorizontal size={16} className="text-caption" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: Detail Panel */}
        <div className="w-[500px] bg-surface-muted border-l border-border-default overflow-y-auto p-6 flex-shrink-0">
          
          {/* Profile Header */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 mb-6 flex items-center justify-between shadow-card">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-surface-strong rounded-full border border-border-strong flex items-center justify-center text-body-light font-bold text-lg">
                SJ
              </div>
              <div>
                <h2 className="text-lg font-bold text-heading">Sarah Jenkins</h2>
                <p className="text-xs text-muted mt-0.5">Software Engineer · Engineering Dept</p>
              </div>
            </div>
            <button className="bg-primary text-white px-4 py-2 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">
              Approve Week
            </button>
          </div>

          {/* Timesheet Table */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card overflow-hidden mb-6">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-raised border-b border-border-subtle">
                <tr>
                  <th className="px-5 py-3 text-[10px] font-bold text-caption uppercase tracking-wider w-16">Day</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-caption uppercase tracking-wider">In</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-caption uppercase tracking-wider">Out</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-caption uppercase tracking-wider">Total</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-caption uppercase tracking-wider text-right w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle text-sm">
                
                {/* Regular Rows */}
                <tr className="hover:bg-surface-muted">
                  <td className="px-5 py-3.5 text-body-light font-medium">Mon</td>
                  <td className="px-5 py-3.5 font-semibold text-heading">09:00</td>
                  <td className="px-5 py-3.5 font-semibold text-heading">17:00</td>
                  <td className="px-5 py-3.5 text-body-light">8h 00m</td>
                  <td className="px-5 py-3.5 text-right"><Pencil size={14} className="inline-block text-caption hover:text-body cursor-pointer" /></td>
                </tr>
                <tr className="hover:bg-surface-muted">
                  <td className="px-5 py-3.5 text-body-light font-medium">Tue</td>
                  <td className="px-5 py-3.5 font-semibold text-heading">08:55</td>
                  <td className="px-5 py-3.5 font-semibold text-heading">18:00</td>
                  <td className="px-5 py-3.5 text-body-light">9h 05m</td>
                  <td className="px-5 py-3.5 text-right"><Pencil size={14} className="inline-block text-caption hover:text-body cursor-pointer" /></td>
                </tr>
                <tr className="hover:bg-surface-muted">
                  <td className="px-5 py-3.5 text-body-light font-medium">Wed</td>
                  <td className="px-5 py-3.5 font-semibold text-heading">09:10</td>
                  <td className="px-5 py-3.5 font-semibold text-heading">17:15</td>
                  <td className="px-5 py-3.5 text-body-light">8h 05m</td>
                  <td className="px-5 py-3.5 text-right"><Pencil size={14} className="inline-block text-caption hover:text-body cursor-pointer" /></td>
                </tr>

                {/* Exception Row (Thursday) */}
                <tr className="bg-danger-light/30">
                  <td className="px-5 py-3.5 text-danger font-semibold">Thu</td>
                  <td className="px-5 py-3.5 font-semibold text-heading">09:00</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-block border border-red-300 text-danger bg-surface-raised px-3 py-1 rounded text-sm font-semibold tracking-widest">
                      --:--
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-muted">-h -m</td>
                  <td className="px-5 py-3.5 text-right">
                    <button className="bg-primary text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-primary-hover transition-colors">
                      Fill
                    </button>
                  </td>
                </tr>

                <tr className="hover:bg-surface-muted">
                  <td className="px-5 py-3.5 text-body-light font-medium">Fri</td>
                  <td className="px-5 py-3.5 font-semibold text-heading">08:45</td>
                  <td className="px-5 py-3.5 font-semibold text-heading">17:20</td>
                  <td className="px-5 py-3.5 text-body-light">8h 35m</td>
                  <td className="px-5 py-3.5 text-right"><Pencil size={14} className="inline-block text-caption hover:text-body cursor-pointer" /></td>
                </tr>

              </tbody>
            </table>
          </div>

          {/* Bottom Summary Cards */}
          <div className="grid grid-cols-2 gap-4">
            
            {/* Weekly Summary */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card">
              <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-4">Weekly Summary</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-body-light">
                  <span>Regular Hours</span>
                  <span className="font-semibold text-heading">31h 45m</span>
                </div>
                <div className="flex justify-between text-body-light pb-3 border-b border-border-subtle">
                  <span>Overtime</span>
                  <span className="font-semibold text-heading">2h 00m</span>
                </div>
                <div className="flex justify-between font-bold text-heading pt-1">
                  <span>TOTAL</span>
                  <span>33h 45m</span>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card">
              <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-4">Recent Activity</h3>
              <div className="relative pl-3 space-y-4">
                <div className="absolute left-[3px] top-1.5 bottom-1 w-px bg-surface-strong"></div>
                
                <div className="relative z-10">
                  <div className="absolute -left-[11px] top-1.5 w-2 h-2 rounded-full bg-gray-300 ring-4 ring-white"></div>
                  <p className="text-xs font-semibold text-heading leading-tight">System flagged missing punch on Thursday.</p>
                  <p className="text-[10px] text-muted mt-0.5">Jun 04, 18:00</p>
                </div>
                
                <div className="relative z-10">
                  <div className="absolute -left-[11px] top-1.5 w-2 h-2 rounded-full bg-gray-300 ring-4 ring-white"></div>
                  <p className="text-xs font-semibold text-heading leading-tight">Sarah Jenkins modified Tuesday punch OUT.</p>
                  <p className="text-[10px] text-muted mt-0.5">Jun 03, 09:15</p>
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}