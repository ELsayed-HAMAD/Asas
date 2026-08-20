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
  Info
} from 'lucide-react';

// ── Mock Data ────────────────────────────────────────────────
const PROJECTS = [
  { id: '1', name: 'Warehouse Expansion', dept: 'Operations', budget: '$450k', timeline: 'Oct 15', status: 'On Track' },
  { id: '2', name: 'Q3 Financial Audit', dept: 'Finance', budget: '$120k', timeline: 'Nov 02', status: 'Delayed' },
  { id: '3', name: 'ERP Migration', dept: 'IT', budget: '$2.1M', timeline: 'Dec 10', status: 'On Track' },
  { id: '4', name: 'HR Portal Revamp', dept: 'HR', budget: '$85k', timeline: 'Sep 30', status: 'On Track' },
  { id: '5', name: 'Supply Chain Audit', dept: 'Operations', budget: '$250k', timeline: 'Jan 15', status: 'Planning' },
  { id: '6', name: 'Global Expansion Ph 1', dept: 'Strategy', budget: '$5.5M', timeline: 'Mar 20', status: 'At Risk' },
  { id: '7', name: 'Cybersecurity Patching', dept: 'IT', budget: '$320k', timeline: 'Oct 05', status: 'On Track' },
  { id: '8', name: 'Cloud Infrastructure Upgrade', dept: 'IT', budget: '$1.2M', timeline: 'Nov 15', status: 'On Track' },
  { id: '9', name: 'Retail Store Remodel - NY', dept: 'Real Estate', budget: '$850k', timeline: 'Dec 01', status: 'Planning' },
  { id: '10', name: 'Employee Wellness Program', dept: 'HR', budget: '$50k', timeline: 'Oct 20', status: 'On Track' },
  { id: '11', name: 'New Product Launch - Beta', dept: 'Marketing', budget: '$400k', timeline: 'Feb 28', status: 'Delayed' },
  { id: '12', name: 'Vendor Consolidation Initiativ', dept: 'Procurement', budget: '$15k', timeline: 'Nov 30', status: 'On Track' },
  { id: '13', name: 'Sustainability Reporting \'24', dept: 'Compliance', budget: '$75k', timeline: 'Jan 31', status: 'Planning' },
  { id: '14', name: 'Automated Billing System', dept: 'Finance', budget: '$280k', timeline: 'Dec 15', status: 'On Track' },
  { id: '15', name: 'European Market Research', dept: 'Strategy', budget: '$110k', timeline: 'Oct 28', status: 'On Track' },
  { id: '16', name: 'Corporate Rebranding Assets', dept: 'Marketing', budget: '$200k', timeline: 'Nov 10', status: 'Delayed' },
];

import TopBarActions from '../../../components/TopBarActions';

export default function PortfolioOverview() {
  const [selectedId, setSelectedId] = useState('1');

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
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 border border-border-default rounded px-1.5 py-0.5 bg-surface-muted">
              <span className="text-[10px] text-caption font-medium">⌘K</span>
            </div>
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
            <p className="text-3xl font-bold text-heading">24</p>
          </div>
          
          <div className="border border-border-default rounded-button p-5 bg-surface-raised shadow-card flex flex-col justify-between">
            <p className="text-[11px] font-bold text-muted tracking-wide mb-3">Portfolio Budget Utilization</p>
            <p className="text-3xl font-bold text-heading">78%</p>
          </div>

          <div className="border border-border-default rounded-button p-5 bg-surface-raised shadow-card flex flex-col justify-between relative">
            <div className="flex justify-between items-start mb-3">
              <p className="text-[11px] font-bold text-muted tracking-wide">At-Risk Milestones</p>
              <span className="bg-red-100 text-danger px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                Action Req
              </span>
            </div>
            <p className="text-3xl font-bold text-danger">3</p>
          </div>

          <div className="border border-border-default rounded-button p-5 bg-surface-raised shadow-card flex flex-col justify-between">
            <p className="text-[11px] font-bold text-muted tracking-wide mb-3">Resource Capacity</p>
            <p className="text-3xl font-bold text-heading">92%</p>
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
                  <div className="flex items-center gap-1">Dept <ChevronsUpDown size={12} className="text-caption" /></div>
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
              {PROJECTS.map(project => {
                const isSelected = selectedId === project.id;
                
                let badgeStyle = "bg-surface-strong text-body";
                if (project.status === 'On Track') badgeStyle = "bg-success-light text-success-text";
                if (project.status === 'Delayed') badgeStyle = "bg-[#fef08a] text-[#854d0e]";
                if (project.status === 'At Risk') badgeStyle = "bg-[#fef08a] text-[#854d0e]";

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
                    <td className="px-6 py-3.5 text-sm text-body-light font-medium">
                      {project.dept}
                    </td>
                    <td className="px-6 py-3.5 text-sm font-bold text-heading tabular-nums">
                      {project.budget}
                    </td>
                    <td className="px-6 py-3.5 text-sm text-body-light font-medium">
                      {project.timeline}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex px-2.5 py-1 rounded text-[11px] font-bold tracking-wider ${badgeStyle}`}>
                        {project.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Right: Detail Panel */}
        <div className="w-[440px] bg-surface-muted overflow-y-auto p-6 flex-shrink-0 space-y-6">
          
          {/* Header */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card flex items-center justify-between">
            <h2 className="text-lg font-bold text-heading leading-tight">Warehouse Expansion</h2>
            <div className="bg-blue-100 text-accent-hover px-3 py-1 rounded-full text-[11px] font-bold tracking-wider">
              Status: Active
            </div>
          </div>

          {/* Financial Health Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card overflow-hidden flex flex-col p-6">
            <h3 className="text-[11px] font-bold text-muted uppercase tracking-widest mb-6">Financial Health</h3>
            
            <div className="flex justify-between items-end mb-4">
              <div>
                <p className="text-[11px] font-medium text-muted mb-1">Budget</p>
                <p className="text-2xl font-black text-heading tracking-tight tabular-nums">$450,000</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium text-muted mb-1">Spent</p>
                <p className="text-2xl font-black text-accent tracking-tight tabular-nums">$385,000</p>
              </div>
            </div>

            <div className="w-full bg-surface-strong rounded-full h-2 mb-2 overflow-hidden">
              <div className="bg-accent h-full rounded-full" style={{ width: '85%' }}></div>
            </div>
            
            <div className="text-right">
              <span className="text-[11px] font-bold text-accent">85% Utilized</span>
            </div>
          </div>

          {/* Milestone Tracker Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-6 shadow-card">
            <h3 className="text-[11px] font-bold text-muted uppercase tracking-widest mb-6">Milestone Tracker</h3>
            
            <div className="space-y-4">
              {/* Completed */}
              <div className="flex items-center gap-3">
                <CheckCircle2 size={18} className="text-success-dot" />
                <span className="text-sm font-medium text-caption line-through">Site Permit</span>
              </div>
              
              {/* Completed */}
              <div className="flex items-center gap-3">
                <CheckCircle2 size={18} className="text-success-dot" />
                <span className="text-sm font-medium text-caption line-through">Vendor Selection</span>
              </div>
              
              {/* Current */}
              <div className="flex items-center gap-3">
                <Clock size={18} className="text-accent" />
                <span className="text-sm font-bold text-heading">Construction Phase</span>
              </div>
              
              {/* Pending */}
              <div className="flex items-center gap-3">
                <AlertCircle size={18} className="text-caption" />
                <span className="text-sm font-medium text-muted">Final Inspection</span>
              </div>
            </div>
          </div>

          {/* Risk Factors Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-6 shadow-card">
            <h3 className="text-[11px] font-bold text-muted uppercase tracking-widest mb-6">Risk Factors</h3>
            
            <div className="space-y-4">
              {/* High Risk */}
              <div className="bg-danger-light border border-danger-border rounded-input p-4 flex items-start gap-3">
                <AlertTriangle size={18} className="text-danger mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-danger-hover leading-tight mb-0.5">Supply chain delay</h4>
                  <p className="text-[11px] font-medium text-danger">High impact on timeline</p>
                </div>
              </div>

              {/* Medium Risk */}
              <div className="bg-[#fffbeb] border border-[#fde047] rounded-input p-4 flex items-start gap-3">
                <Info size={18} className="text-[#ca8a04] mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-[#b45309] leading-tight mb-0.5">Contractor lead time</h4>
                  <p className="text-[11px] font-medium text-[#ca8a04]">Medium impact on budget</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}