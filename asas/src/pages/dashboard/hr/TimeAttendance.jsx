import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  ChevronRight, 
  Download, 
  ChevronDown, 
  X, 
  AlertTriangle, 
  Clock, 
  MoreHorizontal, 
  Pencil,
  Loader2
} from 'lucide-react';
import TopBarActions from '../../../components/TopBarActions';
import { hrService } from '../../../services/hr.service';

function formatShortDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
}

export default function TimeAttendance() {
  const [selectedId, setSelectedId] = useState(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['hr', 'attendance'],
    queryFn: () => hrService.listAttendance(),
  })

  const exceptions = data?.exceptions || []
  const leaveRequests = data?.leaveRequests || []
  const timesheets = data?.timesheets || []

  // Auto-select first exception or leave request if none is selected
  useEffect(() => {
    if (!selectedId) {
      if (exceptions.length > 0) setSelectedId(exceptions[0].id)
      else if (leaveRequests.length > 0) setSelectedId(leaveRequests[0].id)
    }
  }, [exceptions, leaveRequests, selectedId])

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-[1000px]">
      
      <TopBarActions>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 border border-border-default text-body px-4 py-2 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors bg-surface-raised shadow-card">
            <Download size={16} /> Export
          </button>
          <button className="bg-primary text-white px-5 py-2 rounded-input text-sm font-medium hover:bg-primary-hover transition-colors shadow-card">
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
                All Departments <ChevronDown size={14} className="text-caption" />
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
            <p className="text-[11px] font-semibold text-muted mb-2">Total Timesheets</p>
            <p className="text-2xl font-bold text-heading">{timesheets.length}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-semibold text-muted mb-2">Total Exceptions</p>
            <p className="text-2xl font-bold text-danger">{exceptions.length}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-semibold text-muted mb-2">Total Overtime</p>
            <p className="text-2xl font-bold text-heading">{Math.round(timesheets.reduce((acc, ts) => acc + ts.overtimeHours, 0) * 10) / 10}h</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-semibold text-muted mb-2">On-Time Rate</p>
            <p className="text-2xl font-bold text-heading">
              {timesheets.length > 0 ? (
                (() => {
                  const totalDays = timesheets.reduce((acc, ts) => acc + (ts.days?.length || 0), 0);
                  const lateDays = exceptions.filter(e => e.type === 'late' || e.type === 'early_out').length;
                  if (totalDays === 0) return '100%';
                  return `${Math.round(((totalDays - lateDays) / totalDays) * 100)}%`;
                })()
              ) : '100%'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Interactive List Area */}
        <div className="flex-1 flex flex-col bg-surface-raised overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center p-10 text-muted">
              <Loader2 className="animate-spin mr-2" size={20} /> Loading attendance data...
            </div>
          )}
          {isError && (
            <div className="p-10 text-danger">{error?.message || 'Error loading attendance data'}</div>
          )}
          {!isLoading && exceptions.length === 0 && leaveRequests.length === 0 && (
            <div className="p-10 text-center text-muted">
              <p className="text-sm">No attendance records found.</p>
              <p className="text-xs mt-2">Load the sample pack to see demo data.</p>
            </div>
          )}

          {/* Section: Exceptions */}
          {exceptions.length > 0 && (
            <>
              <div className="px-6 py-2.5 bg-surface-muted/80 border-b border-border-default sticky top-0 z-10">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                  Timesheet Exceptions · {exceptions.length} Items
                </span>
              </div>
              <div className="divide-y divide-border-subtle">
                {exceptions.map(item => {
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
                        <div className="w-8 h-8 rounded-full bg-surface-strong flex items-center justify-center text-xs font-semibold text-body-light border border-border-strong overflow-hidden">
                          {item.avatar ? <img src={item.avatar} alt={item.name} className="w-full h-full object-cover" /> : (item.name?.[0] || '?')}
                        </div>
                        <div className="w-40 font-semibold text-sm text-heading truncate">{item.name}</div>
                        <div className={`flex items-center gap-1.5 text-sm font-medium ${item.alert ? 'text-danger' : 'text-body-light'}`}>
                          {item.alert ? <AlertTriangle size={14} /> : <Clock size={14} className="text-caption" />}
                          {item.label}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-muted">{formatShortDate(item.date)}</span>
                        <MoreHorizontal size={16} className="text-caption" />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Section: Leave Requests */}
          {leaveRequests.length > 0 && (
            <>
              <div className="px-6 py-2.5 bg-surface-muted/80 border-y border-border-default sticky top-0 z-10">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                  Pending Time Off · {leaveRequests.length} Items
                </span>
              </div>
              <div className="divide-y divide-border-subtle">
                {leaveRequests.map(item => {
                  const isSelected = selectedId === item.id;
                  const displayDate = item.endDate ? `${formatShortDate(item.date)} - ${formatShortDate(item.endDate)}` : formatShortDate(item.date);
                  return (
                    <div 
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`flex items-center justify-between px-6 py-3 cursor-pointer transition-colors ${
                        isSelected ? 'bg-accent-light/50 border-l-4 border-l-blue-600' : 'bg-surface-raised hover:bg-surface-muted border-l-4 border-l-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-8 h-8 rounded-full bg-surface-strong flex items-center justify-center text-xs font-semibold text-body-light border border-border-strong overflow-hidden">
                          {item.avatar ? <img src={item.avatar} alt={item.name} className="w-full h-full object-cover" /> : (item.name?.[0] || '?')}
                        </div>
                        <div className="w-40 font-semibold text-sm text-heading truncate">{item.name}</div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-surface-strong text-body border border-border-subtle">
                            {item.type}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-muted whitespace-nowrap">{displayDate}</span>
                        <MoreHorizontal size={16} className="text-caption" />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Right: Detail Panel */}
        <div className="w-[500px] bg-surface-muted border-l border-border-default overflow-y-auto p-6 flex-shrink-0">
          {(() => {
            if (!selectedId) return <div className="text-muted text-center mt-10">Select an item to view details</div>;

            const selectedException = exceptions.find(e => e.id === selectedId);
            const selectedLeave = leaveRequests.find(l => l.id === selectedId);
            
            const activeItem = selectedException || selectedLeave;
            if (!activeItem) return null;

            const employeeId = activeItem.employeeId;
            const ts = timesheets.find(t => t.employeeId === employeeId);
            const employeeName = activeItem.name;
            const initials = employeeName ? employeeName.split(' ').map(n => n[0]).join('').slice(0, 2) : '??';

            return (
              <>
                {/* Profile Header */}
                <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 mb-6 flex items-center justify-between shadow-card">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-surface-strong rounded-full border border-border-strong flex items-center justify-center text-body-light font-bold text-lg overflow-hidden">
                      {activeItem.avatar ? <img src={activeItem.avatar} alt={activeItem.name} className="w-full h-full object-cover" /> : initials}
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-heading">{employeeName}</h2>
                      <p className="text-xs text-muted mt-0.5">Employee Details</p>
                    </div>
                  </div>
                  <button className="bg-primary text-white px-4 py-2 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card">
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
                      {ts && ts.days && ts.days.length > 0 ? (
                        ts.days.map((day, idx) => (
                          <tr key={day.id || idx} className="hover:bg-surface-muted transition-colors">
                            <td className="px-5 py-3.5 text-body-light font-medium">{day.dayLabel || '—'}</td>
                            <td className="px-5 py-3.5 font-semibold text-heading">{day.clockIn || '—'}</td>
                            <td className="px-5 py-3.5 font-semibold text-heading">{day.clockOut || '—'}</td>
                            <td className="px-5 py-3.5 text-body-light">{day.totalHours || '0'}h</td>
                            <td className="px-5 py-3.5 text-right"><Pencil size={14} className="inline-block text-caption hover:text-body cursor-pointer" /></td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-5 py-4 text-center text-muted text-sm">
                            No timesheet days recorded for this week.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  
                  {ts && (
                    <div className="px-5 py-4 bg-surface-muted/50 border-t border-border-default flex items-center justify-between">
                      <span className="text-sm font-semibold text-heading">Weekly Total</span>
                      <div className="flex gap-4">
                        <span className="text-sm text-body-light">Regular: {ts.regularHours}h</span>
                        <span className="text-sm text-body-light">Overtime: {ts.overtimeHours}h</span>
                        <span className="text-sm font-bold text-heading">Total: {ts.totalHours}h</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Exception Notice */}
                {selectedException && (
                  <div className={`p-4 rounded-card-sm border ${selectedException.alert ? 'bg-danger-light border-danger/20' : 'bg-warning-light border-warning/20'} mb-6 shadow-card`}>
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={18} className={`mt-0.5 ${selectedException.alert ? 'text-danger' : 'text-warning'}`} />
                      <div>
                        <h3 className={`text-sm font-bold ${selectedException.alert ? 'text-danger' : 'text-warning-dark'}`}>
                          Action Required: {selectedException.label}
                        </h3>
                        <p className="text-xs text-body mt-1 leading-relaxed">
                          This employee's timesheet on {formatShortDate(selectedException.date)} is missing a punch or has unauthorized overtime. Please review and adjust the timesheet before approving the week.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Leave Notice */}
                {selectedLeave && (
                  <div className="p-4 rounded-card-sm border border-border-default bg-surface-raised mb-6 shadow-card">
                    <div className="flex items-start gap-3">
                      <Clock size={18} className="mt-0.5 text-accent" />
                      <div>
                        <h3 className="text-sm font-bold text-heading">
                          Time Off Request: {selectedLeave.type}
                        </h3>
                        <p className="text-xs text-body mt-1 leading-relaxed">
                          Requested for {formatShortDate(selectedLeave.date)} {selectedLeave.endDate ? `to ${formatShortDate(selectedLeave.endDate)}` : ''}.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}