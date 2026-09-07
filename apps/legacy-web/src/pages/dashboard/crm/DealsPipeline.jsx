import React, { useState } from 'react';
import {
  Search,
  LayoutGrid,
  List,
  MoreHorizontal,
  Mail,
  Phone,
  Pencil,
  Circle,
  Loader2
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { crmApi } from '../../../lib/api/crm';
import { queryKeys } from '../../../lib/queryKeys';
import { formatMoney, formatDate } from '../../../lib/format';
import TopBarActions from '../../../components/TopBarActions';

const STAGE_ORDER = ['LEADS', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'];

const STAGE_LABELS = {
  LEADS: 'Leads',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  CLOSED_WON: 'Closed Won',
  CLOSED_LOST: 'Closed Lost',
};

const getStageBadgeColors = (stage) => {
  switch (stage) {
    case 'LEADS': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'PROPOSAL': return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'NEGOTIATION': return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'CLOSED_WON': return 'bg-green-100 text-green-700 border-green-200';
    case 'CLOSED_LOST': return 'bg-red-100 text-red-700 border-red-200';
    default: return 'bg-surface-strong/70 text-body border-border-default/50';
  }
};

// Avatar initials derived from the deal's (company or name) — the old rows showed a
// 2-letter monogram in the avatar box.
const initials = (deal) => {
  const source = deal.company || deal.name || '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

export default function DealsPipeline() {
  const [selectedId, setSelectedId] = useState(null);

  // One page is the full board — the server's deal ceiling is 100 rows.
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.crm.deals.list({ limit: 100 }),
    queryFn: () => crmApi.listDeals({ limit: 100 }),
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center bg-surface text-danger">
        Failed to load deals pipeline.
      </div>
    );
  }

  const deals = data.items || [];

  // Group by real stage (server order), skipping empty stages. Group value is the
  // page-local sum of stored deal values; count/value badges come from the server
  // `summary` where it covers the same set (open totals).
  const groups = STAGE_ORDER
    .map((stage) => ({ stage, deals: deals.filter((d) => d.stage === stage) }))
    .filter((g) => g.deals.length > 0);

  const firstDeal = groups.length > 0 ? groups[0].deals[0] : null;
  const effectiveSelectedId = selectedId || (firstDeal ? firstDeal.id : null);
  const selectedDeal = deals.find((d) => d.id === effectiveSelectedId) || null;

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
          </div>

          <div className="flex items-center border border-border-default rounded-input overflow-hidden bg-surface-muted">
            <button className="p-1.5 text-caption hover:text-body hover:bg-surface-raised transition-colors border-r border-border-default">
              <LayoutGrid size={16} />
            </button>
            <button className="p-1.5 text-heading bg-surface-raised shadow-card">
              <List size={16} />
            </button>
          </div>

          <button disabled className="bg-primary text-white px-5 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60">
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
            {groups.length === 0 ? (
               <div className="p-8 text-center text-muted text-sm">No deals found.</div>
            ) : (
              groups.map((group) => (
                <div key={group.stage}>
                  {/* Group Header */}
                  <div className="flex items-center justify-between px-6 py-2 bg-surface-muted/80 border-b border-border-default">
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                      {STAGE_LABELS[group.stage]} · {group.deals.length} {group.deals.length === 1 ? 'Deal' : 'Deals'}
                    </span>
                    <span className="text-[11px] font-bold text-body-light tabular-nums">
                      {formatMoney({ amount: group.deals.reduce((sum, d) => sum + (d.value?.amount ?? 0), 0), currency: group.deals[0].value?.currency })}
                    </span>
                  </div>

                  {/* Deal Rows */}
                  <div className="divide-y divide-border-subtle">
                    {group.deals.map((deal) => {
                      const isSelected = effectiveSelectedId === deal.id;
                      return (
                        <div
                          key={deal.id}
                          onClick={() => setSelectedId(deal.id)}
                          className={`grid grid-cols-12 items-center px-6 py-4 cursor-pointer transition-colors ${
                            isSelected ? 'bg-surface-raised border-l-4 border-l-blue-600' : 'bg-surface-raised hover:bg-surface-muted border-l-4 border-l-transparent'
                          }`}
                        >
                          <div className="col-span-6 flex items-center gap-3">
                            <div className="w-8 h-8 rounded shrink-0 flex items-center justify-center text-xs font-bold bg-surface-strong text-body">
                              {initials(deal)}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-heading leading-tight">{deal.name}</p>
                              <p className="text-[11px] font-medium text-muted mt-0.5">{deal.company || (deal.owner?.name || 'No company')}</p>
                            </div>
                          </div>

                          <div className="col-span-3 flex justify-center">
                            <span className={`inline-flex px-3 py-1 text-[11px] font-semibold rounded-full border ${getStageBadgeColors(deal.stage)}`}>
                              {STAGE_LABELS[deal.stage] || deal.stage}
                            </span>
                        </div>

                        <div className="col-span-3 text-right">
                          <span className="text-sm font-bold text-heading tabular-nums">
                            {formatMoney(deal.value)}
                          </span>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Deal Detail Panel */}
        <div className="w-[45%] bg-surface-raised overflow-y-auto flex-shrink-0">

          {selectedDeal ? (
            <>
              {/* Top Section */}
              <div className="p-8 border-b border-border-default">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-button bg-primary flex items-center justify-center text-xl font-bold text-white shadow-card">
                      {initials(selectedDeal)}
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-heading tracking-tight leading-tight">{selectedDeal.name}</h2>
                      <p className="text-sm text-muted mt-1">{selectedDeal.company || 'No company'} · {selectedDeal.owner?.title || 'Owner unassigned'}</p>
                    </div>
                  </div>
                  <button className="text-caption hover:text-body transition-colors">
                    <MoreHorizontal size={20} />
                  </button>
                </div>

                <div className="mb-8">
                  <p className="text-4xl font-extrabold text-[#2563eb] tracking-tight tabular-nums">{formatMoney(selectedDeal.value)}</p>
                </div>

                <div className="flex items-center gap-3">
                  <button disabled className="flex-1 flex items-center justify-center gap-2 border border-border-default text-body py-2.5 rounded-input text-sm font-semibold hover:bg-surface-muted transition-colors disabled:opacity-60">
                    <Mail size={16} className="text-muted" /> Email
                  </button>
                  <button disabled className="flex-1 flex items-center justify-center gap-2 border border-border-default text-body py-2.5 rounded-input text-sm font-semibold hover:bg-surface-muted transition-colors disabled:opacity-60">
                    <Phone size={16} className="text-muted" /> Log Call
                  </button>
                  <button disabled className="flex-1 flex items-center justify-center gap-2 border border-border-default text-body py-2.5 rounded-input text-sm font-semibold hover:bg-surface-muted transition-colors disabled:opacity-60">
                    <Pencil size={16} className="text-muted" /> Edit
                  </button>
                </div>
              </div>

              {/* Win Probability Section */}
              <div className="p-8 border-b border-border-default">
                <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-5">Win Probability</h3>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-heading">{selectedDeal.winProbability == null ? '—' : `${Math.round(selectedDeal.winProbability)}%`}</span>
                  <span className="text-[11px] font-medium text-muted">
                    {selectedDeal.closeDate ? `Closing ${formatDate(selectedDeal.closeDate, { month: 'short', day: 'numeric' })}` : 'No close date'}
                  </span>
                </div>
                <div className="w-full bg-surface-strong rounded-full h-1.5 overflow-hidden">
                  <div className="bg-accent h-full rounded-full" style={{ width: `${selectedDeal.winProbability ?? 0}%` }}></div>
                </div>
              </div>

              {/* Recent Activity Section — no activity endpoint exists for deals; honest empty state */}
              <div className="p-8">
                <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-6">Recent Activity</h3>

                <div className="relative pl-3 space-y-7">
                  {/* Vertical Line */}
                  <div className="absolute left-[19px] top-2 bottom-4 w-px bg-surface-strong"></div>

                  <div className="relative z-10 flex gap-4">
                    <div className="bg-surface-raised ring-4 ring-white mt-0.5">
                      <Circle size={18} className="text-faint" strokeWidth={2.5} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-muted">No recent activity logged for this deal.</p>
                    </div>
                  </div>

                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-muted">
              Select a deal to view details.
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
