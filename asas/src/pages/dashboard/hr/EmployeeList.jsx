import React, { useState } from 'react';
import { 
  Search, ChevronRight, ChevronDown, Download, 
  TrendingUp, AlertTriangle, Pencil, Mail, Calendar, 
  Banknote, Briefcase, Network, History
} from 'lucide-react';

const MOCK_EMPLOYEES = [
  { id: '1', name: 'Sarah Jenkins', role: 'Frontend Developer', department: 'Engineering', status: 'Active', selected: true },
  { id: '2', name: 'Marcus Chen', role: 'DevOps Engineer', department: 'Engineering', status: 'Active' },
  { id: '3', name: 'David Lee', role: 'UX Researcher', department: 'Product', status: 'On Leave' },
  { id: '4', name: 'Elena Rodriguez', role: 'VP of Engineering', department: 'Engineering', status: 'Active' },
  { id: '5', name: 'Michael Chang', role: 'QA Tester', department: 'Engineering', status: 'Active' },
  { id: '6', name: 'Jessica Smith', role: 'Product Designer', department: 'Product', status: 'Active' },
  { id: '7', name: 'Robert Fox', role: 'Account Executive', department: 'Sales', status: 'Active' },
  { id: '8', name: 'Amanda Cooper', role: 'Sales Dev Rep', department: 'Sales', status: 'Active' },
  { id: '9', name: 'Thomas Wright', role: 'Backend Engineer', department: 'Engineering', status: 'Active' },
  { id: '10', name: 'Lisa Taylor', role: 'HR Manager', department: 'HR', status: 'Active' },
  { id: '11', name: 'James Wilson', role: 'Data Scientist', department: 'Data', status: 'Active' },
  { id: '12', name: 'Karen Martinez', role: 'Marketing Dir.', department: 'Marketing', status: 'Active' },
  { id: '13', name: 'Steven White', role: 'Systems Admin', department: 'IT', status: 'Active' },
  { id: '14', name: 'Nancy Hall', role: 'Financial Analyst', department: 'Finance', status: 'Active' },
];

import TopBarActions from '../../../components/TopBarActions';

export default function EmployeeDirectory() {
  const [selectedId, setSelectedId] = useState('1');

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-[1000px]">
      
      <TopBarActions>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input 
              type="text" 
              placeholder="Search employees..." 
              className="pl-9 pr-12 py-2 text-sm border border-border-default rounded-input bg-surface-muted/50 w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 border border-border-default rounded px-1.5 py-0.5 bg-surface-raised">
              <span className="text-[10px] text-caption font-medium">⌘K</span>
            </div>
          </div>
          <button className="flex items-center gap-2 border border-border-default text-body px-4 py-2 rounded-input text-sm hover:bg-surface-muted transition-colors">
            Department: Engineering <ChevronDown size={14} className="text-caption" />
          </button>
          <button className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-input text-sm font-medium hover:bg-primary-hover transition-colors">
            <Download size={16} /> Export Directory
          </button>
        </div>
      </TopBarActions>

      {/* ── KPIs ── */}
      <div className="px-6 py-4 flex-shrink-0 border-b border-border-default">
        <div className="grid grid-cols-3 gap-4">
          <div className="border border-border-default rounded-button p-5 bg-surface-raised shadow-card">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Total Headcount</p>
            <div className="flex items-baseline gap-3">
              <p className="text-3xl font-bold text-heading">142</p>
              <span className="flex items-center gap-1 text-sm font-semibold text-accent">
                <TrendingUp size={14} /> +3 this month
              </span>
            </div>
          </div>
          <div className="border border-border-default rounded-button p-5 bg-surface-raised shadow-card">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Open Roles</p>
            <div className="flex items-baseline gap-3">
              <p className="text-3xl font-bold text-heading">12</p>
              <span className="text-sm font-medium text-muted">Engineering & Sales</span>
            </div>
          </div>
          <div className="border border-border-default rounded-button p-5 bg-surface-raised shadow-card">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">On Leave</p>
            <div className="flex items-baseline gap-3">
              <p className="text-3xl font-bold text-heading">4</p>
              <span className="flex items-center gap-1 text-sm font-semibold text-warning">
                <AlertTriangle size={14} /> Currently inactive
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Table Area */}
        <div className="flex-1 overflow-y-auto bg-surface-raised flex flex-col">
          {/* Table Toolbar */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border-default bg-surface-muted/50 flex-shrink-0">
            <div className="flex items-center gap-3">
              <input type="checkbox" className="w-4 h-4 rounded border-border-strong text-accent focus:ring-accent" />
              <span className="text-sm font-medium text-body-light">Select All</span>
            </div>
            <span className="text-sm font-medium text-body-light">A-Z Sort: Name A-Z</span>
          </div>

          <table className="w-full text-left border-collapse flex-1">
            <thead className="bg-surface-muted/50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 border-b border-border-default w-12"></th>
                <th className="px-2 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">Employee</th>
                <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">Role</th>
                <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">Department</th>
                <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {MOCK_EMPLOYEES.map(emp => {
                const isSelected = selectedId === emp.id;

                return (
                  <tr 
                    key={emp.id}
                    onClick={() => setSelectedId(emp.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-accent-light/50' : 'bg-surface-raised hover:bg-surface-muted'
                    }`}
                  >
                    <td className="px-6 py-4">
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        readOnly
                        className="w-4 h-4 rounded border-border-strong text-accent focus:ring-accent" 
                      />
                    </td>
                    <td className="px-2 py-4">
                      <span className="text-sm font-bold text-heading">{emp.name}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-body-light">{emp.role}</td>
                    <td className="px-6 py-4 text-sm text-body-light">{emp.department}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                        emp.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {emp.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Right: Detail Panel */}
        <div className="w-[420px] bg-surface-raised border-l border-border-default overflow-y-auto p-6 flex-shrink-0 space-y-6">
          
          {/* Profile Card */}
          <div className="border border-border-default rounded-card-sm p-6 relative">
            <button className="absolute top-4 right-4 p-1.5 border border-border-default rounded-input text-caption hover:text-body-light hover:bg-surface-muted transition-colors">
              <Pencil size={14} />
            </button>
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 bg-surface-strong rounded-full mb-4 overflow-hidden border border-border-subtle">
                <img src="/api/placeholder/80/80" alt="Sarah Jenkins" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-xl font-bold text-heading">Sarah Jenkins</h2>
              <p className="text-sm text-muted mt-1">Frontend Developer · Hired Oct 2024</p>
              
              <div className="flex gap-3 mt-5 w-full justify-center">
                <button className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-input text-sm font-medium hover:bg-primary-hover transition-colors">
                  <Mail size={14} /> Message
                </button>
                <button className="flex items-center gap-2 border border-border-default text-body px-4 py-2 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors">
                  <Calendar size={14} /> Schedule
                </button>
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-border-default rounded-card-sm p-4">
              <div className="flex items-center gap-2 text-muted mb-3">
                <Banknote size={14} />
                <span className="text-xs font-semibold">Compensation</span>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold text-caption uppercase tracking-wider mb-0.5">Salary</p>
                  <p className="text-sm font-bold text-heading">$115,000</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-caption uppercase tracking-wider mb-0.5">Equity</p>
                  <p className="text-sm font-bold text-heading">12,000 Options</p>
                </div>
              </div>
            </div>
            
            <div className="border border-border-default rounded-card-sm p-4">
              <div className="flex items-center gap-2 text-muted mb-3">
                <Briefcase size={14} />
                <span className="text-xs font-semibold">Position</span>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold text-caption uppercase tracking-wider mb-0.5">Band</p>
                  <p className="text-sm font-bold text-heading">L3 Senior</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-caption uppercase tracking-wider mb-0.5">Location</p>
                  <p className="text-sm font-bold text-heading">Remote EST</p>
                </div>
              </div>
            </div>
          </div>

          {/* Reporting Structure */}
          <div className="border border-border-default rounded-card-sm p-5">
            <div className="flex items-center gap-2 text-muted mb-5">
              <Network size={14} />
              <span className="text-xs font-semibold">Reporting Structure</span>
            </div>
            
            <div className="relative pl-4 space-y-4">
              {/* Vertical Line */}
              <div className="absolute left-7 top-4 bottom-4 w-px bg-surface-strong"></div>
              
              {/* Manager */}
              <div className="relative z-10 flex items-center gap-3">
                <div className="w-7 h-7 bg-surface-raised border border-border-default rounded-full flex items-center justify-center text-[10px] font-bold text-muted">
                  ER
                </div>
                <div>
                  <p className="text-sm font-bold text-heading leading-tight">Elena Rodriguez</p>
                  <p className="text-[10px] text-muted">VP Engineering</p>
                </div>
              </div>

              {/* Self (Highlighted) */}
              <div className="relative z-10 flex items-center gap-3 bg-surface-muted p-2.5 rounded-button border border-border-default -ml-2">
                <div className="w-7 h-7 bg-blue-100 text-accent rounded-full flex items-center justify-center text-[10px] font-bold border border-accent-light">
                  SJ
                </div>
                <div>
                  <p className="text-sm font-bold text-heading leading-tight">Sarah Jenkins</p>
                  <p className="text-[10px] text-muted">Frontend Developer</p>
                </div>
              </div>

              {/* Subordinates */}
              <div className="relative z-10 flex items-center gap-3">
                <div className="w-7 h-7 bg-surface-raised flex items-center justify-center text-caption">
                  <div className="w-3 h-3 border-l-2 border-b-2 border-border-strong rounded-bl"></div>
                </div>
                <p className="text-xs text-muted font-medium">No direct reports</p>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="border border-border-default rounded-card-sm p-5">
            <div className="flex items-center gap-2 text-muted mb-5">
              <History size={14} />
              <span className="text-xs font-semibold">Recent Activity</span>
            </div>
            
            <div className="relative pl-2 space-y-5">
              {/* Vertical Line */}
              <div className="absolute left-[11px] top-2 bottom-2 w-px bg-surface-strong"></div>
              
              <div className="relative z-10 flex gap-4">
                <div className="w-2.5 h-2.5 bg-accent rounded-full mt-1.5 ring-4 ring-white"></div>
                <div>
                  <p className="text-sm font-bold text-heading">Performance Review Completed</p>
                  <p className="text-xs text-body-light mt-0.5">Q1 Assessment - Met all expectations.</p>
                  <p className="text-[10px] text-caption mt-1">2 weeks ago</p>
                </div>
              </div>

              <div className="relative z-10 flex gap-4">
                <div className="w-2.5 h-2.5 bg-gray-300 rounded-full mt-1.5 ring-4 ring-white"></div>
                <div>
                  <p className="text-sm font-bold text-heading">Equipment Stipend Approved</p>
                  <p className="text-xs text-body-light mt-0.5">Request for new monitor fulfilled.</p>
                  <p className="text-[10px] text-caption mt-1">1 month ago</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}