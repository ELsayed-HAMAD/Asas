import React, { useState } from 'react';
import {
  Search, Send, ChevronDown,
  FileText, Paperclip, Phone,
  CircleDot, Circle, Loader2,
  Users, Plus, Pencil, Trash2, X, Check, AlertTriangle
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../../../lib/api/finance';
import { queryKeys } from '../../../lib/queryKeys';
import { formatDate, formatMoney, formatCompactTableMoney } from '../../../lib/format';
import ConfirmDialog from '../../../components/common/ConfirmDialog';

// The old page rendered receivable money with no forced decimals (e.g. $320,000) — keep that.
const money = (v) => formatMoney(v, { minimumFractionDigits: 0 });
const compactMoney = (v) => formatCompactTableMoney(v, { minimumFractionDigits: 0 });
const metricFontSize = (v) => {
  const label = money(v)
  return `clamp(0.75rem, ${Math.min(14, 130 / Math.max(1, label.length))}cqw, 1.5rem)`
};

export default function AccountsReceivable() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [activityBody, setActivityBody] = useState('')
  const [activityType, setActivityType] = useState('Note')
  const [search, setSearch] = useState('')
  const [customerPage, setCustomerPage] = useState(1)
  const CUSTOMER_PAGE_SIZE = 10
  const [invoicePage, setInvoicePage] = useState(1)
  const [ageFilter, setAgeFilter] = useState('all')
  const [oldestFirst, setOldestFirst] = useState(true)
  const [paymentTargetId, setPaymentTargetId] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const [editingCustomerName, setEditingCustomerName] = useState('');
  const [editingCustomerEmail, setEditingCustomerEmail] = useState('');
  const [customerError, setCustomerError] = useState('');
  const [deletingCustomer, setDeletingCustomer] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.finance.receivables.list({ limit: 1 }),
    queryFn: () => financeApi.listReceivables({ limit: 1 }),
  });
  React.useEffect(() => setInvoicePage(1), [selectedId])
  const { data: selectedInvoicesData, isLoading: isInvoicesLoading } = useQuery({
    queryKey: queryKeys.finance.receivables.list({ customerId: selectedId, statusGroup: 'OPEN', page: invoicePage, limit: 10 }),
    queryFn: () => financeApi.listReceivables({ customerId: selectedId, statusGroup: 'OPEN', page: invoicePage, limit: 10 }),
    enabled: Boolean(selectedId),
  })
  React.useEffect(() => {
    const pages = selectedInvoicesData?.pagination?.pages
    if (pages === undefined) return
    if (pages === 0 && invoicePage !== 1) setInvoicePage(1)
    else if (pages > 0 && invoicePage > pages) setInvoicePage(pages)
  }, [selectedInvoicesData?.pagination?.pages, invoicePage])

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
  const updateCustomerMutation = useMutation({
    mutationFn: ({ id, ...body }) => financeApi.updateCustomer(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.all() });
      setEditingCustomerId(null);
      setEditingCustomerName('');
      setCustomerError('');
    },
    onError: (err) => setCustomerError(err?.message || 'Could not update customer.'),
  });
  const createCustomerMutation = useMutation({
    mutationFn: (customer) => financeApi.createCustomer(customer),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.all() });
      setNewCustomerName('');
      setNewCustomerEmail('');
      setCustomerError('');
    },
    onError: (err) => setCustomerError(err?.message || 'Could not create customer.'),
  });
  const deleteCustomerMutation = useMutation({
    mutationFn: (id) => financeApi.deleteCustomer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.all() });
      setDeletingCustomer(null);
      setCustomerError('');
    },
    onError: (err) => setCustomerError(err?.message || 'Could not delete customer.'),
  });
  const batchRemindMutation = useMutation({
    mutationFn: (customerIds) => financeApi.sendBatchReminders(customerIds),
    onSuccess: () => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.all() });
    },
  });

  const customers = customersData?.items || [];
  const summary = data?.summary || {};
  const displayItems = React.useMemo(() => customers
      .map(c => ({
        id: c.id,
        name: c.name,
        email: c.email,
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

  const totalCustomers = displayItems.length;
  const customerPages = Math.max(1, Math.ceil(totalCustomers / CUSTOMER_PAGE_SIZE));
  const paginatedCustomers = React.useMemo(() => {
    const start = (customerPage - 1) * CUSTOMER_PAGE_SIZE;
    return displayItems.slice(start, start + CUSTOMER_PAGE_SIZE);
  }, [displayItems, customerPage]);

  React.useEffect(() => {
    if (customerPage > customerPages) {
      setCustomerPage(customerPages);
    }
  }, [customerPages, customerPage]);

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
  const bucket = (label) => (summary.agingBuckets ?? []).find(b => b.bucket === label);
  const bucketTotal = (label) => bucket(label)?.total ?? { amount: 0, currency: 'USD' };
  const bucketCount = (label) => bucket(label)?.count ?? 0;

  const totalOutstanding = summary.openBalance ?? { amount: 0, currency: 'USD' };
  const current = bucketTotal('current');
  const days1to30 = bucketTotal('1-30');
  const days31to60 = bucketTotal('31-60');
  const days60plus = bucketTotal('60+');

  const currentCount = bucketCount('current');
  const days1to30Count = bucketCount('1-30');
  const days31to60Count = bucketCount('31-60');
  const days60plusCount = bucketCount('60+');

  const collectedThisMonth = summary.collectedThisMonthTotal;
  const priorCollections = summary.collectedThisMonthComparison?.previousTotal;
  const mtdSubtext = `Collected MTD: ${collectedThisMonth ? money(collectedThisMonth) : 'Unavailable'} · Prior: ${priorCollections ? money(priorCollections) : 'Unavailable'}`;

  // Outstanding invoices for the selected customer (from the flat invoice list).
  const selectedInvoices = selectedInvoicesData?.items ?? []
  const paymentTarget = selectedInvoices.find(invoice => invoice.id === paymentTargetId)

  const toggleSelection = (id) => {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchRemind = () => {
    if (selectedIds.size === 0) return;
    batchRemindMutation.mutate(Array.from(selectedIds));
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface-raised overflow-y-auto min-w-0 px-6 py-5">

      {/* ── Top Page Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 w-full mb-5 flex-shrink-0">
        {/* Left group */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              value={search}
              onChange={event => { setSearch(event.target.value); setCustomerPage(1); }}
              placeholder="Search customers..."
              className="pl-9 pr-4 py-2 text-xs border border-border-default rounded-input bg-surface-raised w-72 max-w-full focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-border-subtle transition-all shadow-card"
            />
          </div>
          <select
            aria-label="Filter customers by aging status"
            value={ageFilter}
            onChange={e => { setAgeFilter(e.target.value); setCustomerPage(1); }}
            className="border border-border-default text-body text-xs px-3 py-2 rounded-input bg-surface-raised hover:bg-surface-muted transition-colors cursor-pointer outline-none shadow-card"
          >
            <option value="all">All</option>
            <option value="overdue">Overdue</option>
            <option value="current">Current</option>
          </select>
          <select
            aria-label="Sort customers"
            value={oldestFirst ? 'oldest' : 'newest'}
            onChange={e => { setOldestFirst(e.target.value === 'oldest'); setCustomerPage(1); }}
            className="border border-border-default text-body text-xs px-3 py-2 rounded-input bg-surface-raised hover:bg-surface-muted transition-colors cursor-pointer outline-none shadow-card"
          >
            <option value="oldest">Sort: Oldest First</option>
            <option value="newest">Sort: Newest First</option>
          </select>
        </div>

        {/* Right group */}
        <div className="flex items-center gap-2.5 shrink-0 ml-auto">
          <button 
            type="button"
            disabled={selectedIds.size === 0 || batchRemindMutation.isPending}
            onClick={handleBatchRemind}
            className="flex items-center gap-1.5 border border-border-default text-body text-xs px-3 py-2 rounded-input font-medium hover:bg-surface-muted transition-colors bg-surface-raised shadow-card disabled:opacity-60 cursor-pointer"
          >
            {batchRemindMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            <span>Send Batch Reminders ({selectedIds.size})</span>
          </button>
          <button 
            type="button"
            onClick={() => { setCustomerError(''); setCustomerModalOpen(true); }}
            className="flex items-center gap-1.5 border border-border-default text-body text-xs px-3 py-2 rounded-input font-medium hover:bg-surface-muted transition-colors bg-surface-raised shadow-card cursor-pointer"
            title="Manage customers"
          >
            <Users size={13} className="text-muted" />
            <span>Customers</span>
          </button>
        </div>
      </div>

      {/* ── 5 Aging KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-5 flex-shrink-0">
        {/* Card 1: Total Outstanding */}
        <div className="border border-border-default rounded-card p-4 bg-surface-raised shadow-card flex flex-col" style={{ containerType: 'inline-size' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted truncate">Total Outstanding</p>
          <p className="min-w-0 text-2xl font-bold text-heading tracking-tight mt-1.5 leading-tight" style={{ fontSize: metricFontSize(totalOutstanding) }}>
            {money(totalOutstanding)}
          </p>
          <p className="mt-1.5 text-xs text-muted truncate" title={mtdSubtext}>
            {mtdSubtext}
          </p>
        </div>

        {/* Card 2: Current */}
        <div className="border border-border-default rounded-card p-4 bg-surface-raised shadow-card flex flex-col" style={{ containerType: 'inline-size' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted truncate">Current</p>
          <p className="min-w-0 text-2xl font-bold text-heading tracking-tight mt-1.5 leading-tight" style={{ fontSize: metricFontSize(current) }}>
            {money(current)}
          </p>
          <p className="mt-1.5 text-xs text-muted truncate">
            {currentCount > 0 ? `${currentCount} current invoice${currentCount === 1 ? '' : 's'}` : 'No current invoices'}
          </p>
        </div>

        {/* Card 3: 1-30 Days */}
        <div className="border border-border-default rounded-card p-4 bg-surface-raised shadow-card flex flex-col" style={{ containerType: 'inline-size' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted truncate">1-30 Days</p>
          <p className="min-w-0 text-2xl font-bold text-heading tracking-tight mt-1.5 leading-tight" style={{ fontSize: metricFontSize(days1to30) }}>
            {money(days1to30)}
          </p>
          <p className="mt-1.5 text-xs text-muted truncate">
            {days1to30Count} invoice{days1to30Count === 1 ? '' : 's'} due
          </p>
        </div>

        {/* Card 4: 31-60 Days */}
        <div className="border border-border-default rounded-card p-4 bg-surface-raised shadow-card flex flex-col" style={{ containerType: 'inline-size' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted truncate">31-60 Days</p>
          <p className="min-w-0 text-2xl font-bold text-heading tracking-tight mt-1.5 leading-tight" style={{ fontSize: metricFontSize(days31to60) }}>
            {money(days31to60)}
          </p>
          <p className="mt-1.5 text-xs text-muted truncate">
            {days31to60Count} overdue invoice{days31to60Count === 1 ? '' : 's'}
          </p>
        </div>

        {/* Card 5: 60+ Days */}
        <div className={`border border-border-default rounded-card p-4 bg-surface-raised shadow-card flex flex-col ${days60plus.amount > 0 ? 'border-l-4 border-l-red-600' : ''}`} style={{ containerType: 'inline-size' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted truncate">60+ Days</p>
          <p className={`min-w-0 text-2xl font-bold tracking-tight mt-1.5 leading-tight ${days60plus.amount > 0 ? 'text-danger' : 'text-heading'}`} style={{ fontSize: metricFontSize(days60plus) }}>
            {money(days60plus)}
          </p>
          <p className="mt-1.5 text-xs text-muted truncate">
            {days60plusCount} critical invoice{days60plusCount === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* ── Main Workspace: 12-Column Grid ── */}
      <div className="grid grid-cols-12 gap-5 items-start">

        {/* Left: Customer Table Card (col-span-8) */}
        <div className="col-span-12 lg:col-span-8">
          <div className="bg-surface-raised rounded-card border border-border-default shadow-card overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left border-collapse">
                <thead className="bg-surface-muted/60 border-b border-border-default">
                  <tr>
                    <th className="w-12 px-4 py-2.5 text-center">
                      <input
                        type="checkbox"
                        aria-label="Select all customers"
                        checked={paginatedCustomers.length > 0 && paginatedCustomers.every(c => selectedIds.has(c.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(current => {
                              const next = new Set(current);
                              paginatedCustomers.forEach(c => next.add(c.id));
                              return next;
                            });
                          } else {
                            setSelectedIds(current => {
                              const next = new Set(current);
                              paginatedCustomers.forEach(c => next.delete(c.id));
                              return next;
                            });
                          }
                        }}
                        className="w-4 h-4 rounded-sm border-border-default text-primary focus:ring-primary cursor-pointer"
                      />
                    </th>
                    <th className="px-3 py-2.5 text-[10px] font-bold text-caption uppercase tracking-wider">Customer</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-caption uppercase tracking-wider text-center">Oldest</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-caption uppercase tracking-wider text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
              {paginatedCustomers.map(account => {
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
                    <td className="w-12 px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${account.name}`}
                        checked={selectedIds.has(account.id)}
                        onChange={() => toggleSelection(account.id)}
                        className="w-4 h-4 rounded-sm border-border-default text-primary focus:ring-primary cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        {account.avatar ? (
                          <img src={account.avatar} alt="Avatar" className="w-7 h-7 rounded-full shadow-card shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-[#3d3121] flex items-center justify-center text-[11px] font-bold text-white shadow-card shrink-0">
                            {account.name?.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span className="text-sm font-semibold text-heading truncate">{account.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                        isSeverelyOverdue ? 'bg-danger-light text-danger' : 'text-body-light'
                      }`}>
                        {account.oldest} {account.oldest === 1 ? 'Day' : 'Days'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-semibold text-heading tabular-nums whitespace-nowrap" title={money(account.openBalance)}>
                      {compactMoney(account.openBalance)}
                    </td>
                  </tr>
                );
              })}

              {paginatedCustomers.length === 0 && (
                <tr>
                   <td colSpan={4} className="px-6 py-8 text-center text-muted text-xs">
                     No customers found with outstanding balances.
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between border-t border-border-default px-4 py-2.5 text-xs text-muted bg-surface-raised mt-auto">
          <span>
            Showing {totalCustomers > 0 ? (customerPage - 1) * CUSTOMER_PAGE_SIZE + 1 : 0}–{Math.min(customerPage * CUSTOMER_PAGE_SIZE, totalCustomers)} of {totalCustomers}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Back"
              disabled={customerPage <= 1}
              onClick={() => setCustomerPage(p => Math.max(1, p - 1))}
              className="rounded border border-border-default px-2.5 py-1 text-xs font-medium text-body hover:bg-surface-muted transition-colors disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>
            <span className="text-xs">Page {customerPages > 0 ? customerPage : 0} of {customerPages}</span>
            <button
              type="button"
              aria-label="Forward"
              disabled={customerPage >= customerPages}
              onClick={() => setCustomerPage(p => Math.min(customerPages, p + 1))}
              className="rounded border border-border-default px-2.5 py-1 text-xs font-medium text-body hover:bg-surface-muted transition-colors disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* Right: Customer Inspector Column (col-span-4 space-y-4) */}
    <div className="col-span-12 lg:col-span-4 space-y-4">
      {selectedRecord ? (
        <>
          {/* Customer Header Card */}
          <div className="bg-surface-raised border border-border-default rounded-card p-4 shadow-card space-y-3">
            {/* Header: Customer Info & Status */}
            <div className="flex items-center gap-3 min-w-0">
              {selectedRecord.avatar ? (
                <img src={selectedRecord.avatar} alt="Avatar" className="w-12 h-12 rounded-button shadow-card shrink-0" />
              ) : (
                <div className="w-12 h-12 bg-[#3d3121] rounded-button flex items-center justify-center text-xl font-bold text-white shadow-card shrink-0">
                  {selectedRecord.name?.substring(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-base font-bold text-heading leading-tight truncate">{selectedRecord.name}</h2>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] font-bold text-muted uppercase tracking-wider">STATUS:</span>
                  <select
                    aria-label="Collection status"
                    value={selectedRecord.status || 'CURRENT'}
                    onChange={(e) => updateCustomerMutation.mutate({ id: selectedRecord.id, collectionStatus: e.target.value })}
                    disabled={updateCustomerMutation.isPending}
                    className="text-xs font-semibold text-heading bg-surface-raised border border-border-default rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
                  >
                    <option value="CURRENT">CURRENT</option>
                    <option value="AT_RISK">AT RISK</option>
                    <option value="DELINQUENT">DELINQUENT</option>
                  </select>
                  {updateCustomerMutation.isPending && <Loader2 size={12} className="animate-spin text-muted" />}
                </div>
              </div>
            </div>

            {/* Total Outstanding & Oldest Invoice */}
            <div className="pt-2 border-t border-border-subtle flex items-end justify-between">
              <div>
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-0.5">Total Outstanding</p>
                <p className="text-3xl font-extrabold text-heading tracking-tight">{money(selectedRecord.openBalance)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-0.5">Oldest Invoice</p>
                <p className={`text-xs font-bold ${selectedRecord.oldest > 0 ? 'text-danger' : 'text-success'}`}>
                  {selectedRecord.oldest > 0 ? `${selectedRecord.oldest} ${selectedRecord.oldest === 1 ? 'Day' : 'Days'} Overdue` : 'Current'}
                </p>
              </div>
            </div>

            {/* Action Button */}
            <div className="pt-1">
              {selectedRecord.openBalance?.amount === 0 ? (
                <button
                  type="button"
                  disabled
                  className="w-full whitespace-nowrap px-3 py-2 rounded-input text-xs font-semibold bg-surface-muted text-body-light border border-border-default transition-colors disabled:opacity-60 text-center"
                >
                  View History
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!selectedInvoices[0] || paymentMutation.isPending}
                  onClick={() => setPaymentTargetId(selectedInvoices[0].id)}
                  className="w-full whitespace-nowrap px-3 py-2 rounded-input text-xs font-semibold bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50 cursor-pointer text-center shadow-card"
                >
                  Log Payment
                </button>
              )}
            </div>
          </div>

          {/* Outstanding Invoices Card */}
          <div className="bg-surface-raised border border-border-default rounded-card shadow-card overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-surface-raised">
              <h3 className="text-xs font-bold text-heading">Outstanding Invoices</h3>
              <span className="text-[11px] font-semibold text-muted">{selectedInvoicesData?.pagination?.total ?? 0} Items</span>
            </div>
            <div className="divide-y divide-border-subtle">
              {isInvoicesLoading && <div className="p-4 flex justify-center text-muted"><Loader2 size={16} className="animate-spin" /></div>}

              {selectedInvoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between p-3.5 hover:bg-surface-muted transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-surface-muted border border-border-default rounded-input text-muted shrink-0">
                      <FileText size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-heading truncate">{inv.number || 'No Number'}</p>
                      <p className="text-[11px] font-medium text-muted mt-0.5 truncate">
                        {inv.daysPastDue > 0 ? (
                          <span className="text-danger font-semibold">Overdue ({inv.daysPastDue}d)</span>
                        ) : (
                          <span className="text-success font-semibold">Current</span>
                        )}
                        {inv.dueDate && ` • Due ${formatDate(inv.dueDate)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className="text-xs font-bold text-heading tabular-nums" title={money(inv.amount)}>{compactMoney(inv.amount)}</span>
                    <button disabled={paymentMutation.isPending || inv.status === 'PAID'} onClick={() => setPaymentTargetId(inv.id)} className="flex items-center gap-1 border border-border-strong rounded px-2 py-1 text-xs font-semibold text-body hover:bg-surface-muted transition-colors bg-surface-raised disabled:opacity-60 cursor-pointer">
                      Action <ChevronDown size={12} className="text-caption" />
                    </button>
                  </div>
                </div>
              ))}

              {selectedInvoices.length === 0 && (
                <div className="p-4 text-center text-muted text-xs">
                  {isInvoicesLoading ? 'Loading invoices…' : 'No outstanding invoices.'}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border-subtle px-4 py-2 text-xs text-muted">
              <span>Showing {selectedInvoicesData?.pagination?.total ? (invoicePage - 1) * 10 + 1 : 0}–{Math.min(invoicePage * 10, selectedInvoicesData?.pagination?.total ?? 0)} of {selectedInvoicesData?.pagination?.total ?? 0}</span>
              <div className="flex items-center gap-2">
                <button type="button" disabled={invoicePage <= 1} onClick={() => setInvoicePage(current => current - 1)} className="rounded border border-border-default px-2 py-0.5 text-xs font-medium hover:bg-surface-muted transition-colors disabled:opacity-40 cursor-pointer">Previous</button>
                <span>Page {selectedInvoicesData?.pagination?.pages ? invoicePage : 0} of {selectedInvoicesData?.pagination?.pages ?? 0}</span>
                <button type="button" disabled={invoicePage >= (selectedInvoicesData?.pagination?.pages ?? 0)} onClick={() => setInvoicePage(current => current + 1)} className="rounded border border-border-default px-2 py-0.5 text-xs font-medium hover:bg-surface-muted transition-colors disabled:opacity-40 cursor-pointer">Next</button>
              </div>
            </div>
          </div>

          {/* Activity Timeline Card */}
          <div className="bg-surface-raised border border-border-default rounded-card shadow-card overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-border-subtle">
              <h3 className="text-xs font-bold text-heading">Activity</h3>
            </div>

            <div className="p-4">
              {/* Composer */}
              <div className="border border-border-default rounded-button bg-surface focus-within:bg-surface-raised focus-within:border-border-strong transition-colors mb-3">
                <textarea
                  rows={2}
                  placeholder="Add a note or log a call..."
                  value={activityBody}
                  onChange={event => setActivityBody(event.target.value)}
                  className="w-full bg-transparent text-xs p-2.5 outline-none resize-none min-h-[68px] text-body placeholder-muted"
                />
                <div className="flex items-center justify-between px-2.5 py-1.5 border-t border-border-subtle">
                  <div className="flex items-center gap-2 text-caption">
                    <button type="button" disabled title="Attachments are not supported for collection activity notes" aria-label="Attach file (not supported)" className="hover:text-body-light transition-colors disabled:opacity-60 cursor-not-allowed"><Paperclip size={14} /></button>
                    <button type="button" aria-label={activityType === 'Call' ? 'Log a call' : 'Add a note'} onClick={() => setActivityType(current => current === 'Note' ? 'Call' : 'Note')} className={`transition-colors cursor-pointer ${activityType === 'Call' ? 'text-accent' : 'hover:text-body-light'}`}><Phone size={14} /></button>
                  </div>
                  <button disabled={!activityBody.trim() || activityMutation.isPending} onClick={() => activityMutation.mutate()} className="bg-primary text-white text-xs font-semibold px-3 py-1 rounded hover:bg-primary-hover transition-colors disabled:opacity-60 cursor-pointer">
                    {activityMutation.isPending ? 'Posting...' : 'Post'}
                  </button>
                </div>
              </div>
              {activityMutation.isError && <p role="alert" className="mb-3 text-xs text-danger">{activityMutation.error?.message || 'Could not post activity.'}</p>}

              {/* Timeline */}
              <div className="relative pl-3 space-y-4">
                {/* Continuous Line */}
                <div className="absolute left-[17px] top-2 bottom-6 w-px bg-surface-strong"></div>

                {(activitiesData?.items ?? []).map((act, index) => (
                  <div key={act.id} className="relative z-10 flex gap-3">
                    <div className="bg-surface-raised ring-4 ring-white mt-1">
                      {index === 0 ? (
                        <CircleDot size={14} className="text-heading" strokeWidth={2.5} />
                      ) : (
                        <Circle size={14} className="text-accent" strokeWidth={2.5} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-0.5">
                        <p className="text-xs font-bold text-heading truncate">{act.title}</p>
                        <span className="text-[10px] font-semibold text-muted shrink-0 ml-2">
                          {new Date(act.date).toLocaleDateString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[10px] font-medium text-muted mb-1">{act.author}</p>
                      <div className="bg-surface-muted border border-border-subtle rounded-button p-2.5 text-xs text-body leading-relaxed">
                        {act.body}
                      </div>
                    </div>
                  </div>
                ))}

                {(!activitiesData?.items || activitiesData.items.length === 0) && (
                  <div className="text-center text-muted text-xs py-2">
                    No activity recorded.
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-surface-raised rounded-card border border-border-default shadow-card p-6 text-center text-xs text-muted">
          Select a customer to view details.
        </div>
      )}
    </div>

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
      {customerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-panel bg-surface-raised p-6 shadow-modal border border-border-default">
            <div className="flex items-center justify-between pb-3 border-b border-border-default">
              <h2 className="text-base font-semibold text-heading">Manage Customers</h2>
              <button
                type="button"
                onClick={() => { setCustomerModalOpen(false); setEditingCustomerId(null); setCustomerError(''); }}
                className="text-muted hover:text-body transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {customerError && (
              <div className="mt-3 flex items-center gap-2 rounded-input bg-danger-light p-2.5 text-xs text-danger">
                <AlertTriangle size={14} />
                <span>{customerError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = newCustomerName.trim();
                if (trimmed) createCustomerMutation.mutate({ name: trimmed, email: newCustomerEmail.trim() || null });
              }}
              className="mt-4 flex flex-col gap-2"
            >
              <input
                type="text"
                placeholder="New customer name..."
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                className="flex-1 rounded-input border border-border-default px-3 py-2 text-sm bg-surface-muted/50 focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <input
                type="email"
                placeholder="Customer email (optional)"
                value={newCustomerEmail}
                onChange={(e) => setNewCustomerEmail(e.target.value)}
                className="flex-1 rounded-input border border-border-default px-3 py-2 text-sm bg-surface-muted/50 focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="submit"
                disabled={!newCustomerName.trim() || createCustomerMutation.isPending}
                className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-input text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                <Plus size={16} /> Add
              </button>
            </form>

            <div className="mt-4 max-h-64 overflow-y-auto divide-y divide-border-default border border-border-default rounded-input">
              {(customersData?.items ?? []).length === 0 ? (
                <div className="p-4 text-center text-sm text-muted">No customers yet. Add one above.</div>
              ) : (
                (customersData?.items ?? []).map((cust) => (
                  <div key={cust.id} className="flex items-center justify-between p-3 gap-2">
                    {editingCustomerId === cust.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const trimmed = editingCustomerName.trim();
                          if (trimmed) updateCustomerMutation.mutate({ id: cust.id, name: trimmed, email: editingCustomerEmail.trim() || null });
                        }}
                        className="flex flex-1 flex-col items-stretch gap-2"
                      >
                        <input
                          type="text"
                          value={editingCustomerName}
                          onChange={(e) => setEditingCustomerName(e.target.value)}
                          className="flex-1 rounded-input border border-border-default px-2.5 py-1 text-sm bg-surface-muted/50 focus:outline-none focus:ring-2 focus:ring-accent"
                          autoFocus
                        />
                        <input
                          type="email"
                          placeholder="Customer email (optional)"
                          value={editingCustomerEmail}
                          onChange={(e) => setEditingCustomerEmail(e.target.value)}
                          className="flex-1 rounded-input border border-border-default px-2.5 py-1 text-sm bg-surface-muted/50 focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                        <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingCustomerId(null)}
                          className="p-1.5 text-muted hover:bg-surface-muted rounded-input transition-colors"
                          title="Cancel"
                        >
                          <X size={16} />
                        </button>
                        <button
                          type="submit"
                          disabled={!editingCustomerName.trim() || updateCustomerMutation.isPending}
                          className="p-1.5 text-success-text hover:bg-success-light rounded-input transition-colors disabled:opacity-50"
                          title="Save"
                        >
                          <Check size={16} />
                        </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <span className="text-sm font-medium text-body">{cust.name}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCustomerId(cust.id);
                              setEditingCustomerName(cust.name);
                              setEditingCustomerEmail(cust.email ?? '');
                              setCustomerError('');
                            }}
                            className="p-1.5 text-muted hover:text-body hover:bg-surface-muted rounded-input transition-colors"
                            title="Rename"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCustomerError('');
                              setDeletingCustomer(cust);
                            }}
                            className="p-1.5 text-muted hover:text-danger hover:bg-danger-light rounded-input transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => { setCustomerModalOpen(false); setEditingCustomerId(null); setCustomerError(''); }}
                className="px-4 py-2 border border-border-default rounded-input text-sm font-medium text-body hover:bg-surface-muted transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(deletingCustomer)}
        onClose={() => setDeletingCustomer(null)}
        onConfirm={() => deletingCustomer && deleteCustomerMutation.mutate(deletingCustomer.id)}
        title="Delete customer?"
        description={`Are you sure you want to delete "${deletingCustomer?.name}"? Deletion is only allowed if no receivable invoices exist for this customer.`}
        confirmLabel="Delete customer"
        busy={deleteCustomerMutation.isPending}
        danger
      />
    </div>
  );
}
