import React from 'react';
import { 
  ChevronRight, 
  Search, 
  Cloud,
  ChevronDown
} from 'lucide-react';
import TopBarActions from '../../../components/TopBarActions';
import SettingsTabs from './SettingsTabs';

export default function SettingsGeneral() {
  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-[1000px]">
      
      <TopBarActions>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input 
              type="text" 
              placeholder="Search settings..." 
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-raised w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 border border-border-default rounded px-1.5 py-0.5 bg-surface-muted">
              <span className="text-[10px] text-caption font-medium">⌘K</span>
            </div>
          </div>
          
          <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-strong shrink-0"></div>
          
          <button className="bg-primary text-on-primary px-5 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card whitespace-nowrap">
            Save Changes
          </button>
        </div>
      </TopBarActions>

      <SettingsTabs />

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Settings Content Area */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          
          {/* Organization Profile Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <h2 className="text-lg font-bold text-heading mb-1">Organization Profile</h2>
            <p className="text-sm text-muted mb-6">Manage your workspace identity and basic contact information.</p>
            
            <div className="flex items-start gap-6">
              {/* Logo Upload */}
              <div className="w-32 h-32 rounded-button border-2 border-dashed border-border-strong bg-surface-muted flex flex-col items-center justify-center text-caption hover:bg-surface-active hover:border-caption transition-colors cursor-pointer shrink-0">
                <div className="w-10 h-10 bg-surface-strong rounded-full flex items-center justify-center mb-2">
                  <Cloud size={20} className="text-muted" />
                </div>
                <span className="text-xs font-semibold text-body-light">Upload Logo</span>
              </div>
              
              {/* Form Fields */}
              <div className="flex-1 space-y-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-heading mb-1.5">Workspace Name</label>
                  <input 
                    type="text" 
                    defaultValue="Global Operations"
                    className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-heading mb-1.5">Support Email</label>
                  <input 
                    type="email" 
                    defaultValue="ops@asas.com"
                    className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Localization Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <h2 className="text-lg font-bold text-heading mb-1">Localization</h2>
            <p className="text-sm text-muted mb-6">Configure regional settings for all users in this workspace.</p>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Timezone</label>
                <div className="relative">
                  <select className="w-full appearance-none border border-border-strong rounded-input px-3 py-2 text-sm text-heading bg-surface-raised focus:outline-none focus:ring-2 focus:ring-primary">
                    <option>(GMT-08:00) Pacific Time</option>
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Currency</label>
                <div className="relative">
                  <select className="w-full appearance-none border border-border-strong rounded-input px-3 py-2 text-sm text-heading bg-surface-raised focus:outline-none focus:ring-2 focus:ring-primary">
                    <option>USD ($)</option>
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
                </div>
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-heading mb-1.5">Date Format</label>
              <div className="relative">
                <select className="w-full appearance-none border border-border-strong rounded-input px-3 py-2 text-sm text-heading bg-surface-raised focus:outline-none focus:ring-2 focus:ring-primary">
                  <option>MM/DD/YYYY (12/31/2023)</option>
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Danger Zone Card */}
          <div className="bg-danger-light border border-danger-border rounded-card-sm p-card shadow-card">
            <h2 className="text-lg font-bold text-danger-hover mb-1">Danger Zone</h2>
            <p className="text-sm text-danger mb-6">Irreversible destructive actions for this workspace.</p>
            
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-heading">Delete Workspace</h3>
                <p className="text-sm text-body-light mt-0.5">Permanently remove all data, projects, and users.</p>
              </div>
              <button className="bg-danger-hover text-on-primary px-5 py-2.5 rounded-input text-sm font-semibold hover:bg-danger-text transition-colors shadow-card">
                Delete Workspace...
              </button>
            </div>
          </div>

        </div>

        {/* Right: Subscription Inspector Panel */}
        <div className="w-[360px] bg-surface-raised border-l border-border-default flex flex-col flex-shrink-0 shadow-panel z-10">
          
          <div className="flex-1 overflow-y-auto p-8">
            <h3 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-6">Subscription Inspector</h3>
            
            {/* Current Plan Card */}
            <div className="bg-surface-muted border border-border-default rounded-card-sm p-5 mb-6 shadow-card">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-body-light">Current Plan</span>
                <span className="bg-primary text-on-primary px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase">
                  Enterprise Tier
                </span>
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-extrabold text-heading tracking-tight">$2,400</span>
                <span className="text-sm font-medium text-muted">/ month</span>
              </div>
              <p className="text-[11px] font-medium text-muted">Next billing date: Nov 01</p>
            </div>

            {/* Usage Card */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-5 shadow-card space-y-6">
              
              {/* Active Seats */}
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-bold text-heading">Active Seats</span>
                  <span className="text-[11px] font-medium text-body-light">1,240 / 1,500</span>
                </div>
                <div className="w-full bg-surface-strong rounded-full h-1.5 overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{ width: '82.6%' }}></div>
                </div>
              </div>

              {/* Storage */}
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-bold text-heading">Storage</span>
                  <span className="text-[11px] font-medium text-body-light">450GB / 1TB</span>
                </div>
                <div className="w-full bg-surface-strong rounded-full h-1.5 overflow-hidden">
                  <div className="bg-muted h-full rounded-full" style={{ width: '45%' }}></div>
                </div>
              </div>

            </div>
          </div>

          {/* Sticky Bottom Actions */}
          <div className="p-8 bg-surface-raised border-t border-border-subtle flex flex-col gap-4 mt-auto">
            <button className="w-full bg-primary text-on-primary py-2.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card">
              Manage Billing
            </button>
            <button className="w-full text-sm font-semibold text-body-light hover:text-heading transition-colors">
              View Invoices
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}