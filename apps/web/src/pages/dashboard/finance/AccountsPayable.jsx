import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calendar,
  MoreVertical,
  FileText,
  Download,
  Loader2,
  Users,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Maximize2,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../../../lib/api/finance';
import { projectsApi } from '../../../lib/api/projects';
import { queryKeys } from '../../../lib/queryKeys';
import { formatMoney, formatCompactCurrency, moneyToMajor } from '../../../lib/format';
import { http } from '../../../lib/api/http';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import FormDialog from '../../../components/common/FormDialog';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import SearchInput from '../../../components/common/SearchInput';
import { downloadCsv } from '../../../lib/csv';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/table';
import { Textarea } from '../../../components/ui/textarea';
import { Badge } from '../../../components/ui/badge';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { cn } from '../../../lib/utils';

function getStatusBadgeStyle(status) {
  switch (status) {
    case 'PENDING':
      return 'bg-amber-500/10 text-amber-700 border-amber-500/20';
    case 'APPROVED':
      return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20';
    case 'SCHEDULED':
      return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
    case 'PAID':
      return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20';
    case 'REJECTED':
      return 'bg-rose-500/10 text-rose-700 border-rose-500/20';
    default:
      return 'bg-surface-muted text-muted border-border-default';
  }
}

export default function AccountsPayable() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [billOpen, setBillOpen] = useState(false)
  const [editingBillId, setEditingBillId] = useState(null)
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [editingVendorId, setEditingVendorId] = useState(null);
  const [editingVendorName, setEditingVendorName] = useState('');
  const [vendorError, setVendorError] = useState('');
  const [deletingVendor, setDeletingVendor] = useState(null);
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditingBillId(null);
      setBillForm(emptyBillForm());
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
  const [pdfUrl, setPdfUrl] = useState(null)
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false)
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false)
  const [dateFilter, setDateFilter] = useState('ALL')
  const [statusGroup, setStatusGroup] = useState('OPEN')
  const [queueTab, setQueueTab] = useState('ALL')
  const [projectSearchInput, setProjectSearchInput] = useState('')
  const projectSearch = useDebouncedValue(projectSearchInput)
  const [projectPage, setProjectPage] = useState(1)
  const [selectedProject, setSelectedProject] = useState(null)
  const emptyBillForm = () => ({ vendorId: '', projectId: '', purchaseOrderId: '', invoiceNumber: '', date: new Date().toISOString().slice(0, 10), dueDate: new Date().toISOString().slice(0, 10), amount: '' })
  const [billForm, setBillForm] = useState(emptyBillForm)
  useEffect(() => { setProjectPage(1) }, [projectSearch])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.finance.payables.list({ page: 1, limit: 100, search: search || undefined, statusGroup, dateRange: dateFilter === 'ALL' ? 'ALL' : 'CURRENT_MONTH' }),
    queryFn: () => financeApi.listPayables({ page: 1, limit: 100, search: search || undefined, statusGroup, dateRange: dateFilter === 'ALL' ? 'ALL' : 'CURRENT_MONTH' }),
    placeholderData: keepPreviousData,
  });
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
  useEffect(() => {
    if (!invoicePreviewOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setInvoicePreviewOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [invoicePreviewOpen])

  const { data: vendorsData } = useQuery({
    queryKey: [...queryKeys.finance.all(), 'vendors'],
    queryFn: financeApi.listVendors,
  });
  const { data: matchablePurchaseOrders, isLoading: matchableLoading, isError: matchableError } = useQuery({
    queryKey: [...queryKeys.finance.payables.all(), 'matchable-purchase-orders', billForm.vendorId],
    queryFn: () => financeApi.listPayablePurchaseOrderCandidates(billForm.vendorId),
    enabled: billOpen && Boolean(billForm.vendorId),
  });
  const matchableItems = matchablePurchaseOrders?.items ?? [];
  const selectedMatchCandidate = matchableItems.find(item => item.id === billForm.purchaseOrderId) ?? null;
  const { data: projectsData } = useQuery({
    queryKey: queryKeys.projects.portfolio.list({ page: projectPage, limit: 25, search: projectSearch || undefined }),
    queryFn: () => projectsApi.listProjects({ page: projectPage, limit: 25, search: projectSearch || undefined }),
    enabled: billOpen && !editingBillId,
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

  const resetBillForm = () => {
    setBillOpen(false)
    setEditingBillId(null)
    setBillForm(emptyBillForm())
    setSelectedProject(null)
    setProjectSearchInput('')
    setProjectPage(1)
  }
  const statusMutation = useMutation({
    mutationFn: (status) => financeApi.updatePayableStatus(selectedId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.finance.payables.all() }),
  });
  const createBill = useMutation({
    mutationFn: () => financeApi.createPayable({
      ...billForm,
      projectId: billForm.projectId || null,
      purchaseOrderId: billForm.purchaseOrderId || null,
      invoiceNumber: billForm.invoiceNumber || null,
      status: 'PENDING',
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.finance.payables.all() }); resetBillForm() },
  })
  const updateBill = useMutation({
    mutationFn: () => financeApi.updatePayable(editingBillId, {
      purchaseOrderId: billForm.purchaseOrderId || null,
      invoiceNumber: billForm.invoiceNumber || null,
      date: billForm.date,
      dueDate: billForm.dueDate,
      amount: billForm.amount,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.finance.payables.all() })
      resetBillForm()
    },
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
    mutationFn: (ids) => financeApi.batchPayApprovedPayables(ids),
    onSuccess: () => {
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

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-raised">
        <h1 className="sr-only">Accounts Payable</h1>
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col gap-2 h-full items-center justify-center bg-surface-raised text-center p-6">
        <h1 className="sr-only">Accounts Payable</h1>
        <p className="font-semibold text-sm text-danger">Failed to load accounts payable.</p>
        {error?.message && <p className="text-xs text-muted max-w-md">{error.message}</p>}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="mt-2 text-xs font-medium cursor-pointer"
        >
          Try Again
        </Button>
      </div>
    );
  }

  const items = data.items || [];
  const summary = data.summary || {};

  const selectedRecord = items.find(i => i.id === selectedId);
  const selectedDetail = detailData?.id === selectedId ? detailData : null;
  const canEditBill = Boolean(selectedRecord && ['PENDING', 'REJECTED'].includes(selectedRecord.status));
  const openEditBill = () => {
    if (!selectedRecord || !canEditBill) return
    setEditingBillId(selectedRecord.id)
    setBillForm({
      vendorId: selectedRecord.vendorId,
      projectId: selectedRecord.projectId || '',
      purchaseOrderId: selectedRecord.purchaseOrderId || '',
      invoiceNumber: selectedRecord.invoiceNumber || '',
      date: selectedRecord.date.slice(0, 10),
      dueDate: (selectedRecord.dueDate || selectedRecord.date).slice(0, 10),
      amount: String(moneyToMajor(selectedRecord.amount)),
    })
    setSelectedProject(null)
    setProjectSearchInput('')
    setProjectPage(1)
    updateBill.reset()
    setBillOpen(true)
  }
  const needsApproval = items.filter(i => i.status === 'PENDING');
  const scheduled = items.filter(i => i.status === 'SCHEDULED' || i.status === 'APPROVED');
  const historyItems = statusGroup === 'HISTORY' ? items : [];

  const displayedItems = statusGroup === 'HISTORY'
    ? historyItems
    : queueTab === 'PENDING'
    ? needsApproval
    : queueTab === 'SCHEDULED'
    ? scheduled
    : items;

  const pastDueTotal = summary.pastDueTotal;
  const dueIn7DaysTotal = summary.dueIn7DaysTotal;
  const paidThisMonthTotal = summary.paidThisMonthTotal;
  const previousPaidTotal = summary.paidThisMonthComparison?.previousTotal;
  const paidThisMonthDelta = paidThisMonthTotal == null || previousPaidTotal == null
    ? null
    : paidThisMonthTotal.amount - previousPaidTotal.amount;
  const paidThisMonthCaption = paidThisMonthTotal == null
    ? 'Unavailable until journal history complete'
    : paidThisMonthDelta == null
    ? 'Prior-period comparison unavailable'
    : `${paidThisMonthDelta > 0 ? '+' : ''}${formatMoney({ amount: paidThisMonthDelta, currency: paidThisMonthTotal.currency })} vs same period last month`;

  const attachmentFileName = selectedRecord?.invoiceNumber
    ? `invoice-${selectedRecord.invoiceNumber}.pdf`
    : selectedRecord
    ? `invoice-${selectedRecord.id}.pdf`
    : 'invoice-document.pdf';

  // Download the real invoice PDF (GET /finance/payables/:id/pdf, streamed binary).
  const handleDownloadPdf = async () => {
    if (!selectedRecord) return;
    try {
      const blob = pdfBlob || await http.binary(`/finance/payables/${selectedRecord.id}/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${selectedRecord.invoiceNumber || selectedRecord.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('Could not download invoice PDF:', err);
    }
  };

  const handleOpenInNewTab = async () => {
    if (!selectedRecord) return;
    try {
      const blob = pdfBlob || await http.binary(`/finance/payables/${selectedRecord.id}/pdf`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.error('Could not open invoice PDF:', err);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface overflow-y-auto min-w-0 p-4 sm:p-6 space-y-4">
      <h1 className="sr-only">Accounts Payable</h1>

      {/* ── 1. Unified Single-Row Apple-Glass Command Toolbar ── */}
      <div className="relative z-30 bg-surface-raised/85 backdrop-blur-xl border border-border-default rounded-2xl p-2.5 shadow-xs flex flex-wrap xl:flex-nowrap items-center justify-between gap-2.5 flex-shrink-0">
        {/* Left Cluster */}
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap sm:flex-nowrap">
          <SearchInput
            placeholder="Search invoices..."
            value={searchInput}
            onChange={event => setSearchInput(event.target.value)}
            wrapperClassName="w-full sm:w-64 xl:w-72 shrink-0"
            className="h-9 pl-9 pr-3 text-xs sm:text-sm"
          />
          <Select value={statusGroup} onValueChange={setStatusGroup}>
            <SelectTrigger
              aria-label="Payables view"
              className="inline-flex items-center justify-between gap-2 w-auto h-9 px-3.5 rounded-xl text-xs font-medium shrink-0 bg-surface-muted hover:bg-surface-muted/80 border border-border-default shadow-xs text-body hover:text-heading cursor-pointer"
            >
              <SelectValue placeholder="Payables view" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OPEN" className="text-xs">Open bills</SelectItem>
              <SelectItem value="HISTORY" className="text-xs">History</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDateFilter(current => current === 'ALL' ? 'MONTH' : 'ALL')}
            className="h-9 px-3.5 rounded-xl text-xs font-medium inline-flex items-center gap-2 shrink-0 border border-border-default bg-surface-raised hover:bg-surface-muted shadow-xs cursor-pointer text-body hover:text-heading"
          >
            <Calendar size={13} className="text-muted" />
            <span>{dateFilter === 'ALL' ? 'All Dates' : 'This Month'}</span>
          </Button>
        </div>

        {/* Right Cluster */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!scheduled.length || batchPayment.isPending}
            onClick={() => setBatchConfirmOpen(true)}
            className="h-9 px-3.5 rounded-xl text-xs font-semibold shrink-0 border border-border-default bg-surface-raised hover:bg-surface-muted shadow-xs cursor-pointer text-body hover:text-heading"
          >
            Batch Payment {scheduled.length > 0 ? `(${scheduled.length})` : ''}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { setVendorError(''); setVendorModalOpen(true); }}
            className="h-9 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 border border-border-default bg-surface-raised hover:bg-surface-muted shadow-xs cursor-pointer text-body hover:text-heading"
            title="Manage vendors"
          >
            <Users size={13} className="text-muted" />
            Vendors
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => { setEditingBillId(null); setBillForm(emptyBillForm()); setProjectSearchInput(''); setProjectPage(1); setSelectedProject(null); createBill.reset(); updateBill.reset(); setBillOpen(true); }}
            className="h-9 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm shrink-0 cursor-pointer"
          >
            <Plus size={14} /> New Bill
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
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
              ];
              downloadCsv(rows, 'accounts-payable.csv');
            }}
            title="Export Accounts Payable CSV"
            className="w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0 border border-border-default bg-surface-raised hover:bg-surface-muted shadow-xs cursor-pointer text-muted hover:text-heading"
          >
            <MoreVertical size={14} />
          </Button>
        </div>
      </div>

      {/* ── 2. Row 1: 3-Tier Apple-Glass KPI Cards + Compact Currency + Fix Truncation ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 flex-shrink-0">
        {/* Card 1: Total Outstanding */}
        <div className="bg-gradient-to-b from-surface-raised to-surface-raised/60 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[122px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none">
              Total Outstanding
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 flex items-center justify-center shrink-0">
              <FileText size={16} />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2 my-1">
            <span
              className="text-2xl font-bold text-heading tracking-tight tabular-nums leading-none"
              title={formatMoney(summary.openOutstanding)}
            >
              {formatCompactCurrency(summary.openOutstanding)}
            </span>
            <span className="bg-surface-muted text-muted text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0">
              {summary.openCount != null ? `${summary.openCount} Bills` : `${items.length} Bills`}
            </span>
          </div>
          <div className="pt-1.5 border-t border-border-subtle text-[11px] leading-snug text-muted">
            {summary.openCount != null ? `${summary.openCount} open bills` : `${items.length} open bills`}
          </div>
        </div>

        {/* Card 2: Past Due */}
        <div className="bg-gradient-to-b from-surface-raised to-surface-raised/60 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[122px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none">
              Past Due
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2 my-1">
            <span
              className="text-2xl font-bold text-heading tracking-tight tabular-nums leading-none"
              title={formatMoney(pastDueTotal)}
            >
              {formatCompactCurrency(pastDueTotal)}
            </span>
            {pastDueTotal?.amount > 0 ? (
              <span className="bg-rose-500/10 text-rose-600 border border-rose-500/20 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0">
                Action Needed
              </span>
            ) : (
              <span className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0">
                On Track
              </span>
            )}
          </div>
          <div className="pt-1.5 border-t border-border-subtle text-[11px] leading-snug text-muted">
            {pastDueTotal?.amount > 0 ? 'Requires immediate attention' : 'No overdue bills'}
          </div>
        </div>

        {/* Card 3: Due in 7 Days */}
        <div className="bg-gradient-to-b from-surface-raised to-surface-raised/60 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[122px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none">
              Due in 7 Days
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 flex items-center justify-center shrink-0">
              <Clock size={16} />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2 my-1">
            <span
              className="text-2xl font-bold text-heading tracking-tight tabular-nums leading-none"
              title={formatMoney(dueIn7DaysTotal)}
            >
              {formatCompactCurrency(dueIn7DaysTotal)}
            </span>
            <span className="bg-blue-500/10 text-blue-600 border border-blue-500/20 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0">
              Next 7 Days
            </span>
          </div>
          <div className="pt-1.5 border-t border-border-subtle text-[11px] leading-snug text-muted">
            Upcoming payments scheduled
          </div>
        </div>

        {/* Card 4: Paid This Month */}
        <div
          className="bg-gradient-to-b from-surface-raised to-surface-raised/60 backdrop-blur-xl border border-border-default rounded-2xl p-4 shadow-xs flex flex-col justify-between min-h-[122px]"
          title="Based on valued AP payment journals in base currency, net of linked reversals."
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none">
              Paid This Month
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2 my-1">
            <span
              className="text-2xl font-bold text-heading tracking-tight tabular-nums leading-none"
              title={formatMoney(paidThisMonthTotal)}
            >
              {paidThisMonthTotal == null ? <span className="text-base font-medium text-muted">No payments yet</span> : formatCompactCurrency(paidThisMonthTotal)}
            </span>
            <span className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0">
              MTD
            </span>
          </div>
          <div className="pt-1.5 border-t border-border-subtle text-[11px] leading-snug text-muted" title={paidThisMonthCaption}>
            {paidThisMonthCaption}
          </div>
        </div>
      </div>

      {/* ── 3. Row 2: Master-Detail Workspace Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start flex-1 min-h-0">

        {/* Left Column: Unified Bills Table Card */}
        <div className="col-span-12 lg:col-span-7 xl:col-span-8 min-w-0 flex flex-col gap-3">
          <div className="bg-gradient-to-b from-surface-raised to-surface-raised/80 backdrop-blur-xl border border-border-default rounded-2xl shadow-card overflow-hidden flex flex-col min-h-[560px] h-[560px]">

            {/* Integrated Card Header with Segmented Tab Switcher */}
            <div className="px-4 py-3 border-b border-border-default/60 flex flex-wrap items-center justify-between gap-3 bg-surface-raised">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-heading">
                  {statusGroup === 'HISTORY' ? 'Historical Bills' : 'Payable Bills'}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-surface-muted text-muted border border-border-default/60">
                  {displayedItems.length}
                </span>
              </div>

              {/* Auto-width segmented tab switcher */}
              {statusGroup === 'OPEN' && (
                <div
                  role="tablist"
                  aria-label="Filter payable bills"
                  className="flex items-center p-1 rounded-xl bg-surface-muted border border-border-default/60 shrink-0 gap-1 overflow-x-auto no-scrollbar"
                >
                  {[
                    { key: 'ALL', label: `All (${items.length})` },
                    { key: 'PENDING', label: `Needs Approval (${needsApproval.length})` },
                    { key: 'SCHEDULED', label: `Scheduled (${scheduled.length})` },
                  ].map(tab => {
                    const isActive = queueTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => {
                          setQueueTab(tab.key);
                          const targetItems = tab.key === 'PENDING' ? needsApproval : tab.key === 'SCHEDULED' ? scheduled : items;
                          if (targetItems.length > 0 && !targetItems.some(i => i.id === selectedId)) {
                            setSelectedId(targetItems[0].id);
                          }
                        }}
                        className={cn(
                          'w-auto px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer',
                          isActive
                            ? 'bg-surface-raised text-heading shadow-xs'
                            : 'text-muted hover:text-heading'
                        )}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Scrollable Table Viewport */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto bg-surface-raised">
              <Table className="w-full text-left border-collapse">
                <colgroup>
                  <col className="min-w-[180px]" />
                  <col className="w-[120px]" />
                  <col className="w-[110px]" />
                  <col className="w-[120px]" />
                </colgroup>
                <TableHeader className="bg-surface-muted/60 border-b border-border-default sticky top-0 z-10 h-10">
                  <TableRow className="h-10 hover:bg-transparent border-0">
                    <TableHead className="pl-4 pr-3 py-0 text-left rtl:text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10">Vendor</TableHead>
                    <TableHead className="w-[120px] px-2.5 py-0 text-left rtl:text-right text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10 whitespace-nowrap">Due Date</TableHead>
                    <TableHead className="w-[110px] px-2.5 py-0 text-center text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10">Status</TableHead>
                    <TableHead className="w-[120px] px-2.5 pr-4 py-0 text-right rtl:text-left text-xs font-semibold uppercase tracking-[0.04em] text-muted h-10 whitespace-nowrap">Amount</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody className="divide-y divide-border-subtle">
                  {displayedItems.map(item => {
                    const isSelected = selectedId === item.id;
                    return (
                      <TableRow
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className={cn(
                          'h-[48px] cursor-pointer transition-colors border-0',
                          isSelected
                            ? 'bg-surface-row-selected hover:bg-surface-row-selected-hover'
                            : 'bg-surface-raised hover:bg-surface-muted/60'
                        )}
                      >
                        <TableCell className={cn(
                          'pl-4 pr-3 py-0 align-middle border-b border-border-subtle min-w-0 transition-colors',
                          isSelected ? 'border-l-[3px] border-l-accent' : 'border-l-[3px] border-l-transparent'
                        )}>
                          <div className="flex items-center gap-3">
                            {item.vendorId && getVendorAvatar(item.vendorId) ? (
                              <img src={getVendorAvatar(item.vendorId)} alt="Avatar" className="w-8 h-8 rounded-xl border border-border-default bg-surface-strong object-cover shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded-xl border border-border-default bg-surface-muted flex items-center justify-center text-[11px] font-bold text-heading shrink-0 shadow-xs">
                                {item.vendor?.substring(0, 2).toUpperCase() || 'NA'}
                              </div>
                            )}
                            <div className="min-w-0">
                              <span className="text-xs sm:text-sm font-semibold text-heading truncate block leading-tight">{item.vendor}</span>
                              {item.invoiceNumber && <span className="text-[11px] text-muted truncate block leading-tight mt-0.5">#{item.invoiceNumber}</span>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-2.5 py-0 align-middle border-b border-border-subtle text-xs font-medium text-body whitespace-nowrap">
                          {new Date(item.dueDate || item.date).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' })}
                        </TableCell>
                        <TableCell className="px-2.5 py-0 align-middle border-b border-border-subtle text-center whitespace-nowrap">
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border', getStatusBadgeStyle(item.status))}>
                            {item.status}
                          </span>
                        </TableCell>
                        <TableCell className="px-2.5 pr-4 py-0 align-middle border-b border-border-subtle text-right text-xs sm:text-sm font-bold text-heading tabular-nums whitespace-nowrap" title={formatMoney(item.amount)}>
                          {formatMoney(item.amount)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {displayedItems.length === 0 && (
                    <TableRow className="hover:bg-transparent border-0">
                      <TableCell colSpan={4} className="px-6 py-12 text-center text-muted text-xs">
                        {search || dateFilter !== 'ALL'
                          ? 'No bills match the current search and date range. Clear the filters to see every bill.'
                          : statusGroup === 'HISTORY'
                          ? 'No historical invoices yet. Paid and voided bills will appear here.'
                          : queueTab === 'PENDING'
                          ? 'No bills need approval. Pending bills will appear here for review.'
                          : queueTab === 'SCHEDULED'
                          ? 'No scheduled bills yet. Approved bills appear here for payment.'
                          : 'No open bills yet. Use New Bill to add the first vendor invoice.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Table Card Footer */}
            <div className="h-9 flex-shrink-0 border-t border-border-subtle px-4 flex items-center justify-between text-xs text-muted bg-surface-muted/30">
              <span>Showing {displayedItems.length} of {items.length} bills</span>
              {statusGroup === 'OPEN' && queueTab !== 'ALL' && (
                <span className="text-[11px] font-medium text-accent">
                  Filtered by: {queueTab === 'PENDING' ? 'Needs Approval' : 'Scheduled'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Sticky, Calm Apple-Glass Invoice Inspector */}
        <div className="col-span-12 lg:col-span-5 xl:col-span-4 min-w-0 lg:sticky lg:top-6">
          {selectedRecord ? (
            <div className="bg-gradient-to-b from-surface-raised to-surface-raised/80 backdrop-blur-xl border border-border-default rounded-2xl shadow-card p-5 space-y-4 flex flex-col overflow-hidden">
              {/* 1. Vendor & Invoice Header */}
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-border-subtle">
                <div className="flex items-center gap-3 min-w-0">
                  {selectedRecord.vendorId && getVendorAvatar(selectedRecord.vendorId) ? (
                    <img src={getVendorAvatar(selectedRecord.vendorId)} alt="Avatar" className="w-10 h-10 rounded-xl border border-border-default bg-surface-strong object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-surface-muted border border-border-default flex items-center justify-center text-xs font-bold text-heading shrink-0 shadow-xs">
                      {selectedRecord.vendor?.substring(0, 2).toUpperCase() || 'NA'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-heading leading-tight truncate" title={selectedRecord.vendor}>{selectedRecord.vendor}</h2>
                    <p className="text-xs text-muted mt-0.5 truncate leading-tight">{selectedRecord.invoiceNumber ? `Invoice #${selectedRecord.invoiceNumber}` : 'No invoice number'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {canEditBill && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Edit bill"
                      title="Edit bill"
                      onClick={openEditBill}
                      className="w-7.5 h-7.5 rounded-lg text-muted hover:text-heading hover:bg-surface-muted cursor-pointer"
                    >
                      <Pencil size={13} />
                    </Button>
                  )}
                  <span className={cn('px-2.5 py-0.5 rounded-full text-[11px] font-medium shrink-0 border', getStatusBadgeStyle(selectedRecord.status))}>
                    {selectedRecord.status}
                  </span>
                </div>
              </div>

              {/* 2. Recessed TOTAL AMOUNT DUE & Calm Action Row */}
              <div className="pt-2 border-t border-border-subtle">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Total Amount Due</p>
                <p className="text-2xl font-bold text-heading tracking-tight tabular-nums">{formatMoney(selectedRecord.amount)}</p>
              </div>

              {selectedRecord.purchaseOrderId && (
                <div className="rounded-xl border border-border-subtle bg-surface-muted/25 p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Purchase order match</p>
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] font-semibold border',
                      selectedDetail?.purchaseOrderMatch?.status === 'ACTIVE'
                        ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                        : selectedDetail?.purchaseOrderMatch?.status === 'REVERSED'
                        ? 'bg-surface-muted text-muted border-border-default'
                        : 'bg-amber-500/10 text-amber-700 border-amber-500/20',
                    )}>
                      {selectedDetail?.purchaseOrderMatch?.status === 'ACTIVE'
                        ? 'GRNI cleared'
                        : selectedDetail?.purchaseOrderMatch?.status === 'REVERSED'
                        ? 'Reversed'
                        : 'Pending approval'}
                    </span>
                  </div>
                  {selectedDetail?.purchaseOrderMatch ? (
                    <>
                      <p className="text-xs font-semibold text-heading truncate">
                        {selectedDetail.purchaseOrderMatch.productName} · {selectedDetail.purchaseOrderMatch.sku}
                      </p>
                      <p className="text-[11px] text-muted">
                        {selectedDetail.purchaseOrderMatch.quantity} units · exact receipt {formatMoney(selectedDetail.purchaseOrderMatch.receivedValue)}
                      </p>
                      {selectedDetail.purchaseOrderMatch.status === 'REVERSED' && (
                        <p className="text-[11px] text-muted">
                          The original receipt and match history are retained; the GRNI balance was restored by the reversal.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-[11px] text-muted">
                      Linked to a received purchase order. Approval clears the exact GRNI balance posted by that receipt.
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  disabled={!selectedRecord || statusMutation.isPending || selectedRecord.status !== 'PENDING'}
                  onClick={() => statusMutation.mutate('APPROVED')}
                  className="h-8.5 px-4 rounded-xl text-xs font-semibold cursor-pointer shadow-xs whitespace-nowrap"
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setChangeRequestReason(''); requestChanges.reset(); setChangeRequestSaved(false); setChangeRequestOpen(true); }}
                  disabled={!selectedRecord || requestChanges.isPending || !['APPROVED', 'SCHEDULED'].includes(selectedRecord.status)}
                  className="h-8.5 px-3 rounded-xl border border-border-default text-xs font-medium flex-1 cursor-pointer hover:bg-surface-muted whitespace-nowrap"
                >
                  Request Changes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!selectedRecord || statusMutation.isPending || !['PENDING', 'APPROVED'].includes(selectedRecord.status)}
                  onClick={() => statusMutation.mutate('REJECTED')}
                  className="h-8.5 px-3 rounded-xl border border-border-default text-xs font-medium text-danger hover:bg-danger-light hover:text-danger-hover hover:border-danger/30 cursor-pointer whitespace-nowrap"
                >
                  Reject
                </Button>
              </div>
              {statusMutation.isError && <p role="alert" className="text-xs text-danger">{statusMutation.error?.message || 'Could not update the invoice status.'}</p>}
              {changeRequestSaved && <p role="status" className="text-xs text-success-text">Change request recorded in the invoice audit history.</p>}

              {/* 3. Recessed LINE ITEMS Empty Well */}
              <div className="pt-2 border-t border-border-subtle">
                <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Line Items</h3>
                {selectedDetail?.lineItems?.length ? (
                  <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface-muted/20 px-3 py-1">
                    {selectedDetail.lineItems.map(line => (
                      <div key={line.id} className="flex items-center justify-between py-2 text-xs">
                        <div className="min-w-0 pr-2">
                          <p className="font-semibold text-heading truncate">{line.description}</p>
                          {line.periodOrUsage && <p className="text-[11px] text-muted mt-0.5 truncate">{line.periodOrUsage}</p>}
                        </div>
                        <span className="font-semibold text-heading tabular-nums shrink-0">{formatMoney(line.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border-default bg-surface-muted/30 p-4 text-center text-xs text-muted">
                    {selectedDetail ? 'No line items recorded for this invoice.' : 'Loading invoice details...'}
                  </div>
                )}
              </div>

              {/* 4. Unclipped Invoice Attachment Bar + PDF Viewer */}
              <div className="pt-2 border-t border-border-subtle space-y-2">
                <div className="rounded-xl p-2.5 sm:p-3 border border-border-default bg-surface-muted/40 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-heading min-w-0 flex-1">
                    <FileText size={15} className="text-muted shrink-0" />
                    <span className="text-xs font-semibold text-heading truncate" title={attachmentFileName}>
                      {attachmentFileName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setInvoicePreviewOpen(true)}
                      title="Full preview"
                      className="h-7.5 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 shrink-0 text-primary bg-primary/10 hover:bg-primary/15 cursor-pointer"
                    >
                      <Maximize2 size={13} />
                      <span>Full preview</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={handleOpenInNewTab}
                      title="Open in new window"
                      className="w-7.5 h-7.5 rounded-lg inline-flex items-center justify-center shrink-0 text-muted hover:text-heading cursor-pointer"
                    >
                      <ExternalLink size={14} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={handleDownloadPdf}
                      title="Download PDF"
                      className="w-7.5 h-7.5 rounded-lg inline-flex items-center justify-center shrink-0 text-muted hover:text-heading cursor-pointer"
                    >
                      <Download size={14} />
                    </Button>
                  </div>
                </div>

                {/* PDF Viewer Container */}
                <div className="bg-surface-inverse p-2 flex justify-center items-center rounded-xl border border-border-default h-[320px] overflow-hidden">
                  {pdfUrl ? (
                    <iframe
                      key={`${selectedRecord.id}`}
                      title={`Invoice ${selectedRecord.invoiceNumber || selectedRecord.id}`}
                      src={`${pdfUrl}#toolbar=0&navpanes=0`}
                      className="w-full h-full bg-white shadow-sm border-0 rounded-lg"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center p-4">
                      {pdfLoading ? (
                        <div className="flex items-center gap-2 text-white/80 text-xs">
                          <Loader2 size={16} className="animate-spin text-white/60" />
                          Loading invoice document...
                        </div>
                      ) : pdfError ? (
                        <div className="space-y-2">
                          <p className="text-xs text-rose-300">Invoice preview could not be loaded.</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setInvoicePreviewOpen(true)}
                            className="h-7 px-2.5 bg-surface-raised text-heading text-xs"
                          >
                            View details
                          </Button>
                        </div>
                      ) : (
                        <p className="text-xs text-white/70">Invoice preview unavailable.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-gradient-to-b from-surface-raised to-surface-raised/80 backdrop-blur-xl border border-border-default rounded-2xl shadow-card p-6 text-center text-sm text-muted">
              Select an invoice to view details.
            </div>
          )}
        </div>
      </div>
      <FormDialog
        open={billOpen}
        onClose={() => { resetBillForm(); createBill.reset(); updateBill.reset() }}
        title={editingBillId ? 'Edit bill' : 'New bill'}
        subtitle={editingBillId ? 'Correct this bill and its exact purchase-order link. Vendor and project assignment stay unchanged.' : 'Add a vendor invoice to accounts payable.'}
        busy={editingBillId ? updateBill.isPending : createBill.isPending}
        error={editingBillId
          ? updateBill.isError ? updateBill.error?.message || 'Could not update the bill.' : undefined
          : createBill.isError ? createBill.error?.message || 'Could not create the bill.' : undefined}
        onConfirm={() => (editingBillId ? updateBill.mutate() : createBill.mutate())}
        confirmLabel={editingBillId ? 'Save changes' : 'Create bill'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-body mb-1">Vendor</label>
            <Select
              value={billForm.vendorId}
              onValueChange={val => setBillForm(current => ({
                ...current,
                vendorId: val,
                purchaseOrderId: '',
                ...(current.purchaseOrderId && { amount: '' }),
              }))}
              disabled={Boolean(editingBillId)}
            >
              <SelectTrigger aria-label="Vendor" className="w-full bg-surface-raised text-xs">
                <SelectValue placeholder="Select a vendor" />
              </SelectTrigger>
              <SelectContent>
                {(vendorsData?.items ?? []).map(vendor => (
                  <SelectItem key={vendor.id} value={vendor.id} className="text-xs">
                    {vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {editingBillId && <p className="mt-1 text-[11px] text-muted">The vendor cannot be changed. Reject this bill and create a new one if the vendor is wrong.</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-1">Received purchase order <span className="font-normal text-muted">(optional)</span></label>
            <Select
              value={billForm.purchaseOrderId || '__none__'}
              onValueChange={val => {
                const nextId = val === '__none__' ? '' : val
                const candidate = matchableItems.find(item => item.id === nextId)
                setBillForm(current => ({
                  ...current,
                  purchaseOrderId: nextId,
                  ...(candidate && { amount: candidate.receivedValue }),
                }))
              }}
              disabled={!billForm.vendorId || matchableLoading || !matchablePurchaseOrders}
            >
              <SelectTrigger aria-label="Match received purchase order" className="w-full bg-surface-raised text-xs">
                <SelectValue placeholder={billForm.vendorId ? 'No purchase order match' : 'Select a vendor first'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs">No purchase order match</SelectItem>
                {matchableItems.map(candidate => (
                  <SelectItem key={candidate.id} value={candidate.id} className="text-xs">
                    {candidate.productName} · {candidate.sku} · {candidate.quantity} units · {formatMoney(candidate.receivedValueMoney)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {billForm.vendorId && (matchableLoading || (!matchablePurchaseOrders && !matchableError)) && <p className="mt-1 text-[11px] text-muted">Checking received purchase orders…</p>}
            {matchableError && <p role="alert" className="mt-1 text-[11px] text-danger">Could not load matchable purchase orders.</p>}
            {!matchableLoading && matchablePurchaseOrders && billForm.vendorId && matchableItems.length === 0 && !matchableError && (
              <p className="mt-1 text-[11px] text-muted">No exact, fully valued purchase-order receipt is available for this vendor.</p>
            )}
            {selectedMatchCandidate && (
              <p className="mt-1 text-[11px] text-success-text">
                Exact receipt value {formatMoney(selectedMatchCandidate.receivedValueMoney)}. The bill amount must match it; partial and price-variance matching are not supported.
              </p>
            )}
          </div>
          {!editingBillId && (
          <div>
            <label className="block text-sm font-medium text-body mb-1">Project</label>
            <Input type="search" aria-label="Search projects" value={projectSearchInput} onChange={event => setProjectSearchInput(event.target.value)} placeholder="Search projects..." className="text-xs mb-1" />
            <Select
              value={billForm.projectId || '__unassigned__'}
              onValueChange={val => {
                const nextId = val === '__unassigned__' ? '' : val
                const project = projectOptions.find(item => item.id === nextId) ?? null
                setSelectedProject(project)
                setBillForm(current => ({ ...current, projectId: nextId }))
              }}
            >
              <SelectTrigger aria-label="Project" className="w-full bg-surface-raised text-xs">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__" className="text-xs">Unassigned</SelectItem>
                {projectOptions.map(project => (
                  <SelectItem key={project.id} value={project.id} className="text-xs">
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {projectsData?.pagination?.pages > 1 && (
              <div className="mt-2 flex items-center justify-between text-xs text-muted">
                <span>{projectsData.pagination.total.toLocaleString()} projects · page {projectPage} of {projectsData.pagination.pages}</span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" aria-label="Previous project page" disabled={projectPage <= 1} onClick={() => setProjectPage(current => Math.max(1, current - 1))} className="h-7 px-2 text-xs">Previous</Button>
                  <Button type="button" variant="outline" size="sm" aria-label="Next project page" disabled={projectPage >= projectsData.pagination.pages} onClick={() => setProjectPage(current => Math.min(projectsData.pagination.pages, current + 1))} className="h-7 px-2 text-xs">Next</Button>
                </div>
              </div>
            )}
          </div>
          )}
          <label className="block text-sm font-medium text-body">Invoice number
            <Input value={billForm.invoiceNumber} onChange={event => setBillForm(current => ({ ...current, invoiceNumber: event.target.value }))} className="mt-1 text-xs" />
          </label>
          <label className="block text-sm font-medium text-body">Invoice date
            <Input type="date" required value={billForm.date} onChange={event => setBillForm(current => ({ ...current, date: event.target.value }))} className="mt-1 text-xs" />
          </label>
          <label className="block text-sm font-medium text-body">Due date
            <Input type="date" required value={billForm.dueDate} onChange={event => setBillForm(current => ({ ...current, dueDate: event.target.value }))} className="mt-1 text-xs" />
          </label>
          <label className="block text-sm font-medium text-body">Amount
            <Input required type="number" min="0" step="0.01" value={billForm.amount} onChange={event => setBillForm(current => ({ ...current, amount: event.target.value }))} className="mt-1 text-xs" />
          </label>
        </div>
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
          <Textarea required maxLength={2000} rows={4} value={changeRequestReason} onChange={event => setChangeRequestReason(event.target.value)} className="mt-1 resize-y" placeholder="Describe the correction needed" />
        </label>
      </FormDialog>
      <ConfirmDialog
        open={batchConfirmOpen}
        onClose={() => { setBatchConfirmOpen(false); batchPayment.reset() }}
        onConfirm={() => batchPayment.mutate(scheduled.map(i => i.id))}
        title={`Mark ${scheduled.length} scheduled invoices paid?`}
        description="This records all approved and scheduled invoices as paid in the accounts payable ledger. Confirm that payment has already been made outside this application."
        confirmLabel="Mark as paid"
        busy={batchPayment.isPending}
        error={batchPayment.isError ? batchPayment.error?.message || 'Batch payment failed. No invoices were changed.' : undefined}
      />
      {/* ── Full Invoice Preview Modal ── */}
      {invoicePreviewOpen && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in duration-150">
          <div className="bg-surface-raised border border-border-default rounded-panel shadow-modal w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-default bg-surface-muted/60 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-surface-raised rounded-button border border-border-default text-primary shrink-0">
                  <FileText size={18} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-heading truncate">
                      Invoice #{selectedRecord.invoiceNumber || selectedRecord.id}
                    </h2>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-semibold whitespace-nowrap border-0 ${
                        selectedRecord.status === 'PAID'
                          ? 'bg-success-light text-success-text'
                          : selectedRecord.status === 'REJECTED'
                          ? 'bg-danger-light text-danger'
                          : 'bg-warning-light text-warning'
                      }`}
                    >
                      {selectedRecord.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted truncate mt-0.5">
                    {selectedRecord.vendor} · Total: {formatMoney(selectedRecord.amount)} · Due {new Date(selectedRecord.dueDate || selectedRecord.date).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleOpenInNewTab}
                  title="Open in new window"
                  className="gap-1.5 h-8 text-xs font-medium"
                >
                  <ExternalLink size={13} />
                  <span className="hidden sm:inline">Open in new tab</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPdf}
                  title="Download PDF"
                  className="gap-1.5 h-8 text-xs font-medium"
                >
                  <Download size={13} />
                  <span className="hidden sm:inline">Download</span>
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setInvoicePreviewOpen(false)}
                  title="Close preview"
                  className="h-8 w-8 text-muted hover:text-body"
                >
                  <X size={18} />
                </Button>
              </div>
            </div>

            {/* Modal Body: Large Document Viewer */}
            <div className="flex-1 bg-inverse-gray p-4 sm:p-6 overflow-hidden flex items-center justify-center">
              {pdfUrl ? (
                <div className="w-full max-w-[850px] h-full shadow-2xl rounded overflow-hidden">
                  <iframe
                    title={`Invoice ${selectedRecord.invoiceNumber || selectedRecord.id} Preview`}
                    src={`${pdfUrl}#toolbar=0&navpanes=0`}
                    className="w-full h-full bg-white rounded border-0"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-surface-raised rounded-panel border border-border-default max-w-md my-auto">
                  <FileText size={40} className="text-muted mb-3" />
                  <h3 className="text-sm font-bold text-heading">Invoice Document</h3>
                  <p className="text-xs text-muted mt-1.5">
                    {pdfLoading ? 'Loading invoice PDF...' : pdfError ? 'Invoice preview could not be loaded.' : 'Invoice PDF is unavailable.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {vendorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-panel bg-surface-raised p-6 shadow-modal border border-border-default">
            <div className="flex items-center justify-between pb-3 border-b border-border-default">
              <h2 className="text-base font-semibold text-heading">Manage Vendors</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => { setVendorModalOpen(false); setEditingVendorId(null); setVendorError(''); }}
                className="h-8 w-8 text-muted hover:text-body"
                title="Close"
              >
                <X size={18} />
              </Button>
            </div>

            {vendorError && (
              <Alert variant="destructive" className="mt-3 py-2.5 px-3">
                <AlertDescription className="text-xs">{vendorError}</AlertDescription>
              </Alert>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = newVendorName.trim();
                if (trimmed) createVendorMutation.mutate(trimmed);
              }}
              className="mt-4 flex gap-2"
            >
              <Input
                type="text"
                placeholder="New vendor name..."
                value={newVendorName}
                onChange={(e) => setNewVendorName(e.target.value)}
                className="flex-1 text-sm bg-surface-muted/50"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!newVendorName.trim() || createVendorMutation.isPending}
                className="gap-1.5"
              >
                <Plus size={16} /> Add
              </Button>
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
                        <Input
                          type="text"
                          value={editingVendorName}
                          onChange={(e) => setEditingVendorName(e.target.value)}
                          className="flex-1 text-sm bg-surface-muted/50 h-8"
                          autoFocus
                        />
                        <Button
                          type="submit"
                          size="icon"
                          variant="ghost"
                          disabled={!editingVendorName.trim() || updateVendorMutation.isPending}
                          className="h-7 w-7 text-success-text hover:bg-success-light"
                          title="Save"
                        >
                          <Check size={16} />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditingVendorId(null)}
                          className="h-7 w-7 text-muted hover:bg-surface-muted"
                          title="Cancel"
                        >
                          <X size={16} />
                        </Button>
                      </form>
                    ) : (
                      <>
                        <span className="text-sm font-medium text-body">{vendor.name}</span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditingVendorId(vendor.id);
                              setEditingVendorName(vendor.name);
                              setVendorError('');
                            }}
                            className="h-7 w-7 text-muted hover:text-body"
                            title="Rename"
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setVendorError('');
                              setDeletingVendor(vendor);
                            }}
                            className="h-7 w-7 text-muted hover:text-danger hover:bg-danger-light"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setVendorModalOpen(false); setEditingVendorId(null); setVendorError(''); }}
              >
                Close
              </Button>
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
