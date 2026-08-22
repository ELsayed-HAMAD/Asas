import React from 'react';
import { 
  ChevronRight, 
  Search, 
  Clock,
  Shield,
  ChevronDown
} from 'lucide-react';
import { useState } from 'react';
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

export default function SettingsNotifications() {
  const [previewEvent, setPreviewEvent] = useState('invoice');

  const getPreviewData = () => {
    switch(previewEvent) {
      case 'sprint':
        return { 
          title: 'Action Required: Sprint Milestone', 
          desc: 'Q3 Expansion milestone "Beta Release" is due today.', 
          btn: 'View in Jira',
          icon: 'S', color: 'bg-accent'
        };
      case 'system':
        return { 
          title: 'Security Alert: New Login', 
          desc: 'A new login was detected from IP 192.168.1.1 in Berlin, DE.', 
          btn: 'Review Activity',
          icon: '!', color: 'bg-danger'
        };
      case 'risk':
        return { 
          title: 'Risk Escalation: Delay', 
          desc: 'Project Alpha has been flagged as high risk due to resource constraints.', 
          btn: 'View Risk Matrix',
          icon: 'R', color: 'bg-warning'
        };
      case 'invoice':
      default:
        return { 
          title: 'Action Required: Invoice Approval', 
          desc: 'SysTech Automations submitted an invoice for $125,000.', 
          btn: 'Review in Dashboard',
          icon: 'A', color: 'bg-primary'
        };
    }
  };
  const preview = getPreviewData();

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
          </div>
          
          <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-strong shrink-0"></div>
          
          <button className="bg-primary text-on-primary px-5 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card whitespace-nowrap">
            Save Preferences
          </button>
        </div>
      </TopBarActions>

      <SettingsTabs />

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Configuration Content Area */}
        <div className="flex-1 overflow-y-auto p-8 max-w-4xl space-y-6">
          
          {/* Delivery Schedule Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <h2 className="text-lg font-bold text-heading mb-1">Delivery Schedule</h2>
            <p className="text-sm text-muted mb-6">Configure when you receive non-critical alerts.</p>
            
            <div className="space-y-4">
              {/* Quiet Hours */}
              <div className="bg-surface-muted border border-border-default rounded-button p-5 flex items-start gap-4">
                <Clock size={20} className="text-body shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-heading mb-1">Quiet Hours</h3>
                  <div className="flex items-center gap-3 text-sm text-body-light">
                    Pause all non-critical alerts between 
                    <div className="bg-surface-raised border border-border-strong px-3 py-1.5 rounded-input text-heading font-medium shadow-card flex items-center gap-2 cursor-pointer hover:bg-surface-muted transition-colors">
                      10:00 PM <ChevronDown size={14} className="text-caption" />
                    </div>
                    and 
                    <div className="bg-surface-raised border border-border-strong px-3 py-1.5 rounded-input text-heading font-medium shadow-card flex items-center gap-2 cursor-pointer hover:bg-surface-muted transition-colors">
                      06:00 AM <ChevronDown size={14} className="text-caption" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Security Override */}
              <div className="bg-surface-muted border border-border-default rounded-button p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Shield size={20} className="text-accent shrink-0" fill="var(--color-accent)" stroke="white" />
                  <h3 className="text-sm font-bold text-heading">Override for Critical Security Alerts</h3>
                </div>
                <Toggle on={true} color="green" />
              </div>
            </div>
          </div>

          {/* Event Triggers & Channels Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <h2 className="text-lg font-bold text-heading mb-1">Event Triggers & Channels</h2>
            <p className="text-sm text-muted mb-6">Route specific events to preferred platforms.</p>
            
            <div className="w-full">
              {/* Table Header */}
              <div className="grid grid-cols-12 py-3 border-b border-border-default">
                <div className="col-span-6 text-[10px] font-bold text-muted uppercase tracking-widest">Event Type</div>
                <div className="col-span-2 text-[10px] font-bold text-muted uppercase tracking-widest text-center">In-App</div>
                <div className="col-span-2 text-[10px] font-bold text-muted uppercase tracking-widest text-center">Email</div>
                <div className="col-span-2 text-[10px] font-bold text-muted uppercase tracking-widest text-center">Slack</div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-border-subtle">
                
                {/* Row 1 */}
                <div onMouseEnter={() => setPreviewEvent('invoice')} className="grid grid-cols-12 items-center py-5 cursor-pointer hover:bg-surface-active px-4 -mx-4 transition-colors rounded-lg">
                  <div className="col-span-6">
                    <span className="block text-[10px] font-medium text-muted mb-0.5">Finance</span>
                    <span className="block text-sm font-semibold text-heading">Invoice Approvals</span>
                  </div>
                  <div className="col-span-2 flex justify-center"><Toggle on={true} color="green" /></div>
                  <div className="col-span-2 flex justify-center"><Toggle on={true} color="green" /></div>
                  <div className="col-span-2 flex justify-center"><Toggle on={true} color="green" /></div>
                </div>

                {/* Row 2 */}
                <div onMouseEnter={() => setPreviewEvent('sprint')} className="grid grid-cols-12 items-center py-5 cursor-pointer hover:bg-surface-active px-4 -mx-4 transition-colors rounded-lg">
                  <div className="col-span-6">
                    <span className="block text-[10px] font-medium text-muted mb-0.5">Projects</span>
                    <span className="block text-sm font-semibold text-heading">Sprint Milestone</span>
                  </div>
                  <div className="col-span-2 flex justify-center"><Toggle on={true} color="green" /></div>
                  <div className="col-span-2 flex justify-center"><Toggle on={false} /></div>
                  <div className="col-span-2 flex justify-center"><Toggle on={true} color="green" /></div>
                </div>

                {/* Row 3 (Danger/System) */}
                <div onMouseEnter={() => setPreviewEvent('system')} className="grid grid-cols-12 items-center py-5 cursor-pointer hover:bg-surface-active px-4 -mx-4 transition-colors rounded-lg">
                  <div className="col-span-6">
                    <span className="block text-[10px] font-medium text-danger mb-0.5">System</span>
                    <span className="block text-sm font-semibold text-heading">New Login (New IP)</span>
                  </div>
                  <div className="col-span-2 flex justify-center"><Toggle on={true} color="green" /></div>
                  <div className="col-span-2 flex justify-center"><Toggle on={true} color="green" /></div>
                  <div className="col-span-2 flex justify-center"><Toggle on={true} color="green" /></div>
                </div>

                {/* Row 4 */}
                <div onMouseEnter={() => setPreviewEvent('risk')} className="grid grid-cols-12 items-center py-5 cursor-pointer hover:bg-surface-active px-4 -mx-4 transition-colors rounded-lg">
                  <div className="col-span-6">
                    <span className="block text-[10px] font-medium text-muted mb-0.5">Risks</span>
                    <span className="block text-sm font-semibold text-heading">Risk Matrix Escalation</span>
                  </div>
                  <div className="col-span-2 flex justify-center"><Toggle on={true} color="green" /></div>
                  <div className="col-span-2 flex justify-center"><Toggle on={true} color="green" /></div>
                  <div className="col-span-2 flex justify-center"><Toggle on={true} color="green" /></div>
                </div>

              </div>
            </div>
          </div>

        </div>

        {/* Right: Live Preview Panel */}
        <div className="w-[360px] bg-surface-raised border-l border-border-default flex flex-col flex-shrink-0 z-10">
          
          <div className="flex-1 overflow-y-auto p-8 space-y-8">
            
            {/* Live Preview Container */}
            <div>
              <h2 className="text-lg font-bold text-heading mb-6">Live Preview</h2>
              
              <div className="bg-gradient-to-b from-surface-muted to-surface-strong border border-border-default rounded-card p-6 shadow-panel h-80 flex flex-col justify-center">
                
                {/* Simulated Notification Card */}
                <div className="bg-surface-raised rounded-card-sm shadow-elevated p-5 border border-border-subtle">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 ${preview.color} rounded-xs flex items-center justify-center text-[10px] font-bold text-on-primary`}>
                        {preview.icon}
                      </div>
                      <span className="text-[11px] font-semibold text-body">Asas</span>
                    </div>
                    <span className="text-[10px] font-medium text-caption">Just Now</span>
                  </div>
                  
                  <h3 className="text-sm font-bold text-heading leading-tight mb-2">
                    {preview.title}
                  </h3>
                  
                  <p className="text-xs text-body-light leading-relaxed mb-4">
                    {preview.desc}
                  </p>
                  
                  <button className="w-full bg-primary text-on-primary text-xs font-semibold py-2.5 rounded-input hover:bg-primary-hover transition-colors">
                    {preview.btn}
                  </button>
                </div>
                
              </div>
            </div>

            {/* 30-Day Volume Card */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-6 shadow-card">
              <h3 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-6">30-Day Volume</h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-end border-b border-border-subtle pb-4">
                  <span className="text-sm font-medium text-body-light">Total Sent</span>
                  <span className="text-lg font-black text-heading tracking-tight">1,402</span>
                </div>
                
                <div className="flex justify-between items-end">
                  <span className="text-sm font-medium text-body-light">Unread In-App</span>
                  <span className="text-lg font-black text-heading tracking-tight">14</span>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}