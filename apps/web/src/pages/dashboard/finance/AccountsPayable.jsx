import React, { useEffect, useState } from 'react';
import {
  Search,
  Calendar,
  Filter,
  MoreVertical,
  Square,
  FileText,
  ZoomIn,
  ZoomOut,
  Download,
  Loader2
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../../../lib/api/finance';
import { queryKeys } from '../../../lib/queryKeys';
import { formatMoney } from '../../../lib/format';
import { http } from '../../../lib/api/http';
import TopBarActions from '../../../components/TopBarActions';
import FormDialog from '../../../components/common/FormDialog';
import ConfirmDialog from '../../../components/common/ConfirmDialog';

export default function AccountsPayable() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [billOpen, setBillOpen] = useState(false)
  const [changeRequestOpen, setChangeRequestOpen] = useState(false)
  const [changeRequestReason, setChangeRequestReason] = useState('')
  const [changeRequestSaved, setChangeRequestSaved] = useState(false)
  const [search, setSearch] = useState('')
  const [pdfZoom, setPdfZoom] = useState(100)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false)
  const [dateFilter, setDateFilter] = useState('ALL')
  useEffect(() => setSelectedIds(new Set()), [search, dateFilter])
  const emptyBillForm = () => ({ vendorId: '', invoiceNumber: '', date: new Date().toISOString().slice(0, 10), dueDate: new Date().toISOString().slice(0, 10), amount: '' })
  const [billForm, setBillForm] = useState(emptyBillForm)

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.finance.payables.list({ limit: 100, search: search || undefined }),
    queryFn: () => financeApi.listPayables({ limit: 100, search: search || undefined }),
  });
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
    mutationFn: () => financeApi.createPayable({ ...billForm, invoiceNumber: billForm.invoiceNumber || null, status: 'PENDING' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.finance.payables.all() }); setBillOpen(false); setBillForm(emptyBillForm()) },
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

  const allItems = data.items || [];
  const items = dateFilter === 'ALL' ? allItems : allItems.filter(item => {
    const date = new Date(item.date)
    const now = new Date()
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  });
  const summary = data.summary || {};

  // Set initial selected item if not set
  if (!selectedId && items.length > 0) {
    setSelectedId(items[0].id);
  }

  const selectedRecord = items.find(i => i.id === selectedId);
  const selectedDetail = detailData?.id === selectedId ? detailData : null
  const needsApproval = items.filter(i => i.status === 'PENDING');
  const scheduled = items.filter(i => i.status === 'SCHEDULED' || i.status === 'APPROVED');

  const pastDueTotal = summary.pastDueTotal
  const dueIn7DaysTotal = summary.dueIn7DaysTotal
  const paidThisMonthTotal = summary.paidThisMonthTotal

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
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="pl-9 pr-4 py-1.5 text-sm border border-border-default rounded-input bg-surface-raised w-64 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
          <button onClick={() => setDateFilter(current => current === 'ALL' ? 'MONTH' : 'ALL')} className="flex items-center gap-2 border border-border-default text-body px-3 py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors">
            <Calendar size={14} className="text-muted" />
            {dateFilter === 'ALL' ? 'All Dates' : 'This Month'}
          </button>
          <button disabled={!selectedIds.size || batchPayment.isPending} onClick={() => setBatchConfirmOpen(true)} className="border border-border-default text-body px-4 py-1.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors disabled:opacity-60">
            Batch Payment {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </button>
          <button onClick={() => setBillOpen(true)} className="bg-primary text-white px-4 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors">New Bill</button>
          <div className="w-px h-6 bg-surface-strong mx-1"></div>
          <button onClick={() => setDateFilter(current => current === 'ALL' ? 'MONTH' : 'ALL')} aria-label="Toggle date filter" title={`Date filter: ${dateFilter === 'ALL' ? 'all dates' : 'this month'}`} className="text-muted hover:text-body transition-colors"><Filter size={18} /></button>
          <button className="text-muted hover:text-body transition-colors">
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
          <div className="border border-border-default rounded-button p-4 bg-surface-raised shadow-card">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Paid This Month</p>
            <p className="text-3xl font-bold text-heading">{formatMoney(paidThisMonthTotal)}</p>
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
                  <input type="checkbox" disabled={!['APPROVED', 'SCHEDULED'].includes(item.status)} aria-label={`Select ${item.vendor} invoice`} checked={selectedIds.has(item.id)} onChange={() => toggleInvoiceSelection(item.id)} onClick={event => event.stopPropagation()} className="accent-blue-600 disabled:opacity-30" />
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
                    <td className="px-6 py-3.5">
                      <Square size={16} className="text-faint" />
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

              {items.length === 0 && (
                 <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-muted text-sm">
                      No invoices found.
                    </td>
                 </tr>
              )}

            </tbody>
          </table>
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
                <button disabled={!selectedRecord || statusMutation.isPending || selectedRecord.status === 'PAID'} onClick={() => statusMutation.mutate('REJECTED')} className="border border-border-default text-danger py-2 rounded-input text-sm font-medium hover:bg-danger-light transition-colors disabled:opacity-60">
                  Reject
                </button>
              </div>
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
      <FormDialog open={billOpen} onClose={() => setBillOpen(false)} title="New bill" subtitle="Add a vendor invoice to accounts payable." busy={createBill.isPending} onConfirm={() => createBill.mutate()} confirmLabel="Create bill">
        <div className="space-y-4"><label className="block text-sm font-medium text-body">Vendor<select required value={billForm.vendorId} onChange={event => setBillForm(current => ({ ...current, vendorId: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2"><option value="">Select a vendor</option>{(vendorsData?.items ?? []).map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label><label className="block text-sm font-medium text-body">Invoice number<input value={billForm.invoiceNumber} onChange={event => setBillForm(current => ({ ...current, invoiceNumber: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label><label className="block text-sm font-medium text-body">Invoice date<input type="date" required value={billForm.date} onChange={event => setBillForm(current => ({ ...current, date: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label><label className="block text-sm font-medium text-body">Due date<input type="date" required value={billForm.dueDate} onChange={event => setBillForm(current => ({ ...current, dueDate: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label><label className="block text-sm font-medium text-body">Amount<input required type="number" min="0" step="0.01" value={billForm.amount} onChange={event => setBillForm(current => ({ ...current, amount: event.target.value }))} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label></div>
      </FormDialog>
      <FormDialog
        open={changeRequestOpen}
        onClose={() => setChangeRequestOpen(false)}
        title="Request invoice changes"
        subtitle="The invoice returns to Pending and this reason is recorded in the audit history."
        busy={requestChanges.isPending}
        onConfirm={() => {
          const reason = changeRequestReason.trim()
          if (selectedRecord && reason) requestChanges.mutate({ id: selectedRecord.id, reason })
        }}
        confirmLabel="Record request"
      >
        <label className="block text-sm font-medium text-body">Reason
          <textarea required maxLength={2000} rows={4} value={changeRequestReason} onChange={event => setChangeRequestReason(event.target.value)} className="mt-1 w-full resize-y rounded-input border border-border-default px-3 py-2" placeholder="Describe the correction needed" />
        </label>
        {requestChanges.isError && <p role="alert" className="mt-3 text-sm text-danger">{requestChanges.error?.message || 'Could not record the change request.'}</p>}
      </FormDialog>
      <ConfirmDialog
        open={batchConfirmOpen}
        onClose={() => setBatchConfirmOpen(false)}
        onConfirm={() => batchPayment.mutate()}
        title={`Mark ${selectedIds.size} invoices paid?`}
        description="This records these approved or scheduled invoices as paid in the accounts payable ledger. Confirm that payment has already been made outside this application."
        confirmLabel="Mark as paid"
        busy={batchPayment.isPending}
      />
      {batchPayment.isError && <div role="alert" className="fixed bottom-4 right-4 z-50 rounded-button border border-danger/30 bg-surface-raised p-3 text-sm text-danger shadow-card">{batchPayment.error?.message || 'Batch payment failed. No invoices were changed.'}<button onClick={() => batchPayment.reset()} className="ml-3 underline">Dismiss</button></div>}
    </div>
  );
}
