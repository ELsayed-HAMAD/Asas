import React, { useState } from 'react';
import {
  Search, Send, Filter, ChevronDown,
  CheckSquare, Square, FileText, Paperclip, Phone,
  CircleDot, Circle, Loader2
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../../../lib/api/finance';
import { queryKeys } from '../../../lib/queryKeys';
import { formatMoney } from '../../../lib/format';
import TopBarActions from '../../../components/TopBarActions';
import ConfirmDialog from '../../../components/common/ConfirmDialog';

// The old page rendered receivable money with no forced decimals (e.g. $320,000) — keep that.
const money = (v) => formatMoney(v, { minimumFractionDigits: 0 });

export default function AccountsReceivable() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [activityBody, setActivityBody] = useState('')
  const [activityType, setActivityType] = useState('Note')
  const [search, setSearch] = useState('')
  const [ageFilter, setAgeFilter] = useState('all')
  const [oldestFirst, setOldestFirst] = useState(true)
  const [paymentTargetId, setPaymentTargetId] = useState(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.finance.receivables.list({ limit: 100 }),
    queryFn: () => financeApi.listReceivables({ limit: 100 }),
  });

  const { data: customersData } = useQuery({
    queryKey: [...queryKeys.finance.all(), 'customers'],
    queryFn: financeApi.listCustomers,
  });
  const paymentMutation = useMutation({
    mutationFn: (invoiceId) => financeApi.updateReceivableStatus(invoiceId, 'PAID'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.receivables.all() })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.finance.all(), 'customers'] })
      setPaymentTargetId(null)
    },
  });
  const { data: activitiesData } = useQuery({
    queryKey: [...queryKeys.finance.all(), 'customer-activities', selectedId],
    queryFn: () => financeApi.listCollectionActivities(selectedId),
    enabled: Boolean(selectedId),
  })
  const activityMutation = useMutation({
    mutationFn: () => financeApi.createCollectionActivity(selectedId, { title: activityType === 'Call' ? 'Call logged' : 'Note', body: activityBody.trim() }),
    onSuccess: () => {
      setActivityBody('')
      queryClient.invalidateQueries({ queryKey: [...queryKeys.finance.all(), 'customer-activities', selectedId] })
    },
  })

  const items = data?.items || [];
  const customers = customersData?.items || [];
  const summary = data?.summary || {};
  const displayItems = React.useMemo(() => customers
      .map(c => ({
        id: c.id,
        name: c.name,
        avatar: c.avatarUrl,
        openBalance: c.openBalance,
        status: c.collectionStatus,
        oldest: c.oldestOverdueDays,
      }))
      .filter(c => c.openBalance && c.openBalance.amount > 0)
      .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()))
      .filter(c => ageFilter === 'all' || (ageFilter === 'overdue' ? c.oldest > 0 : c.oldest === 0))
      .sort((a, b) => oldestFirst ? b.oldest - a.oldest : a.oldest - b.oldest),
  [customers, search, ageFilter, oldestFirst]);

  // Sync selectedId with the filtered list
  React.useEffect(() => {
    if (displayItems.length > 0 && !displayItems.some(i => i.id === selectedId)) {
      setSelectedId(displayItems[0].id);
    } else if (displayItems.length === 0 && selectedId !== null) {
      setSelectedId(null);
    }
  }, [displayItems, selectedId]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised text-danger">
        Failed to load accounts receivable.
      </div>
    );
  }

  const selectedRecord = displayItems.find(i => i.id === selectedId);

  // KPIs straight from the server AR aging report (SQL buckets, not client-side aggregation):
  // the five cards are open balance + the four day-past-due buckets, all in report order.
  const bucketTotal = (label) => (summary.agingBuckets ?? []).find(b => b.bucket === label)?.total ?? { amount: 0, currency: 'USD' };
  const totalOutstanding = summary.openBalance ?? { amount: 0, currency: 'USD' };
  const current = bucketTotal('current');
  const days1to30 = bucketTotal('1-30');
  const days31to60 = bucketTotal('31-60');
  const days60plus = bucketTotal('60+');

  // Outstanding invoices for the selected customer (from the flat invoice list).
  const selectedInvoices = selectedRecord
    ? items.filter(r => r.customerId === selectedRecord.id && r.status !== 'PAID')
    : [];
  const paymentTarget = items.find(invoice => invoice.id === paymentTargetId)

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-[1000px]">

      <TopBarActions>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search..."
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-muted w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
          <button disabled className="flex items-center gap-2 bg-surface-muted0 text-white px-4 py-1.5 rounded-input text-sm font-medium hover:bg-gray-600 transition-colors shadow-card disabled:opacity-60">
            <Send size={14} /> Send Batch Reminders (0)
          </button>
        </div>
      </TopBarActions>

      {/* ── KPIs Row ── */}
      <div className="px-6 py-5 flex-shrink-0 border-b border-border-default bg-surface-muted">
        <div className="grid grid-cols-5 gap-4">
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-bold text-muted tracking-wide mb-1.5">Total Outstanding</p>
            <p className="text-2xl font-bold text-heading">{money(totalOutstanding)}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-bold text-muted tracking-wide mb-1.5">Current</p>
            <p className="text-2xl font-bold text-heading">{money(current)}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-bold text-muted tracking-wide mb-1.5">1-30 Days</p>
            <p className="text-2xl font-bold text-heading">{money(days1to30)}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[11px] font-bold text-muted tracking-wide mb-1.5">31-60 Days</p>
            <p className="text-2xl font-bold text-heading">{money(days31to60)}</p>
          </div>
          {/* Highlighted Danger KPI */}
          <div className={`border border-border-default border-l-4 rounded-button p-4 bg-surface-raised shadow-card ${days60plus.amount > 0 ? 'border-l-red-600' : 'border-l-transparent'}`}>
            <p className="text-[11px] font-bold text-muted tracking-wide mb-1.5">60+ Days</p>
            <p className={`text-2xl font-bold ${days60plus.amount > 0 ? 'text-danger' : 'text-heading'}`}>{money(days60plus)}</p>
          </div>
        </div>
      </div>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: Table Area */}
        <div className="flex-1 overflow-y-auto bg-surface-raised flex flex-col">

          {/* Table Toolbar */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border-default bg-surface-muted/50 flex-shrink-0">
            <div className="flex items-center gap-4">
              <Square size={16} className="text-faint" />
              <button onClick={() => setAgeFilter(current => current === 'all' ? 'overdue' : current === 'overdue' ? 'current' : 'all')} className="flex items-center gap-1.5 text-sm font-medium text-body-light hover:text-heading transition-colors">
                <Filter size={14} /> {ageFilter === 'all' ? 'All' : ageFilter === 'overdue' ? 'Overdue' : 'Current'} <ChevronDown size={14} className="text-caption" />
              </button>
            </div>
            <button onClick={() => setOldestFirst(current => !current)} className="flex items-center gap-1.5 text-sm font-medium text-body-light hover:text-heading transition-colors">
              Sort: {oldestFirst ? 'Oldest First' : 'Newest First'} <ChevronDown size={14} className="text-caption" />
            </button>
          </div>

          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-raised sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 border-b border-border-default w-12"></th>
                <th className="px-2 py-3 text-[10px] font-bold text-caption uppercase tracking-wider border-b border-border-default">Customer</th>
                <th className="px-6 py-3 text-[10px] font-bold text-caption uppercase tracking-wider border-b border-border-default text-center">Oldest</th>
                <th className="px-6 py-3 text-[10px] font-bold text-caption uppercase tracking-wider border-b border-border-default text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {displayItems.map(account => {
                const isSelected = selectedId === account.id;
                const isSeverelyOverdue = account.oldest > 60;

                return (
                  <tr
                    key={account.id}
                    onClick={() => setSelectedId(account.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-accent-light/40 border-l-4 border-l-blue-600' : 'bg-surface-raised hover:bg-surface-muted border-l-4 border-l-transparent'
                    }`}
                  >
                    <td className="px-6 py-4">
                      {isSelected
                        ? <CheckSquare size={16} className="text-black" fill="black" stroke="white" />
                        : <Square size={16} className="text-faint" />
                      }
                    </td>
                    <td className="px-2 py-4">
                      <div className="flex items-center gap-3">
                        {account.avatar ? (
                          <img src={account.avatar} alt="Avatar" className="w-7 h-7 rounded-full shadow-card" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-[#3d3121] flex items-center justify-center text-[11px] font-bold text-white shadow-card">
                            {account.name?.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span className="text-sm font-semibold text-heading">{account.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${
                        isSeverelyOverdue ? 'bg-danger-light text-danger' : 'text-body-light'
                      }`}>
                        {account.oldest} {account.oldest === 1 ? 'Day' : 'Days'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium text-heading tabular-nums">
                      {money(account.openBalance)}
                    </td>
                  </tr>
                )
              })}

              {displayItems.length === 0 && (
                <tr>
                   <td colSpan={4} className="px-6 py-8 text-center text-muted text-sm">
                     No customers found with outstanding balances.
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Right: Detail Panel */}
        {selectedRecord && (
          <div className="w-[520px] bg-surface-muted border-l border-border-default overflow-y-auto p-6 flex-shrink-0 space-y-6 shadow-panel">

            {/* Customer Header Card */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm p-6 shadow-card">
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-4">
                  {selectedRecord.avatar ? (
                    <img src={selectedRecord.avatar} alt="Avatar" className="w-12 h-12 rounded-button shadow-card" />
                  ) : (
                    <div className="w-12 h-12 bg-[#3d3121] rounded-button flex items-center justify-center text-xl font-bold text-white shadow-card">
                      {selectedRecord.name?.substring(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg font-bold text-heading leading-tight">{selectedRecord.name}</h2>
                    <button disabled className="flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-body mt-1 disabled:opacity-60">
                      Status: {selectedRecord.status?.replace('_', ' ')} <ChevronDown size={12} />
                    </button>
                  </div>
                </div>
                {selectedRecord.openBalance?.amount === 0 ? (
                  <button disabled className="bg-surface-muted text-body-light border border-border-default px-4 py-2 rounded-input text-sm font-semibold hover:bg-surface-strong transition-colors shadow-card disabled:opacity-60">
                    View History
                  </button>
                ) : (
                  <button disabled={!selectedInvoices[0] || paymentMutation.isPending} onClick={() => setPaymentTargetId(selectedInvoices[0].id)} className="bg-primary text-white px-4 py-2 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors shadow-card disabled:opacity-60">
                    Log Payment
                  </button>
                )}
              </div>

              <div className="flex items-end justify-between border-t border-border-subtle pt-5">
                <div>
                  <p className="text-[10px] font-bold text-caption uppercase tracking-wider mb-1">Total Outstanding</p>
                  <p className="text-4xl font-extrabold text-heading tracking-tight">{money(selectedRecord.openBalance)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-caption uppercase tracking-wider mb-1">Oldest Invoice</p>
                  <p className={`text-sm font-bold ${selectedRecord.oldest > 0 ? 'text-danger' : 'text-success'}`}>
                    {selectedRecord.oldest > 0 ? `${selectedRecord.oldest} ${selectedRecord.oldest === 1 ? 'Day' : 'Days'} Overdue` : 'Current'}
                  </p>
                </div>
              </div>
            </div>

            {/* Outstanding Invoices Card */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle bg-surface-raised">
                <h3 className="text-xs font-bold text-heading">Outstanding Invoices</h3>
                <span className="text-[11px] font-semibold text-muted">{selectedInvoices.length} Items</span>
              </div>
              <div className="divide-y divide-border-subtle">

                {selectedInvoices.map(inv => {
                  let daysOverdue = 0;
                  if (inv.dueDate) {
                    const diffTime = new Date() - new Date(inv.dueDate);
                    daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  }

                  return (
                    <div key={inv.id} className="flex items-center justify-between p-5 hover:bg-surface-muted transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-surface-muted border border-border-default rounded-input text-caption">
                          <FileText size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-heading">{inv.number || 'No Number'}</p>
                          <p className="text-[11px] font-medium text-muted mt-0.5">
                            {daysOverdue > 0 ? (
                              <span className="text-danger font-bold">Overdue ({daysOverdue}d)</span>
                            ) : (
                              <span className="text-success font-bold">Current</span>
                            )}
                            {inv.dueDate && ` • Due ${new Date(inv.dueDate).toLocaleDateString()}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-heading tabular-nums">{money(inv.amount)}</span>
                        <button disabled={paymentMutation.isPending || inv.status === 'PAID'} onClick={() => setPaymentTargetId(inv.id)} className="flex items-center gap-1 border border-border-strong rounded px-2.5 py-1 text-xs font-semibold text-body hover:bg-surface-muted transition-colors bg-surface-raised disabled:opacity-60">
                          Action <ChevronDown size={12} className="text-caption" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {selectedInvoices.length === 0 && (
                  <div className="p-5 text-center text-muted text-sm">
                    No outstanding invoices.
                  </div>
                )}
              </div>
            </div>

            {/* Activity Timeline Card — no activity feed in the API; renders its empty state. */}
            <div className="bg-surface-raised border border-border-default rounded-card-sm shadow-card overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-border-subtle">
                <h3 className="text-xs font-bold text-heading">Activity</h3>
              </div>

              <div className="p-5">
                {/* Input Box */}
                <div className="border border-border-default rounded-button bg-surface focus-within:bg-surface-raised focus-within:border-border-strong transition-colors mb-6">
                  <textarea
                    placeholder="Add a note or log a call..."
                    value={activityBody}
                    onChange={event => setActivityBody(event.target.value)}
                    className="w-full bg-transparent text-sm p-3 outline-none resize-none h-20 text-body placeholder-gray-400"
                  />
                  <div className="flex items-center justify-between p-2 border-t border-border-subtle">
                    <div className="flex items-center gap-2 text-caption px-2">
                      <button disabled className="hover:text-body-light transition-colors disabled:opacity-60"><Paperclip size={16} /></button>
                      <button type="button" aria-label={activityType === 'Call' ? 'Log a call' : 'Add a note'} onClick={() => setActivityType(current => current === 'Note' ? 'Call' : 'Note')} className={`transition-colors ${activityType === 'Call' ? 'text-accent' : 'hover:text-body-light'}`}><Phone size={16} /></button>
                    </div>
                    <button disabled={!activityBody.trim() || activityMutation.isPending} onClick={() => activityMutation.mutate()} className="bg-primary text-white text-xs font-semibold px-4 py-1.5 rounded hover:bg-primary-hover transition-colors disabled:opacity-60">
                      {activityMutation.isPending ? 'Posting...' : 'Post'}
                    </button>
                  </div>
                </div>
                {activityMutation.isError && <p role="alert" className="mb-4 text-xs text-danger">{activityMutation.error?.message || 'Could not post activity.'}</p>}

                {/* Timeline */}
                <div className="relative pl-3 space-y-6">
                  {/* Continuous Line */}
                  <div className="absolute left-[17px] top-2 bottom-6 w-px bg-surface-strong"></div>

                  {(activitiesData?.items ?? []).map((act, index) => (
                    <div key={act.id} className="relative z-10 flex gap-4">
                      <div className="bg-surface-raised ring-4 ring-white mt-1">
                        {index === 0 ? (
                          <CircleDot size={16} className="text-heading" strokeWidth={2.5} />
                        ) : (
                          <Circle size={16} className="text-accent" strokeWidth={2.5} />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-0.5">
                          <p className="text-sm font-bold text-heading">{act.title}</p>
                          <span className="text-[10px] font-semibold text-muted">
                            {new Date(act.date).toLocaleDateString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[11px] font-medium text-muted mb-2">{act.author}</p>
                        <div className="bg-surface-muted border border-border-subtle rounded-button p-3 text-[13px] text-body leading-relaxed">
                          {act.body}
                        </div>
                      </div>
                    </div>
                  ))}

                  {(!activitiesData?.items || activitiesData.items.length === 0) && (
                    <div className="text-center text-muted text-sm py-4">
                      No activity recorded.
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
      <ConfirmDialog
        open={Boolean(paymentTargetId)}
        onClose={() => setPaymentTargetId(null)}
        onConfirm={() => paymentTargetId && paymentMutation.mutate(paymentTargetId)}
        title="Record payment?"
        description={paymentTarget ? `Mark invoice ${paymentTarget.number || paymentTarget.id} as paid? This updates the receivable status and customer balance.` : 'Mark this invoice as paid?'}
        confirmLabel="Mark as paid"
        busy={paymentMutation.isPending}
      />
    </div>
  );
}
