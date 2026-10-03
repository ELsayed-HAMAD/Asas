import type { PayableInvoice, PayableListQuery, PayableStatus, PayableWriteInput } from '@asas/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Download, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DataTable } from '@/components/ui/data-table'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Toaster, toast } from '@/components/ui/toast'
import { ApiError, http } from '@/lib/api/http.js'
import { financeApi } from '@/lib/api/finance.js'
import { formatDate, formatMoney } from '@/lib/format.js'
import { downloadBlob } from '@/lib/utils'
import { queryKeys } from '@/lib/queryKeys.js'
import { useMyRole } from '@/lib/useMyRole.js'

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

const STATUS_VARIANTS: Record<PayableStatus, 'warning' | 'secondary' | 'info' | 'success' | 'danger'> = {
  PENDING: 'warning',
  SCHEDULED: 'secondary',
  APPROVED: 'info',
  PAID: 'success',
  REJECTED: 'danger',
}

const STATUS_LABELS: Record<PayableStatus, string> = {
  PENDING: 'Pending',
  SCHEDULED: 'Scheduled',
  APPROVED: 'Approved',
  PAID: 'Paid',
  REJECTED: 'Rejected',
}

const ALL_STATUSES: PayableStatus[] = ['PENDING', 'SCHEDULED', 'APPROVED', 'PAID', 'REJECTED']

const EMPTY_FORM: PayableWriteInput = {
  vendorId: '',
  invoiceNumber: null,
  date: new Date().toISOString().slice(0, 10),
  amount: '',
  status: 'PENDING',
}

/**
 * Accounts payable management — `GET /finance/payables` with server-side summary KPIs,
 * create/status transitions, and invoice PDF download. Mirrors the EmployeeListPage pattern:
 * every figure in the KPI row comes from `data.summary` (SQL aggregate), never a client-side
 * `.reduce()`.
 */
export function AccountsPayablePage() {
  const role = useMyRole()
  const canWrite = role === 'ADMIN' || role === 'OWNER'
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<PayableStatus | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<PayableWriteInput>(EMPTY_FORM)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const query: Partial<PayableListQuery> = useMemo(() => ({
    page,
    limit: 25,
    ...(statusFilter !== 'ALL' && { status: statusFilter }),
    ...(search && { search }),
  }), [page, statusFilter, search])

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.finance.payables.list(query),
    queryFn: () => financeApi.listPayables(query),
  })

  const { data: vendorsData } = useQuery({
    queryKey: queryKeys.finance.all(),
    queryFn: () => financeApi.listVendors(),
  })

  const vendors = vendorsData?.items ?? []
  const summary = data?.summary
  const payables = data?.items ?? []

  const createPayable = useMutation({
    mutationFn: (input: PayableWriteInput) => financeApi.createPayable(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.payables.all() })
      toast({ title: 'Invoice created' })
      setCreateOpen(false)
      setForm(EMPTY_FORM)
    },
    onError: e => toast({ variant: 'error', title: 'Failed to create invoice', description: errorMessage(e, 'Try again.') }),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PayableStatus }) =>
      financeApi.updatePayableStatus(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.payables.all() })
      toast({ title: 'Status updated' })
    },
    onError: e => toast({ variant: 'error', title: 'Failed to update status', description: errorMessage(e, 'Try again.') }),
  })

  const deletePayable = useMutation({
    mutationFn: (id: string) => financeApi.deletePayable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.payables.all() })
      toast({ title: 'Invoice deleted' })
    },
    onError: e => toast({ variant: 'error', title: 'Failed to delete', description: errorMessage(e, 'Try again.') }),
  })

  async function downloadPdf(id: string) {
    try {
      setDownloadingId(id)
      const blob = await http.binary(`/finance/payables/${id}/pdf`)
      downloadBlob(blob, `invoice-${id}.pdf`)
    } catch (e) {
      toast({ variant: 'error', title: 'Failed to download PDF', description: errorMessage(e, 'Try again.') })
    } finally {
      setDownloadingId(null)
    }
  }

  const columns: ColumnDef<PayableInvoice>[] = useMemo(() => [
    {
      accessorKey: 'vendor',
      header: 'Vendor',
      cell: ({ row }) => <span className="font-medium text-[var(--color-heading)]">{row.original.vendor}</span>,
    },
    {
      accessorKey: 'invoiceNumber',
      header: 'Invoice #',
      cell: ({ row }) => <span className="text-[var(--color-muted)]">{row.original.invoiceNumber ?? '—'}</span>,
    },
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => <span className="text-[var(--color-body)]">{formatDate(row.original.date)}</span>,
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ row }) => (
        <span className="font-medium tabular-nums text-[var(--color-heading)]">
          {formatMoney(row.original.amount)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANTS[row.original.status]}>
          {STATUS_LABELS[row.original.status]}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {canWrite && (
            <Select
              value={row.original.status}
              onValueChange={(value: string) => updateStatus.mutate({ id: row.original.id, status: value as PayableStatus })}
            >
              <SelectTrigger className="h-8 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_STATUSES.map(s => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => downloadPdf(row.original.id)}
            disabled={downloadingId === row.original.id}
            title="Download PDF"
          >
            <Download className="h-4 w-4" />
          </Button>
          {canWrite && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm('Delete this invoice?')) deletePayable.mutate(row.original.id)
              }}
              title="Delete"
            >
              <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
            </Button>
          )}
        </div>
      ),
    },
  ], [canWrite, downloadingId, updateStatus, deletePayable])

  const valid = form.vendorId !== '' && form.amount !== ''

  function submit() {
    createPayable.mutate(form)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-heading)]">Accounts Payable</h1>
          <p className="text-sm text-[var(--color-muted)]">Vendor invoices and payment status</p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New invoice
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Open outstanding</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(summary?.openOutstanding)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Pending</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(summary?.pendingTotal)}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-[var(--color-muted)]">{summary?.pendingCount ?? 0} invoices</p></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Approved</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(summary?.approvedTotal)}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-[var(--color-muted)]">{summary?.approvedCount ?? 0} invoices</p></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Paid</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(summary?.paidTotal)}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-[var(--color-muted)]">{summary?.paidCount ?? 0} invoices</p></CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(v: string) => { setStatusFilter(v as PayableStatus | 'ALL'); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          placeholder="Search invoices…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="max-w-xs"
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          {isError ? (
            <p className="text-sm text-[var(--color-danger)]">Could not load invoices.</p>
          ) : isLoading ? (
            <p className="text-sm text-[var(--color-muted)]">Loading…</p>
          ) : (
            <DataTable columns={columns} data={payables} pageSize={25} />
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New payable invoice</DialogTitle>
            <DialogDescription>Record a vendor invoice for payment tracking.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-heading)]">Vendor</label>
              <Select
                value={form.vendorId || '__none__'}
                onValueChange={v => setForm(prev => ({ ...prev, vendorId: v === '__none__' ? '' : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select vendor…</SelectItem>
                  {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {vendors.length === 0 && (
                <p className="text-xs text-[var(--color-muted)]">No vendors yet. Create one from the overview page.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-heading)]">Invoice number</label>
              <Input
                value={form.invoiceNumber ?? ''}
                onChange={e => setForm(prev => ({ ...prev, invoiceNumber: e.target.value || null }))}
                placeholder="INV-001"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--color-heading)]">Date</label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--color-heading)]">Amount</label>
                <Input
                  value={form.amount}
                  onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="1250.00"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-heading)]">Status</label>
              <Select
                value={form.status ?? 'PENDING'}
                onValueChange={(v: string) => setForm(prev => ({ ...prev, status: v as PayableStatus }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}><X /> Cancel</Button>
            <Button disabled={!valid || createPayable.isPending} onClick={submit}>
              {createPayable.isPending ? 'Creating…' : 'Create invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster />
    </div>
  )
}
