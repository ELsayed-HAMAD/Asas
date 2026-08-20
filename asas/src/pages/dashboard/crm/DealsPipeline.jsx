import React, { useState } from 'react';
import { 
  ChevronRight, 
  Search, 
  LayoutGrid, 
  List, 
  MoreHorizontal,
  Mail,
  Phone,
  Pencil,
  CircleDot,
  Circle
} from 'lucide-react';

// ── Mock Data ────────────────────────────────────────────────
const PIPELINE_DATA = [
  {
    group: 'Proposal',
    count: 2,
    total: 338500,
    deals: [
      { id: 'deal_1', name: 'Acme Corp ERP Upgrade', company: 'Acme Corporation', avatar: 'A', avatarBg: 'bg-primary text-white', stage: 'Proposal', value: 218500 },
      { id: 'deal_2', name: 'Stark Industries Expansion', company: 'Stark Industries', avatar: 'S', avatarBg: 'bg-surface-strong text-body', stage: 'Proposal', value: 120000 },
    ]
  },
  {
    group: 'Negotiation',
    count: 1,
    total: 85000,
    deals: [
      { id: 'deal_3', name: 'Wayne Enterprises Sync', company: 'Wayne Enterprises', avatar: 'W', avatarBg: 'bg-surface-strong text-body', stage: 'Negotiation', value: 85000 },
    ]
  }
];

const formatCurrency = (num) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0
  }).format(num);
};

import TopBarActions from '../../../components/TopBarActions';

export default function DealsPipeline() {
  const [selectedId, setSelectedId] = useState('deal_1');

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-[1000px]">
      
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
          
          <div className="flex items-center border border-border-default rounded-input overflow-hidden bg-surface-muted">
            <button className="p-1.5 text-caption hover:text-body hover:bg-surface-raised transition-colors border-r border-border-default">
              <LayoutGrid size={16} />
            </button>
            <button className="p-1.5 text-heading bg-surface-raised shadow-card">
              <List size={16} />
            </button>
          </div>
          
          <button className="bg-primary text-white px-5 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">
            New Deal
          </button>
        </div>
      </TopBarActions>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Deal List Area */}
        <div className="w-[55%] flex flex-col bg-surface-raised border-r border-border-default overflow-y-auto">
          
          {/* Table Header */}
          <div className="grid grid-cols-12 px-6 py-3 border-b border-border-default bg-surface-raised flex-shrink-0">
            <div className="col-span-6 text-[10px] font-bold text-muted uppercase tracking-wider">Deal Name</div>
            <div className="col-span-3 text-[10px] font-bold text-muted uppercase tracking-wider text-center">Stage</div>
            <div className="col-span-3 text-[10px] font-bold text-muted uppercase tracking-wider text-right">Value</div>
          </div>

          <div className="flex-1 pb-10">
            {PIPELINE_DATA.map((group, groupIdx) => (
              <div key={groupIdx}>
                {/* Group Header */}
                <div className="flex items-center justify-between px-6 py-2 bg-surface-muted/80 border-b border-border-default">
                  <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                    {group.group} · {group.count} {group.count === 1 ? 'Deal' : 'Deals'}
                  </span>
                  <span className="text-[11px] font-bold text-body-light tabular-nums">
                    {formatCurrency(group.total)}
                  </span>
                </div>
                
                {/* Deal Rows */}
                <div className="divide-y divide-border-subtle">
                  {group.deals.map((deal) => {
                    const isSelected = selectedId === deal.id;
                    return (
                      <div 
                        key={deal.id}
                        onClick={() => setSelectedId(deal.id)}
                        className={`grid grid-cols-12 items-center px-6 py-4 cursor-pointer transition-colors ${
                          isSelected ? 'bg-surface-raised border-l-4 border-l-blue-600' : 'bg-surface-raised hover:bg-surface-muted border-l-4 border-l-transparent'
                        }`}
                      >
                        <div className="col-span-6 flex items-center gap-3">
                          <div className={`w-8 h-8 rounded shrink-0 flex items-center justify-center text-xs font-bold ${deal.avatarBg}`}>
                            {deal.avatar}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-heading leading-tight">{deal.name}</p>
                            <p className="text-[11px] font-medium text-muted mt-0.5">{deal.company}</p>
                          </div>
                        </div>
                        
                        <div className="col-span-3 flex justify-center">
                          <span className="inline-flex px-3 py-1 bg-surface-strong/70 text-body text-[11px] font-semibold rounded-full border border-border-default/50">
                            {deal.stage}
                          </span>
                        </div>
                        
                        <div className="col-span-3 text-right">
                          <span className="text-sm font-bold text-heading tabular-nums">
                            {formatCurrency(deal.value)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Deal Detail Panel */}
        <div className="w-[45%] bg-surface-raised overflow-y-auto flex-shrink-0">
          
          {/* Top Section */}
          <div className="p-8 border-b border-border-default">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-button bg-primary flex items-center justify-center text-xl font-bold text-white shadow-card">
                  A
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-heading tracking-tight leading-tight">Acme Corp ERP Upgrade</h2>
                  <p className="text-sm text-muted mt-1">Acme Corporation · Enterprise</p>
                </div>
              </div>
              <button className="text-caption hover:text-body transition-colors">
                <MoreHorizontal size={20} />
              </button>
            </div>
            
            <div className="mb-8">
              <p className="text-4xl font-extrabold text-[#2563eb] tracking-tight tabular-nums">$218,500</p>
            </div>

            <div className="flex items-center gap-3">
              <button className="flex-1 flex items-center justify-center gap-2 border border-border-default text-body py-2.5 rounded-input text-sm font-semibold hover:bg-surface-muted transition-colors">
                <Mail size={16} className="text-muted" /> Email
              </button>
              <button className="flex-1 flex items-center justify-center gap-2 border border-border-default text-body py-2.5 rounded-input text-sm font-semibold hover:bg-surface-muted transition-colors">
                <Phone size={16} className="text-muted" /> Log Call
              </button>
              <button className="flex-1 flex items-center justify-center gap-2 border border-border-default text-body py-2.5 rounded-input text-sm font-semibold hover:bg-surface-muted transition-colors">
                <Pencil size={16} className="text-muted" /> Edit
              </button>
            </div>
          </div>

          {/* Win Probability Section */}
          <div className="p-8 border-b border-border-default">
            <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-5">Win Probability</h3>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-heading">85% Likelihood</span>
              <span className="text-[11px] font-medium text-muted">Closing on Nov 24</span>
            </div>
            <div className="w-full bg-surface-strong rounded-full h-1.5 overflow-hidden">
              <div className="bg-accent h-full rounded-full" style={{ width: '85%' }}></div>
            </div>
          </div>

          {/* Recent Activity Section */}
          <div className="p-8">
            <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-6">Recent Activity</h3>
            
            <div className="relative pl-3 space-y-7">
              {/* Vertical Line */}
              <div className="absolute left-[19px] top-2 bottom-4 w-px bg-surface-strong"></div>
              
              {/* Timeline Item 1 */}
              <div className="relative z-10 flex gap-4">
                <div className="bg-surface-raised ring-4 ring-white mt-0.5">
                  <CircleDot size={18} className="text-accent" strokeWidth={2.5} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-heading mb-0.5">Meeting completed with VP of IT</p>
                  <p className="text-[11px] font-medium text-muted">2 hours ago</p>
                </div>
              </div>

              {/* Timeline Item 2 */}
              <div className="relative z-10 flex gap-4">
                <div className="bg-surface-raised ring-4 ring-white mt-0.5">
                  <Circle size={18} className="text-faint" strokeWidth={2.5} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-heading mb-0.5">Sent updated pricing proposal</p>
                  <p className="text-[11px] font-medium text-muted">Yesterday, 4:30 PM</p>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}