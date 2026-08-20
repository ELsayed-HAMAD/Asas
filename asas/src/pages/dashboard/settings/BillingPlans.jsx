import React from 'react';
import { 
  ChevronRight, 
  Search, 
  CheckCircle2,
  Download
} from 'lucide-react';
import TopBarActions from '../../../components/TopBarActions';
import SettingsTabs from './SettingsTabs';

export default function SettingsBilling() {
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
          
          <button className="bg-primary text-on-primary px-5 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card whitespace-nowrap">
            Upgrade Plan
          </button>

          <div className="w-8 h-8 rounded-full bg-surface-strong border border-border-strong shrink-0"></div>
        </div>
      </TopBarActions>

      <SettingsTabs />

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Billing Content Area */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          
          {/* Enterprise Tier Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h2 className="text-xl font-bold text-heading mb-1">Enterprise Tier</h2>
                <p className="text-sm text-body-light">Billed annually. Renews on Nov 01, 2026.</p>
              </div>
              <span className="inline-flex items-center gap-1.5 border border-border-default bg-surface-raised px-3 py-1 rounded-full text-xs font-semibold text-body shadow-card">
                <div className="w-2 h-2 rounded-full bg-success-dot"></div>
                Active
              </span>
            </div>

            <div className="mt-6 bg-surface-muted border border-border-default rounded-button p-5">
              <div className="flex justify-between items-end mb-2">
                <span className="text-xs font-semibold text-body-light">Seat Usage</span>
                <span className="text-xs font-bold text-heading">1,240 / 1,500</span>
              </div>
              <div className="w-full bg-surface-strong rounded-full h-2 overflow-hidden">
                <div className="bg-primary h-full rounded-full" style={{ width: '82.6%' }}></div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-border-subtle flex items-center gap-6">
              <div className="flex items-center gap-2 text-sm font-medium text-body">
                <CheckCircle2 size={16} className="text-success-dot" />
                SSO
              </div>
              <div className="flex items-center gap-2 text-sm font-medium text-body">
                <CheckCircle2 size={16} className="text-success-dot" />
                Priority Support
              </div>
              <div className="flex items-center gap-2 text-sm font-medium text-body">
                <CheckCircle2 size={16} className="text-success-dot" />
                Custom APIs
              </div>
            </div>
          </div>

          {/* Payment Method Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-heading">Payment Method</h2>
              <button className="text-sm font-semibold text-heading hover:underline">
                Edit or Add New
              </button>
            </div>
            
            <div className="inline-flex items-center gap-4 bg-surface-muted border border-border-default rounded-button p-4 w-64">
              <div className="bg-primary text-on-primary text-xs font-bold italic px-3 py-1.5 rounded-badge">
                VISA
              </div>
              <div>
                <p className="text-sm font-bold text-heading tracking-widest">•••• 4242</p>
                <p className="text-[11px] font-medium text-muted mt-0.5">Expires 12/28</p>
              </div>
            </div>
          </div>

          {/* Recent Invoices Card */}
          <div className="bg-surface-raised border border-border-default rounded-card-sm p-card shadow-card">
            <h2 className="text-lg font-bold text-heading mb-6">Recent Invoices</h2>
            
            <div className="divide-y divide-border-subtle">
              {/* Invoice 1 */}
              <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                <div className="w-32 text-sm font-medium text-body-light">Oct 01, 2026</div>
                <div className="flex-1 text-sm font-semibold text-heading">Enterprise Monthly</div>
                <div className="text-sm font-bold text-heading tabular-nums">$2,400.00</div>
                <div className="w-24 flex justify-end">
                  <span className="bg-success-light text-success-text px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase">Paid</span>
                </div>
                <button className="ml-6 text-caption hover:text-heading transition-colors">
                  <Download size={16} />
                </button>
              </div>

              {/* Invoice 2 */}
              <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                <div className="w-32 text-sm font-medium text-body-light">Sep 01, 2026</div>
                <div className="flex-1 text-sm font-semibold text-heading">Enterprise Monthly</div>
                <div className="text-sm font-bold text-heading tabular-nums">$2,400.00</div>
                <div className="w-24 flex justify-end">
                  <span className="bg-success-light text-success-text px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase">Paid</span>
                </div>
                <button className="ml-6 text-caption hover:text-heading transition-colors">
                  <Download size={16} />
                </button>
              </div>

              {/* Invoice 3 */}
              <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                <div className="w-32 text-sm font-medium text-body-light">Aug 01, 2026</div>
                <div className="flex-1 text-sm font-semibold text-heading">Seat Overage</div>
                <div className="text-sm font-bold text-heading tabular-nums">$150.00</div>
                <div className="w-24 flex justify-end">
                  <span className="bg-success-light text-success-text px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase">Paid</span>
                </div>
                <button className="ml-6 text-caption hover:text-heading transition-colors">
                  <Download size={16} />
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Right: Next Invoice Panel */}
        <div className="w-[360px] bg-surface-raised border-l border-border-default flex flex-col flex-shrink-0 shadow-panel z-10">
          
          <div className="flex-1 overflow-y-auto p-8">
            <h2 className="text-lg font-bold text-heading leading-tight">Next Invoice</h2>
            <p className="text-[11px] font-medium text-muted mb-6">Due: Nov 01, 2026</p>
            
            {/* Invoice Breakdown Card */}
            <div className="bg-surface-muted border border-border-default rounded-card-sm p-6 shadow-card">
              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium text-body-light">Enterprise Base</span>
                  <span className="font-bold text-heading tabular-nums">$2,400.00</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium text-body-light">Additional Seats (0)</span>
                  <span className="font-bold text-heading tabular-nums">$0.00</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium text-body-light">Taxes (VAT 14%)</span>
                  <span className="font-bold text-heading tabular-nums">$336.00</span>
                </div>
              </div>
              
              <div className="border-t border-dashed border-border-strong pt-4 flex justify-between items-end">
                <span className="text-sm font-bold text-heading">Total</span>
                <span className="text-2xl font-black text-heading tracking-tight tabular-nums">$2,736.00</span>
              </div>
            </div>
          </div>

          {/* Sticky Bottom Actions */}
          <div className="p-8 bg-surface-raised border-t border-border-subtle flex flex-col gap-4 mt-auto">
            <button className="w-full bg-primary text-on-primary py-2.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card">
              Pay Early
            </button>
            <button className="w-full bg-surface-raised border border-border-strong text-body py-2.5 rounded-input text-sm font-semibold hover:bg-surface-muted transition-colors shadow-card">
              Contact Billing Support
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}