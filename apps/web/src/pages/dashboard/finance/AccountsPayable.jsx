import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
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
  ExternalLink
} from 'lucide-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../../../lib/api/finance';
import { projectsApi } from '../../../lib/api/projects';
import { queryKeys } from '../../../lib/queryKeys';
import { formatMoney, formatCompactTableMoney } from '../../../lib/format';
import { http } from '../../../lib/api/http';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import FormDialog from '../../../components/common/FormDialog';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
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

const metricFontSize = (money) => {
  const label = formatMoney(money)
  return `clamp(0.75rem, ${Math.min(14, 130 / Math.max(1, label.length))}cqw, 1.5rem)`
}

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
  const [pdfUrl, setPdfUrl] = useState(null)
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false)
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false)
  const [dateFilter, setDateFilter] = useState('ALL')
  const [statusGroup, setStatusGroup] = useState('OPEN')
  const [projectSearchInput, setProjectSearchInput] = useState('')
  const projectSearch = useDebouncedValue(projectSearchInput)
  const [projectPage, setProjectPage] = useState(1)
  const [selectedProject, setSelectedProject] = useState(null)
  const emptyBillForm = () => ({ vendorId: '', projectId: '', invoiceNumber: '', date: new Date().toISOString().slice(0, 10), dueDate: new Date().toISOString().slice(0, 10), amount: '' })
  const [billForm, setBillForm] = useState(emptyBillForm)
  useEffect(() => { setProjectPage(1) }, [projectSearch])

  const { data, isLoading, isError } = useQuery({
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
    <div className="flex-1 min-h-0 flex flex-col bg-surface-raised overflow-y-auto min-w-0 px-6 py-5">

      {/* ── Top Toolbar (Single Row across 12-column width) ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 w-full mb-5 flex-shrink-0">
        {/* Left group */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
            <Input
              type="text"
              placeholder="Search invoices..."
              value={searchInput}
              onChange={event => setSearchInput(event.target.value)}
              className="pl-9 pr-4 text-xs bg-surface-raised w-72 max-w-full shadow-card h-9"
            />
          </div>
          <Select value={statusGroup} onValueChange={setStatusGroup}>
            <SelectTrigger aria-label="Payables view" className="text-xs bg-surface-raised hover:bg-surface-muted shadow-card h-9 w-[130px]">
              <SelectValue placeholder="Payables view" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OPEN">Open bills</SelectItem>
              <SelectItem value="HISTORY">History</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDateFilter(current => current === 'ALL' ? 'MONTH' : 'ALL')}
            className="gap-1.5 bg-surface-raised shadow-card font-medium h-9"
          >
            <Calendar size={13} className="text-muted" />
            {dateFilter === 'ALL' ? 'All Dates' : 'This Month'}
          </Button>
        </div>

        {/* Right group */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!scheduled.length || batchPayment.isPending}
            onClick={() => setBatchConfirmOpen(true)}
            className="bg-surface-raised shadow-card font-medium h-9"
          >
            Batch Payment {scheduled.length > 0 ? `(${scheduled.length})` : ''}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { setVendorError(''); setVendorModalOpen(true); }}
            className="gap-1.5 bg-surface-raised shadow-card font-medium h-9"
            title="Manage vendors"
          >
            <Users size={13} className="text-muted" />
            Vendors
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => { setProjectSearchInput(''); setProjectPage(1); setSelectedProject(null); setBillOpen(true) }}
            className="gap-1.5 shadow-card font-semibold h-9"
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
              ]
              downloadCsv(rows, 'accounts-payable.csv')
            }}
            title="Export Accounts Payable CSV"
            className="bg-surface-raised shadow-card h-9 w-9 text-muted hover:text-body"
          >
            <MoreVertical size={14} />
          </Button>
        </div>
      </div>

      {/* ── Top 4 KPI Cards (grid-cols-12 gap-5 mb-5) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-5 mb-5 flex-shrink-0">
        <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-surface-raised rounded-card border border-border-subtle p-4 shadow-card h-auto flex flex-col justify-start" style={{ containerType: 'inline-size' }}>
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none">Total Outstanding</p>
          <p className="min-w-0 text-2xl font-bold text-heading mt-1.5 leading-tight tracking-tight truncate" style={{ fontSize: metricFontSize(summary.openOutstanding) }}>
            {formatMoney(summary.openOutstanding)}
          </p>
          <p className="text-xs text-muted mt-1.5 leading-normal truncate" title={`${items.length} open bills`}>
            {summary.openCount != null ? `${summary.openCount} open bills` : `${items.length} open bills`}
          </p>
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-surface-raised rounded-card border border-border-subtle p-4 shadow-card h-auto flex flex-col justify-start" style={{ containerType: 'inline-size' }}>
          <div className="flex items-center justify-between leading-none">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Past Due</p>
            {pastDueTotal.amount > 0 && <span className="w-2 h-2 rounded-full bg-danger inline-block" />}
          </div>
          <p className="min-w-0 text-2xl font-bold text-heading mt-1.5 leading-tight tracking-tight truncate" style={{ fontSize: metricFontSize(pastDueTotal) }}>
            {formatMoney(pastDueTotal)}
          </p>
          <p className="text-xs text-muted mt-1.5 leading-normal truncate" title={pastDueTotal.amount > 0 ? 'Requires immediate attention' : 'No overdue bills'}>
            {pastDueTotal.amount > 0 ? 'Requires immediate attention' : 'No overdue bills'}
          </p>
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-surface-raised rounded-card border border-border-subtle p-4 shadow-card h-auto flex flex-col justify-start" style={{ containerType: 'inline-size' }}>
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none">Due in 7 Days</p>
          <p className="min-w-0 text-2xl font-bold text-heading mt-1.5 leading-tight tracking-tight truncate" style={{ fontSize: metricFontSize(dueIn7DaysTotal) }}>
            {formatMoney(dueIn7DaysTotal)}
          </p>
          <p className="text-xs text-muted mt-1.5 leading-normal truncate" title="Upcoming payments scheduled">
            Upcoming payments scheduled
          </p>
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-surface-raised rounded-card border border-border-subtle p-4 shadow-card h-auto flex flex-col justify-start" style={{ containerType: 'inline-size' }} title="Based on valued AP payment journals in base currency, net of linked reversals.">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wider leading-none">Paid This Month</p>
          <p className="min-w-0 text-2xl font-bold text-heading mt-1.5 leading-tight tracking-tight truncate" style={{ fontSize: metricFontSize(paidThisMonthTotal) }}>
            {formatMoney(paidThisMonthTotal)}
          </p>
          <p className="text-xs text-muted mt-1.5 leading-normal truncate" title={paidThisMonthCaption}>
            {paidThisMonthCaption}
          </p>
        </div>
      </div>

      {/* ── Main Workspace: Table (col-span-8) & Right Inspector (col-span-4) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (col-span-8): Bills Table Card */}
        <div className="lg:col-span-8 min-w-0 bg-surface-raised rounded-card border border-border-subtle shadow-card flex flex-col overflow-hidden">
          {statusGroup === 'OPEN' ? (
            items.length === 0 ? (
              <div className="px-6 py-12 text-center text-muted text-sm">
                No invoices found.
              </div>
            ) : (
              <>
                {/* Needs Approval Section */}
                {needsApproval.length > 0 && (
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-surface-muted/60 border-b border-border-default shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-heading uppercase tracking-wider">Needs Approval</span>
                        <span className="bg-surface-strong text-body-light text-[10px] font-bold px-1.5 py-0.5 rounded">{needsApproval.length}</span>
                      </div>
                    </div>
                    <div className={`${scheduled.length > 0 ? 'max-h-[250px]' : 'max-h-[500px]'} overflow-y-auto overflow-x-auto`}>
                      <Table className="w-full min-w-[500px] text-left border-collapse">
                        <TableHeader className="bg-surface-muted sticky top-0 z-10 text-[11px] font-bold text-muted uppercase tracking-wider border-b border-border-default shadow-sm">
                          <TableRow className="border-b border-border-default hover:bg-transparent">
                            <TableHead className="px-4 py-2.5 text-left bg-surface-muted">Vendor</TableHead>
                            <TableHead className="px-4 py-2.5 text-left bg-surface-muted whitespace-nowrap">Due Date</TableHead>
                            <TableHead className="px-5 py-2.5 text-right bg-surface-muted whitespace-nowrap">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-border-subtle">
                          {needsApproval.map(item => {
                            const isSelected = selectedId === item.id;
                            return (
                              <TableRow
                                key={item.id}
                                onClick={() => setSelectedId(item.id)}
                                className={`cursor-pointer transition-colors h-12 ${
                                  isSelected ? 'bg-accent-light/50' : 'bg-surface-raised hover:bg-surface-muted/60'
                                }`}
                              >
                                <TableCell className="px-4 py-2.5">
                                  <div className="flex items-center gap-3">
                                    {item.vendorId && getVendorAvatar(item.vendorId) ? (
                                      <img src={getVendorAvatar(item.vendorId)} alt="Avatar" className="w-7 h-7 rounded border border-border-default bg-surface-strong object-cover shrink-0" />
                                    ) : (
                                      <div className="w-7 h-7 rounded border border-border-default bg-surface-strong flex items-center justify-center text-[10px] font-bold text-body shrink-0">
                                        {item.vendor?.substring(0, 2).toUpperCase() || 'NA'}
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <span className="text-sm font-semibold text-heading truncate block">{item.vendor}</span>
                                      {item.invoiceNumber && <span className="text-[11px] text-muted truncate block">#{item.invoiceNumber}</span>}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="px-4 py-2.5 text-sm text-body font-medium whitespace-nowrap">
                                  {new Date(item.dueDate || item.date).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' })}
                                </TableCell>
                                <TableCell className="px-5 py-2.5 text-right text-sm font-bold text-heading tabular-nums whitespace-nowrap" title={formatMoney(item.amount)}>
                                  {formatCompactTableMoney(item.amount)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Scheduled Section */}
                {scheduled.length > 0 && (
                  <div className="flex flex-col min-w-0">
                    <div className={`flex items-center justify-between px-4 py-2.5 bg-surface-muted/60 ${needsApproval.length > 0 ? 'border-t' : ''} border-b border-border-default shrink-0`}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-heading uppercase tracking-wider">Scheduled</span>
                        <span className="bg-surface-strong text-body-light text-[10px] font-bold px-1.5 py-0.5 rounded">{scheduled.length}</span>
                      </div>
                    </div>
                    <div className={`${needsApproval.length > 0 ? 'max-h-[250px]' : 'max-h-[500px]'} overflow-y-auto overflow-x-auto`}>
                      <Table className="w-full min-w-[500px] text-left border-collapse">
                        <TableHeader className="bg-surface-muted sticky top-0 z-10 text-[11px] font-bold text-muted uppercase tracking-wider border-b border-border-default shadow-sm">
                          <TableRow className="border-b border-border-default hover:bg-transparent">
                            <TableHead className="px-4 py-2.5 text-left bg-surface-muted">Vendor</TableHead>
                            <TableHead className="px-4 py-2.5 text-left bg-surface-muted whitespace-nowrap">Due Date</TableHead>
                            <TableHead className="px-5 py-2.5 text-right bg-surface-muted whitespace-nowrap">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-border-subtle">
                          {scheduled.map(item => {
                            const isSelected = selectedId === item.id;
                            return (
                              <TableRow
                                key={item.id}
                                onClick={() => setSelectedId(item.id)}
                                className={`cursor-pointer transition-colors h-12 ${
                                  isSelected ? 'bg-accent-light/50' : 'bg-surface-raised hover:bg-surface-muted/60'
                                }`}
                              >
                                <TableCell className="px-4 py-2.5">
                                  <div className="flex items-center gap-3">
                                    {item.vendorId && getVendorAvatar(item.vendorId) ? (
                                      <img src={getVendorAvatar(item.vendorId)} alt="Avatar" className="w-7 h-7 rounded border border-border-default bg-surface-raised object-cover shrink-0" />
                                    ) : (
                                      <div className="w-7 h-7 rounded border border-border-default bg-surface-raised flex items-center justify-center text-[10px] font-bold text-body shrink-0">
                                        {item.vendor?.substring(0, 2).toUpperCase() || 'NA'}
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <span className="text-sm font-semibold text-heading truncate block">{item.vendor}</span>
                                      {item.invoiceNumber && <span className="text-[11px] text-muted truncate block">#{item.invoiceNumber}</span>}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="px-4 py-2.5 text-sm text-body font-medium whitespace-nowrap">
                                  {new Date(item.dueDate || item.date).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' })}
                                </TableCell>
                                <TableCell className="px-5 py-2.5 text-right text-sm font-bold text-heading tabular-nums whitespace-nowrap" title={formatMoney(item.amount)}>
                                  {formatCompactTableMoney(item.amount)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </>
            )
          ) : (
            /* History Section */
            <div className="flex flex-col min-w-0">
              <div className="flex items-center justify-between px-4 py-2.5 bg-surface-muted/60 border-b border-border-default shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-heading uppercase tracking-wider">History</span>
                  <span className="bg-surface-strong text-body-light text-[10px] font-bold px-1.5 py-0.5 rounded">{historyItems.length}</span>
                </div>
              </div>
              <div className="max-h-[500px] overflow-y-auto overflow-x-auto">
                <Table className="w-full min-w-[500px] text-left border-collapse">
                  <TableHeader className="bg-surface-muted sticky top-0 z-10 text-[11px] font-bold text-muted uppercase tracking-wider border-b border-border-default shadow-sm">
                    <TableRow className="border-b border-border-default hover:bg-transparent">
                      <TableHead className="px-4 py-2.5 text-left bg-surface-muted">Status</TableHead>
                      <TableHead className="px-4 py-2.5 text-left bg-surface-muted">Vendor</TableHead>
                      <TableHead className="px-4 py-2.5 text-left bg-surface-muted whitespace-nowrap">Due Date</TableHead>
                      <TableHead className="px-5 py-2.5 text-right bg-surface-muted whitespace-nowrap">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border-subtle">
                    {historyItems.length > 0 ? (
                      historyItems.map(item => (
                        <TableRow
                          key={item.id}
                          onClick={() => setSelectedId(item.id)}
                          className={`cursor-pointer transition-colors h-12 ${
                            selectedId === item.id ? 'bg-accent-light/50' : 'bg-surface-raised hover:bg-surface-muted/60'
                          }`}
                        >
                          <TableCell className="px-4 py-2.5 text-left">
                            <span className="text-xs font-semibold text-muted">{item.status}</span>
                          </TableCell>
                          <TableCell className="px-4 py-2.5">
                            <div className="min-w-0">
                              <span className="text-sm font-semibold text-heading truncate block">{item.vendor}</span>
                              <span className="text-[11px] text-muted truncate block">#{item.invoiceNumber || 'N/A'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-2.5 text-sm text-body font-medium whitespace-nowrap">
                            {new Date(item.dueDate || item.date).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' })}
                          </TableCell>
                          <TableCell className="px-5 py-2.5 text-right text-sm font-bold text-heading tabular-nums whitespace-nowrap" title={formatMoney(item.amount)}>
                            {formatCompactTableMoney(item.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="px-6 py-12 text-center text-muted text-sm">
                          No historical invoices found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        {/* Right Column (col-span-4): Selected Bill Inspector Card */}
        <div className="lg:col-span-4 min-w-0">
          {selectedRecord ? (
            <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card p-5 space-y-4">
              {/* Header: Vendor Info & Status Badge */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {selectedRecord.vendorId && getVendorAvatar(selectedRecord.vendorId) ? (
                    <img src={getVendorAvatar(selectedRecord.vendorId)} alt="Avatar" className="w-10 h-10 bg-surface-strong rounded-button object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 bg-surface-strong rounded-button flex items-center justify-center text-sm font-bold text-body shrink-0">
                      {selectedRecord.vendor?.substring(0, 2).toUpperCase() || 'NA'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-heading leading-tight truncate">{selectedRecord.vendor}</h2>
                    <p className="text-xs text-muted mt-0.5 truncate">Invoice #{selectedRecord.invoiceNumber || 'N/A'}</p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={`text-xs font-semibold whitespace-nowrap shrink-0 border-0 ${
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

              {/* Total Amount Due */}
              <div className="pt-2 border-t border-border-subtle">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Total Amount Due</p>
                <p className="text-3xl font-extrabold text-heading tracking-tight">{formatMoney(selectedRecord.amount)}</p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  disabled={!selectedRecord || statusMutation.isPending || selectedRecord.status !== 'PENDING'}
                  onClick={() => statusMutation.mutate('APPROVED')}
                  className="flex-1 whitespace-nowrap text-xs font-semibold"
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setChangeRequestReason(''); requestChanges.reset(); setChangeRequestSaved(false); setChangeRequestOpen(true) }}
                  disabled={!selectedRecord || requestChanges.isPending || !['APPROVED', 'SCHEDULED'].includes(selectedRecord.status)}
                  className="shrink-0 whitespace-nowrap text-xs font-medium"
                >
                  Request Changes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!selectedRecord || statusMutation.isPending || !['PENDING', 'APPROVED'].includes(selectedRecord.status)}
                  onClick={() => statusMutation.mutate('REJECTED')}
                  className="flex-1 whitespace-nowrap text-xs font-medium text-danger border-border-default hover:bg-danger-light"
                >
                  Reject
                </Button>
              </div>
              {statusMutation.isError && <p role="alert" className="text-xs text-danger">{statusMutation.error?.message || 'Could not update the invoice status.'}</p>}
              {changeRequestSaved && <p role="status" className="text-xs text-success-text">Change request recorded in the invoice audit history.</p>}

              {/* Line Items Section */}
              <div className="pt-2 border-t border-border-subtle">
                <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Line Items</h3>
                <div className="divide-y divide-border-subtle">
                  {selectedDetail?.lineItems?.length ? selectedDetail.lineItems.map(line => (
                    <div key={line.id} className="flex items-center justify-between py-2 text-xs">
                      <div className="min-w-0 pr-2">
                        <p className="font-semibold text-heading truncate">{line.description}</p>
                        {line.periodOrUsage && <p className="text-[11px] text-muted mt-0.5 truncate">{line.periodOrUsage}</p>}
                      </div>
                      <span className="font-semibold text-heading tabular-nums shrink-0">{formatMoney(line.amount)}</span>
                    </div>
                  )) : (
                    <p className="py-2.5 text-xs text-muted">{selectedDetail ? 'No line items recorded for this invoice.' : 'Loading invoice details...'}</p>
                  )}
                </div>
              </div>

              {/* PDF Preview Section */}
              <div className="pt-2 border-t border-border-subtle">
                <div className="flex items-center justify-between px-3 py-2 bg-surface-muted/60 border border-border-default rounded-t-input">
                  <div className="flex items-center gap-2 text-body min-w-0">
                    <FileText size={14} className="text-muted shrink-0" />
                    <span className="text-xs font-semibold truncate">invoice_{selectedRecord.invoiceNumber || 'document'}.pdf</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setInvoicePreviewOpen(true)}
                      title="Full preview"
                      className="gap-1 h-7 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/15"
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
                      className="h-7 w-7 text-muted hover:text-heading"
                    >
                      <ExternalLink size={14} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={handleDownloadPdf}
                      title="Download PDF"
                      className="h-7 w-7 text-muted hover:text-heading"
                    >
                      <Download size={14} />
                    </Button>
                  </div>
                </div>

                {/* PDF Viewer Container */}
                <div className="bg-[#374151] p-2 flex justify-center items-center rounded-b-input border-x border-b border-border-default h-[350px] overflow-hidden">
                  {pdfUrl ? (
                    <iframe
                      key={`${selectedRecord.id}`}
                      title={`Invoice ${selectedRecord.invoiceNumber || selectedRecord.id}`}
                      src={`${pdfUrl}#toolbar=0&navpanes=0`}
                      className="w-full h-full bg-surface-raised shadow-card border-0 rounded"
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
                          <p className="text-xs text-danger-light">Invoice preview could not be loaded.</p>
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
            <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card p-6 text-center text-sm text-muted">
              Select an invoice to view details.
            </div>
          )}
        </div>
      </div>
      <FormDialog open={billOpen} onClose={() => { setBillOpen(false); setSelectedProject(null); createBill.reset() }} title="New bill" subtitle="Add a vendor invoice to accounts payable." busy={createBill.isPending} error={createBill.isError ? createBill.error?.message || 'Could not create the bill.' : undefined} onConfirm={() => createBill.mutate()} confirmLabel="Create bill">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-body mb-1">Vendor</label>
            <Select
              value={billForm.vendorId}
              onValueChange={val => setBillForm(current => ({ ...current, vendorId: val }))}
            >
              <SelectTrigger className="w-full bg-surface-raised text-xs">
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
          </div>
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
            <div className="flex-1 bg-[#374151] p-4 sm:p-6 overflow-hidden flex items-center justify-center">
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
