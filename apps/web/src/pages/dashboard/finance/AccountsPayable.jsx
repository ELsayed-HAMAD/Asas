import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  Calendar,
  MoreVertical,
  FileText,
  ZoomIn,
  ZoomOut,
  Download,
  Loader2,
  Users,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  AlertTriangle
} from 'lucide-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../../../lib/api/finance';
import { projectsApi } from '../../../lib/api/projects';
import { queryKeys } from '../../../lib/queryKeys';
import { formatMoney } from '../../../lib/format';
import { http } from '../../../lib/api/http';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import TopBarActions from '../../../components/TopBarActions';
import FormDialog from '../../../components/common/FormDialog';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { downloadCsv } from '../../../lib/csv';

export default function AccountsPayable() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [billOpen, setBillOpen] = useState(false)
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [editingVendorId, setEditingVendorId] = useState(null);
  const [editingVendorName, setEditingVendorName] = useState('');
  const [vendorError, setVendorError] = useState('');
  const [deletingVendor, setDeletingVendor] = useState(null);
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setBillOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [changeRequestOpen, setChangeRequestOpen] = useState(false)
  const [changeRequestReason, setChangeRequestReason] = useState('')
  const [changeRequestSaved, setChangeRequestSaved] = useState(false)
  const [searchInput, setSearchInput] = useState('')
    // Debounce the search box so each keystroke doesn't fire a list request and collapse the table.
    const search = useDebouncedValue(searchInput)
  const [pdfZoom, setPdfZoom] = useState(100)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false)
  const [dateFilter, setDateFilter] = useState('ALL')
  const [statusGroup, setStatusGroup] = useState('OPEN')
  const [page, setPage] = useState(1)
  useEffect(() => { setSelectedIds(new Set()); setPage(1) }, [search, dateFilter, statusGroup])
  const [projectSearchInput, setProjectSearchInput] = useState('')
  const projectSearch = useDebouncedValue(projectSearchInput)
  const [projectPage, setProjectPage] = useState(1)
  const [selectedProject, setSelectedProject] = useState(null)
  const emptyBillForm = () => ({ vendorId: '', projectId: '', invoiceNumber: '', date: new Date().toISOString().slice(0, 10), dueDate: new Date().toISOString().slice(0, 10), amount: '' })
  const [billForm, setBillForm] = useState(emptyBillForm)
  useEffect(() => { setProjectPage(1) }, [projectSearch])

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.finance.payables.list({ page, limit: 25, search: search || undefined, statusGroup, dateRange: dateFilter === 'ALL' ? 'ALL' : 'CURRENT_MONTH' }),
    queryFn: () => financeApi.listPayables({ page, limit: 25, search: search || undefined, statusGroup, dateRange: dateFilter === 'ALL' ? 'ALL' : 'CURRENT_MONTH' }),
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    const pages = data?.pagination?.pages
    if (pages === undefined) return
    if (pages === 0 && page !== 1) setPage(1)
    else if (pages > 0 && page > pages) setPage(pages)
  }, [data?.pagination?.pages, page])
  useEffect(() => {
    if (data?.items?.length && !data.items.some(item => item.id === selectedId)) setSelectedId(data.items[0].id)
    else if (data?.items?.length === 0) setSelectedId(null)
  }, [data?.items, selectedId])
  const { data: detailData } = useQuery({
    queryKey: [...queryKeys.finance.payables.all(), 'detail', selectedId],
    queryFn: () => financeApi.getPayable(selectedId),
    enabled: Boolean(selectedId),
  })
  const { data: pdfBlob, isLoading: pdfLoading, isError: pdfError } = useQuery({
    queryKey: [...queryKeys.finance.payables.all(), 'pdf', selectedId],
    queryFn: () => http.binary(`/finance/payables/${selectedId}/pdf`),
    enabled: Boolean(selectedId),
  })
  useEffect(() => {
    if (!pdfBlob) {
      setPdfUrl(null)
      return
    }
    const url = URL.createObjectURL(pdfBlob)
    setPdfUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pdfBlob])
  useEffect(() => setChangeRequestSaved(false), [selectedId])

  const { data: vendorsData } = useQuery({
    queryKey: [...queryKeys.finance.all(), 'vendors'],
    queryFn: financeApi.listVendors,
  });
  const { data: projectsData } = useQuery({
    queryKey: queryKeys.projects.portfolio.list({ page: projectPage, limit: 25, search: projectSearch || undefined }),
    queryFn: () => projectsApi.listProjects({ page: projectPage, limit: 25, search: projectSearch || undefined }),
    enabled: billOpen,
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    const pages = projectsData?.pagination?.pages
    if (pages === undefined) return
    if (pages === 0 && projectPage !== 1) setProjectPage(1)
    else if (pages > 0 && projectPage > pages) setProjectPage(pages)
  }, [projectsData?.pagination?.pages, projectPage])
  const projectItems = projectsData?.items ?? []
  const projectOptions = selectedProject && !projectItems.some(project => project.id === selectedProject.id)
    ? [selectedProject, ...projectItems]
    : projectItems
  const vendorAvatar = {};
  (vendorsData?.items ?? []).forEach((v) => {
    if (v.avatarUrl) vendorAvatar[v.id] = v.avatarUrl;
  });
  const getVendorAvatar = (vendorId) => vendorAvatar[vendorId] || null;

  const statusMutation = useMutation({
    mutationFn: (status) => financeApi.updatePayableStatus(selectedId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.finance.payables.all() }),
  });
  const createBill = useMutation({
    mutationFn: () => financeApi.createPayable({ ...billForm, projectId: billForm.projectId || null, invoiceNumber: billForm.invoiceNumber || null, status: 'PENDING' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.finance.payables.all() }); setBillOpen(false); setBillForm(emptyBillForm()); setSelectedProject(null); setProjectSearchInput(''); setProjectPage(1) },
  })
  const requestChanges = useMutation({
    mutationFn: ({ id, reason }) => financeApi.requestPayableChanges(id, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.finance.payables.all() })
      setChangeRequestOpen(false)
      setChangeRequestReason('')
      setChangeRequestSaved(true)
    },
  })
  const batchPayment = useMutation({
    mutationFn: () => financeApi.batchPayApprovedPayables([...selectedIds]),
    onSuccess: () => {
      setSelectedIds(new Set())
      setBatchConfirmOpen(false)
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.payables.all() })
    },
  })
  const createVendorMutation = useMutation({
    mutationFn: (name) => financeApi.createVendor({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.all() });
      setNewVendorName('');
      setVendorError('');
    },
    onError: (err) => setVendorError(err?.message || 'Could not create vendor.'),
  });
  const updateVendorMutation = useMutation({
    mutationFn: ({ id, name }) => financeApi.updateVendor(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.all() });
      setEditingVendorId(null);
      setEditingVendorName('');
      setVendorError('');
    },
    onError: (err) => setVendorError(err?.message || 'Could not update vendor.'),
  });
  const deleteVendorMutation = useMutation({
    mutationFn: (id) => financeApi.deleteVendor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.all() });
      setDeletingVendor(null);
      setVendorError('');
    },
    onError: (err) => setVendorError(err?.message || 'Could not delete vendor.'),
  });
  const toggleInvoiceSelection = (id) => setSelectedIds(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

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
        Failed to load accounts payable.
      </div>
    );
  }

  const items = data.items || [];
  const summary = data.summary || {};

  const selectedRecord = items.find(i => i.id === selectedId);
  const selectedDetail = detailData?.id === selectedId ? detailData : null
  const needsApproval = items.filter(i => i.status === 'PENDING');
  const scheduled = items.filter(i => i.status === 'SCHEDULED' || i.status === 'APPROVED');
  const historyItems = statusGroup === 'HISTORY' ? items : []

  const pastDueTotal = summary.pastDueTotal
  const dueIn7DaysTotal = summary.dueIn7DaysTotal
  const paidThisMonthTotal = summary.paidThisMonthTotal
  const previousPaidTotal = summary.paidThisMonthComparison?.previousTotal
  const paidThisMonthDelta = paidThisMonthTotal == null || previousPaidTotal == null
    ? null
    : paidThisMonthTotal.amount - previousPaidTotal.amount
  const paidThisMonthCaption = paidThisMonthTotal == null
    ? 'Unavailable until journal history covers this month'
    : paidThisMonthDelta == null
    ? 'Prior-period comparison unavailable'
    : `${paidThisMonthDelta > 0 ? '+' : ''}${formatMoney({ amount: paidThisMonthDelta, currency: paidThisMonthTotal.currency })} vs same period last month`

  const selectableItems = scheduled.filter(i => ['APPROVED', 'SCHEDULED'].includes(i.status));
  const allSelected = selectableItems.length > 0 && selectableItems.every(i => selectedIds.has(i.id));
  const handleToggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableItems.map(i => i.id)));
    }
  };

  // Download the real invoice PDF (GET /finance/payables/:id/pdf, streamed binary).
  const handleDownloadPdf = async () => {
    if (!selectedRecord) return;
    const blob = await http.binary(`/finance/payables/${selectedRecord.id}/pdf`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${selectedRecord.invoiceNumber || selectedRecord.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-[1000px]">

      <TopBarActions>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              placeholder="Search invoices..."
              value={searchInput}
              onChange={event => setSearchInput(event.target.value)}
              className="pl-9 pr-4 py-1.5 text-sm border border-border-default rounded-input bg-surface-raised w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
          <select aria-label="Payables view" value={statusGroup} onChange={event => setStatusGroup(event.target.value)} className="border border-border-default text-body px-3 py-1.5 rounded-input text-sm bg-surface-raised">
            <option value="OPEN">Open bills</option>
            <option value="HISTORY">History</option>
          </select>
          <button onClick={() => setDateFilter(current => current === 'ALL' ? 'MONTH' : 'ALL')} className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors">
            <Calendar size={14} className="text-muted" />
            {dateFilter === 'ALL' ? 'All Dates' : 'This Month'}
          </button>
          <button disabled={!selectedIds.size || batchPayment.isPending} onClick={() => setBatchConfirmOpen(true)} className="border border-border-default text-body px-4 py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors disabled:opacity-60">
            Batch Payment {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </button>
          <button
            type="button"
            onClick={() => { setVendorError(''); setVendorModalOpen(true); }}
            className="flex items-center gap-1.5 border border-border-default text-body px-3 py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors"
            title="Manage vendors"
          >
            <Users size={14} className="text-muted" />
            Vendors
          </button>
          <button onClick={() => { setProjectSearchInput(''); setProjectPage(1); setSelectedProject(null); setBillOpen(true) }} className="bg-primary text-white px-4 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">New Bill</button>
          <div className="w-px h-6 bg-surface-strong mx-1"></div>
          <button
            type="button"
            onClick={() => {
              const rows = [
                ['Vendor', 'Invoice Number', 'Date', 'Due Date', 'Amount', 'Currency', 'Status'],
                ...items.map(item => [
                  item.vendor,
                  item.invoiceNumber || '',
                  item.date || '',
                  item.dueDate || '',
                  typeof item.amount === 'object' ? item.amount.amount : item.amount,
                  typeof item.amount === 'object' ? item.amount.currency : 'USD',
                  item.status,
                ]),
              ]
              downloadCsv(rows, 'accounts-payable.csv')
            }}
            title="Export Accounts Payable CSV"
            className="text-muted hover:text-body transition-colors cursor-pointer"
          >
            <MoreVertical size={18} />
          </button>
        </div>
      </TopBarActions>

      {/* ── KPIs Row ── */}
      <div className="px-6 py-5 flex-shrink-0 border-b border-border-default bg-surface-raised">
        <div className="grid grid-cols-4 gap-4">
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Total Outstanding</p>
            <p className="text-3xl font-bold text-heading">{formatMoney(summary.openOutstanding)}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card flex flex-col justify-between">
            <div className="flex justify-between items-start mb-1.5">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Past Due</p>
              {pastDueTotal.amount > 0 && <div className="w-2 h-2 rounded-full bg-red-600"></div>}
            </div>
            <p className="text-3xl font-bold text-heading">{formatMoney(pastDueTotal)}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Due in 7 Days</p>
            <p className="text-3xl font-bold text-heading">{formatMoney(dueIn7DaysTotal)}</p>
          </div>
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card" title="Based on valued AP payment journals in base currency, net of linked reversals.">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Paid This Month</p>
            <p className="text-3xl font-bold text-heading">{formatMoney(paidThisMonthTotal)}</p>
            <p className="mt-1 text-xs text-muted">{paidThisMonthCaption}</p>
          </div>
        </div>
      </div>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: Table Area */}
        <div className="flex-1 overflow-y-auto bg-surface-raised flex flex-col border-r border-border-default">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-raised sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 border-b border-border-default w-12">
                  <input
                    type="checkbox"
                    disabled={selectableItems.length === 0}
                    aria-label="Select all approved invoices"
                    checked={allSelected}
                    onChange={handleToggleAll}
                    onClick={event => event.stopPropagation()}
                    className="accent-blue-600 disabled:opacity-30"
                  />
                </th>
                <th className="px-2 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default">Vendor</th>
                <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default text-left">Due Date</th>
                <th className="px-6 py-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-border-default text-right">Amount</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border-subtle">
              {/* Needs Approval Section */}
              {needsApproval.length > 0 && (
                <tr className="bg-surface-muted/50">
                  <td colSpan="4" className="px-6 py-2 border-b border-border-subtle">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Needs Approval</span>
                      <span className="bg-surface-strong text-body-light text-[10px] font-bold px-1.5 py-0.5 rounded">{needsApproval.length}</span>
                    </div>
                  </td>
                </tr>
              )}
              {needsApproval.map(item => {
                const isSelected = selectedId === item.id;
                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-surface-active/60' : 'bg-surface-raised hover:bg-surface-muted'
                    }`}
                  >
                    <td className="px-6 py-3.5">
                      <input type="checkbox" disabled={!['APPROVED', 'SCHEDULED'].includes(item.status)} aria-label={`Select ${item.vendor} invoice`} checked={selectedIds.has(item.id)} onChange={() => toggleInvoiceSelection(item.id)} onClick={event => event.stopPropagation()} className="accent-blue-600 disabled:opacity-30" />
                    </td>
                    <td className="px-2 py-3.5">
                      <div className="flex items-center gap-3">
                        {item.vendorId && getVendorAvatar(item.vendorId) ? (
                          <img src={getVendorAvatar(item.vendorId)} alt="Avatar" className="w-7 h-7 rounded bg-surface-strong" />
                        ) : (
                          <div className="w-7 h-7 rounded bg-surface-strong flex items-center justify-center text-[10px] font-bold text-body">
                            {item.vendor?.substring(0, 2).toUpperCase() || 'NA'}
                          </div>
                        )}
                        <span className="text-sm font-semibold text-heading">{item.vendor}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-sm text-body-light font-medium">
                      {new Date(item.dueDate || item.date).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })}
                    </td>
                    <td className="px-6 py-3.5 text-right text-sm font-bold text-heading tabular-nums">
                      {formatMoney(item.amount)}
                    </td>
                  </tr>
                )
              })}

              {/* Scheduled Section */}
              {scheduled.length > 0 && (
                <tr className="bg-surface-muted/50">
                  <td colSpan="4" className="px-6 py-2 border-b border-border-subtle border-t border-border-default">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Scheduled</span>
                      <span className="bg-surface-strong text-body-light text-[10px] font-bold px-1.5 py-0.5 rounded">{scheduled.length}</span>
                    </div>
                  </td>
                </tr>
              )}
              {scheduled.map(item => {
                const isSelected = selectedId === item.id;
                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-surface-active/60' : 'bg-surface-raised hover:bg-surface-muted'
                    }`}
                  >
                    <td className="px-6 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleInvoiceSelection(item.id)}
                        className="w-4 h-4 rounded-sm border-border-default text-primary focus:ring-primary cursor-pointer"
                      />
                    </td>
                    <td className="px-2 py-3.5">
                      <div className="flex items-center gap-3">
                        {item.vendorId && getVendorAvatar(item.vendorId) ? (
                          <img src={getVendorAvatar(item.vendorId)} alt="Avatar" className="w-7 h-7 rounded border border-border-default bg-surface-raised" />
                        ) : (
                          <div className="w-7 h-7 rounded border border-border-default bg-surface-raised flex items-center justify-center text-[10px] font-bold text-body">
                            {item.vendor?.substring(0, 2).toUpperCase() || 'NA'}
                          </div>
                        )}
                        <span className="text-sm font-semibold text-heading">{item.vendor}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-sm text-body-light font-medium">
                      {new Date(item.dueDate || item.date).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })}
                    </td>
                    <td className="px-6 py-3.5 text-right text-sm font-bold text-heading tabular-nums">
                      {formatMoney(item.amount)}
                    </td>
                  </tr>
                )
              })}

              {historyItems.length > 0 && <tr className="bg-surface-muted/50"><td colSpan="4" className="px-6 py-2 border-b border-border-subtle border-t border-border-default"><span className="text-[10px] font-bold text-muted uppercase tracking-wider">History ({historyItems.length})</span></td></tr>}
              {historyItems.map(item => (
                <tr key={item.id} onClick={() => setSelectedId(item.id)} className={`cursor-pointer transition-colors ${selectedId === item.id ? 'bg-surface-active/60' : 'bg-surface-raised hover:bg-surface-muted'}`}>
                  <td className="px-6 py-3.5 text-xs font-semibold text-muted">{item.status}</td>
                  <td className="px-2 py-3.5"><span className="text-sm font-semibold text-heading">{item.vendor}</span><span className="ml-2 text-xs text-muted">#{item.invoiceNumber || 'N/A'}</span></td>
                  <td className="px-6 py-3.5 text-sm text-body-light">{new Date(item.dueDate || item.date).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' })}</td>
                  <td className="px-6 py-3.5 text-right text-sm font-bold text-heading tabular-nums">{formatMoney(item.amount)}</td>
                </tr>
              ))}

              {items.length === 0 && (
                 <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-muted text-sm">
                      No invoices found.
                    </td>
                 </tr>
              )}

            </tbody>
          </table>
          <div className="sticky bottom-0 mt-auto flex items-center justify-between border-t border-border-default bg-surface-raised px-4 py-2 text-xs text-muted">
            <span>Showing {data.pagination.total === 0 ? 0 : (page - 1) * data.pagination.limit + 1}–{Math.min(page * data.pagination.limit, data.pagination.total)} of {data.pagination.total}</span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage(current => current - 1)} className="rounded border border-border-default px-2 py-1 disabled:opacity-40">Previous</button>
              <span>Page {data.pagination.pages === 0 ? 0 : page} of {data.pagination.pages}</span>
              <button type="button" disabled={page >= data.pagination.pages} onClick={() => setPage(current => current + 1)} className="rounded border border-border-default px-2 py-1 disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>

        {/* Right: Detail Panel */}
        {selectedRecord && (
          <div className="w-[500px] bg-surface-muted overflow-y-auto p-6 flex-shrink-0 space-y-6">

            {/* Main Action Card */}
            <div className="bg-surface-raised border border-border-default rounded-button p-6 shadow-card">
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-4">
                  {selectedRecord.vendorId && getVendorAvatar(selectedRecord.vendorId) ? (
                    <img src={getVendorAvatar(selectedRecord.vendorId)} alt="Avatar" className="w-12 h-12 bg-surface-strong rounded-button" />
                  ) : (
                    <div className="w-12 h-12 bg-surface-strong rounded-button flex items-center justify-center text-lg font-bold text-body">
                      {selectedRecord.vendor?.substring(0, 2).toUpperCase() || 'NA'}
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg font-bold text-heading leading-tight">{selectedRecord.vendor}</h2>
                    <p className="text-xs text-muted mt-0.5">Invoice #{selectedRecord.invoiceNumber || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 bg-[#ffedd5] text-[#9a3412] px-2.5 py-1 rounded-full text-[11px] font-bold">
                  <div className="w-1.5 h-1.5 bg-[#ea580c] rounded-full"></div>
                  {selectedRecord.status}
                </div>
              </div>

              <div className="mb-6">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Total Amount Due</p>
                <p className="text-4xl font-extrabold text-heading tracking-tight">{formatMoney(selectedRecord.amount)}</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <button disabled={!selectedRecord || statusMutation.isPending || selectedRecord.status !== 'PENDING'} onClick={() => statusMutation.mutate('APPROVED')} className="bg-primary text-white py-2 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60">
                  Approve
                </button>
                <button onClick={() => { setChangeRequestReason(''); requestChanges.reset(); setChangeRequestSaved(false); setChangeRequestOpen(true) }} disabled={!selectedRecord || requestChanges.isPending || !['APPROVED', 'SCHEDULED'].includes(selectedRecord.status)} className="border border-border-default text-body py-2 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors disabled:opacity-60">
                  Request Changes
                </button>
                <button disabled={!selectedRecord || statusMutation.isPending || !['PENDING', 'APPROVED'].includes(selectedRecord.status)} onClick={() => statusMutation.mutate('REJECTED')} className="border border-border-default text-danger py-2 rounded-input text-sm font-medium hover:bg-danger-light transition-colors disabled:opacity-60">
                  Reject
                </button>
              </div>
              {statusMutation.isError && <p role="alert" className="mt-3 text-sm text-danger">{statusMutation.error?.message || 'Could not update the invoice status.'}</p>}
              {changeRequestSaved && <p role="status" className="mt-3 text-xs text-success-text">Change request recorded in the invoice audit history.</p>}
            </div>

            {/* Line Items Card */}
            <div className="bg-surface-raised border border-border-default rounded-button shadow-card flex flex-col">
              <div className="px-5 py-4 border-b border-border-subtle">
                <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider">Line Items</h3>
              </div>
              <div className="p-5 divide-y divide-border-subtle">
                {selectedDetail?.lineItems?.length ? selectedDetail.lineItems.map(line => (
                  <div key={line.id} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm font-semibold text-heading">{line.description}</p>
                      {line.periodOrUsage && <p className="text-[11px] text-muted mt-0.5">{line.periodOrUsage}</p>}
                    </div>
                    <span className="text-sm font-semibold text-heading tabular-nums">{formatMoney(line.amount)}</span>
                  </div>
                )) : (
                  <p className="py-4 text-sm text-muted">{selectedDetail ? 'No line items recorded for this invoice.' : 'Loading invoice details...'}</p>
                )}
              </div>
            </div>

            {/* PDF Preview Card */}
            <div className="bg-surface-raised border border-border-default rounded-button shadow-card flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-surface-active/50 border-b border-border-default">
                <div className="flex items-center gap-2 text-body">
                  <FileText size={16} />
                  <span className="text-xs font-bold">invoice_{selectedRecord.invoiceNumber || 'document'}.pdf</span>
                </div>
                <div className="flex items-center gap-3 text-muted">
                  <button aria-label="Zoom in" disabled={pdfZoom >= 200} onClick={() => setPdfZoom(value => Math.min(200, value + 25))} className="hover:text-heading transition-colors disabled:opacity-40"><ZoomIn size={16} /></button>
                  <span className="text-[10px] tabular-nums">{pdfZoom}%</span>
                  <button aria-label="Zoom out" disabled={pdfZoom <= 50} onClick={() => setPdfZoom(value => Math.max(50, value - 25))} className="hover:text-heading transition-colors disabled:opacity-40"><ZoomOut size={16} /></button>
                  <button onClick={handleDownloadPdf} className="hover:text-heading transition-colors"><Download size={16} /></button>
                </div>
              </div>

              {/* Dark PDF Background Area */}
              <div className="bg-[#4b5563] p-3 flex justify-center items-center rounded-b-lg min-h-[320px]">
                {pdfUrl ? (
                  <iframe title={`Invoice ${selectedRecord.invoiceNumber || selectedRecord.id}`} src={`${pdfUrl}#zoom=${pdfZoom}`} className="w-full h-[320px] bg-surface-raised shadow-card" />
                ) : (
                  <p className="text-sm text-white">{pdfLoading ? 'Loading invoice PDF...' : pdfError ? 'Invoice preview could not be loaded.' : 'Invoice PDF is unavailable.'}</p>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
      <FormDialog open={billOpen} onClose={() => { setBillOpen(false); setSelectedProject(null); createBill.reset() }} title="New bill" subtitle="Add a vendor invoice to accounts payable." busy={createBill.isPending} error={createBill.isError ? createBill.error?.message || 'Could not create the bill.' : undefined} onConfirm={() => createBill.mutate()} confirmLabel="Create bill">
        <div className="space-y-4"><label className="block text-sm font-medium text-body">Vendor<select required value={billForm.vendorId} onChange={event => setBillForm(current => ({ ...current, vendorId: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2"><option value="">Select a vendor</option>{(vendorsData?.items ?? []).map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label><label className="block text-sm font-medium text-body">Project<input type="search" aria-label="Search projects" value={projectSearchInput} onChange={event => setProjectSearchInput(event.target.value)} placeholder="Search projects..." className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /><select aria-label="Project" value={billForm.projectId} onChange={event => { const project = projectOptions.find(item => item.id === event.target.value) ?? null; setSelectedProject(project); setBillForm(current => ({ ...current, projectId: event.target.value })) }} className="mt-1 w-full rounded-input border border-border-default px-3 py-2"><option value="">Unassigned</option>{projectOptions.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select>{projectsData?.pagination?.pages > 1 && <div className="mt-2 flex items-center justify-between text-xs text-muted"><span>{projectsData.pagination.total.toLocaleString()} projects · page {projectPage} of {projectsData.pagination.pages}</span><div className="flex gap-2"><button type="button" aria-label="Previous project page" disabled={projectPage <= 1} onClick={() => setProjectPage(current => Math.max(1, current - 1))} className="rounded border border-border-default px-2 py-1 disabled:opacity-40">Previous</button><button type="button" aria-label="Next project page" disabled={projectPage >= projectsData.pagination.pages} onClick={() => setProjectPage(current => Math.min(projectsData.pagination.pages, current + 1))} className="rounded border border-border-default px-2 py-1 disabled:opacity-40">Next</button></div></div>}</label><label className="block text-sm font-medium text-body">Invoice number<input value={billForm.invoiceNumber} onChange={event => setBillForm(current => ({ ...current, invoiceNumber: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label><label className="block text-sm font-medium text-body">Invoice date<input type="date" required value={billForm.date} onChange={event => setBillForm(current => ({ ...current, date: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label><label className="block text-sm font-medium text-body">Due date<input type="date" required value={billForm.dueDate} onChange={event => setBillForm(current => ({ ...current, dueDate: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label><label className="block text-sm font-medium text-body">Amount<input required type="number" min="0" step="0.01" value={billForm.amount} onChange={event => setBillForm(current => ({ ...current, amount: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label></div>
      </FormDialog>
      <FormDialog
        open={changeRequestOpen}
        onClose={() => { setChangeRequestOpen(false); requestChanges.reset() }}
        title="Request invoice changes"
        subtitle="The invoice returns to Pending and this reason is recorded in the audit history."
        busy={requestChanges.isPending}
        error={requestChanges.isError ? requestChanges.error?.message || 'Could not record the change request.' : undefined}
        onConfirm={() => {
          const reason = changeRequestReason.trim()
          if (selectedRecord && reason) requestChanges.mutate({ id: selectedRecord.id, reason })
        }}
        confirmLabel="Record request"
      >
        <label className="block text-sm font-medium text-body">Reason
          <textarea required maxLength={2000} rows={4} value={changeRequestReason} onChange={event => setChangeRequestReason(event.target.value)} className="mt-1 w-full resize-y rounded-input border border-border-default px-3 py-2" placeholder="Describe the correction needed" />
        </label>
      </FormDialog>
      <ConfirmDialog
        open={batchConfirmOpen}
        onClose={() => { setBatchConfirmOpen(false); batchPayment.reset() }}
        onConfirm={() => batchPayment.mutate()}
        title={`Mark ${selectedIds.size} invoices paid?`}
        description="This records these approved or scheduled invoices as paid in the accounts payable ledger. Confirm that payment has already been made outside this application."
        confirmLabel="Mark as paid"
        busy={batchPayment.isPending}
        error={batchPayment.isError ? batchPayment.error?.message || 'Batch payment failed. No invoices were changed.' : undefined}
      />
      {vendorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-panel bg-surface-raised p-6 shadow-modal border border-border-default">
            <div className="flex items-center justify-between pb-3 border-b border-border-default">
              <h2 className="text-base font-semibold text-heading">Manage Vendors</h2>
              <button
                type="button"
                onClick={() => { setVendorModalOpen(false); setEditingVendorId(null); setVendorError(''); }}
                className="text-muted hover:text-body transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {vendorError && (
              <div className="mt-3 flex items-center gap-2 rounded-input bg-danger-light p-2.5 text-xs text-danger">
                <AlertTriangle size={14} />
                <span>{vendorError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = newVendorName.trim();
                if (trimmed) createVendorMutation.mutate(trimmed);
              }}
              className="mt-4 flex gap-2"
            >
              <input
                type="text"
                placeholder="New vendor name..."
                value={newVendorName}
                onChange={(e) => setNewVendorName(e.target.value)}
                className="flex-1 rounded-input border border-border-default px-3 py-2 text-sm bg-surface-muted/50 focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="submit"
                disabled={!newVendorName.trim() || createVendorMutation.isPending}
                className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-input text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                <Plus size={16} /> Add
              </button>
            </form>

            <div className="mt-4 max-h-64 overflow-y-auto divide-y divide-border-default border border-border-default rounded-input">
              {(vendorsData?.items ?? []).length === 0 ? (
                <div className="p-4 text-center text-sm text-muted">No vendors yet. Add one above.</div>
              ) : (
                (vendorsData?.items ?? []).map((vendor) => (
                  <div key={vendor.id} className="flex items-center justify-between p-3 gap-2">
                    {editingVendorId === vendor.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const trimmed = editingVendorName.trim();
                          if (trimmed) updateVendorMutation.mutate({ id: vendor.id, name: trimmed });
                        }}
                        className="flex flex-1 items-center gap-2"
                      >
                        <input
                          type="text"
                          value={editingVendorName}
                          onChange={(e) => setEditingVendorName(e.target.value)}
                          className="flex-1 rounded-input border border-border-default px-2.5 py-1 text-sm bg-surface-muted/50 focus:outline-none focus:ring-2 focus:ring-accent"
                          autoFocus
                        />
                        <button
                          type="submit"
                          disabled={!editingVendorName.trim() || updateVendorMutation.isPending}
                          className="p-1.5 text-success-text hover:bg-success-light rounded-input transition-colors disabled:opacity-50"
                          title="Save"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingVendorId(null)}
                          className="p-1.5 text-muted hover:bg-surface-muted rounded-input transition-colors"
                          title="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className="text-sm font-medium text-body">{vendor.name}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingVendorId(vendor.id);
                              setEditingVendorName(vendor.name);
                              setVendorError('');
                            }}
                            className="p-1.5 text-muted hover:text-body hover:bg-surface-muted rounded-input transition-colors"
                            title="Rename"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setVendorError('');
                              setDeletingVendor(vendor);
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
                onClick={() => { setVendorModalOpen(false); setEditingVendorId(null); setVendorError(''); }}
                className="px-4 py-2 border border-border-default rounded-input text-sm font-medium text-body hover:bg-surface-muted transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(deletingVendor)}
        onClose={() => setDeletingVendor(null)}
        onConfirm={() => deletingVendor && deleteVendorMutation.mutate(deletingVendor.id)}
        title="Delete vendor?"
        description={`Are you sure you want to delete "${deletingVendor?.name}"? Deletion is only allowed if no payable invoices exist for this vendor.`}
        confirmLabel="Delete vendor"
        busy={deleteVendorMutation.isPending}
        danger
      />
    </div>
  );
}
