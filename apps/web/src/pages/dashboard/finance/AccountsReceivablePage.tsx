import type { ReceivableInvoice, ReceivableListQuery, ReceivableStatus, ReceivableWriteInput } from '@asas/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, Trash2, X } from 'lucide-react'
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
import { ApiError } from '@/lib/api/http.js'
import { financeApi } from '@/lib/api/finance.js'
import { formatDate, formatMoney } from '@/lib/format.js'
import { queryKeys } from '@/lib/queryKeys.js'
import { useMyRole } from '@/lib/useMyRole.js'

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

const STATUS_VARIANTS: Record<ReceivableStatus, 'success' | 'danger' | 'warning' | 'secondary'> = {
  CURRENT: 'success',
  OVERDUE: 'danger',
  IN_COLLECTIONS: 'warning',
  PAID: 'secondary',
}

const STATUS_LABELS: Record<ReceivableStatus, string> = {
  CURRENT: 'Current',
  OVERDUE: 'Overdue',
  IN_COLLECTIONS: 'In collections',
  PAID: 'Paid',
}

const ALL_STATUSES: ReceivableStatus[] = ['CURRENT', 'OVERDUE', 'IN_COLLECTIONS', 'PAID']

const EMPTY_FORM: ReceivableWriteInput = {
  customerId: '',
  number: null,
  amount: '',
  dueDate: null,
  status: 'CURRENT',
}

/**
 * Accounts receivable management — `GET /finance/receivables` with server-side aging summary
 * KPIs, create/status transitions. Mirrors the EmployeeListPage pattern.
 */
export function AccountsReceivablePage() {
  const role = useMyRole()
  const canWrite = role === 'ADMIN' || role === 'OWNER'
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<ReceivableStatus | 'ALL'>('ALL')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<ReceivableWriteInput>(EMPTY_FORM)

  const query: Partial<ReceivableListQuery> = useMemo(() => ({
    page,
    limit: 25,
    ...(statusFilter !== 'ALL' && { status: statusFilter }),
    ...(overdueOnly && { overdueOnly: true }),
    ...(search && { search }),
  }), [page, statusFilter, overdueOnly, search])

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.finance.receivables.list(query),
    queryFn: () => financeApi.listReceivables(query),
  })

  const { data: customersData } = useQuery({
    queryKey: queryKeys.finance.all(),
    queryFn: () => financeApi.listCustomers(),
  })

  const customers = customersData?.items ?? []
  const summary = data?.summary
  const receivables = data?.items ?? []

  const createReceivable = useMutation({
    mutationFn: (input: ReceivableWriteInput) => financeApi.createReceivable(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.receivables.all() })
      toast({ title: 'Invoice created' })
      setCreateOpen(false)
      setForm(EMPTY_FORM)
    },
    onError: e => toast({ variant: 'error', title: 'Failed to create invoice', description: errorMessage(e, 'Try again.') }),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReceivableStatus }) =>
      financeApi.updateReceivableStatus(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.receivables.all() })
      toast({ title: 'Status updated' })
    },
    onError: e => toast({ variant: 'error', title: 'Failed to update status', description: errorMessage(e, 'Try again.') }),
  })

  const deleteReceivable = useMutation({
    mutationFn: (id: string) => financeApi.deleteReceivable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.receivables.all() })
      toast({ title: 'Invoice deleted' })
    },
    onError: e => toast({ variant: 'error', title: 'Failed to delete', description: errorMessage(e, 'Try again.') }),
  })

  const columns: ColumnDef<ReceivableInvoice>[] = useMemo(() => [
    {
      accessorKey: 'customer',
      header: 'Customer',
      cell: ({ row }) => <span className="font-medium text-[var(--color-heading)]">{row.original.customer}</span>,
    },
    {
      accessorKey: 'number',
      header: 'Invoice #',
      cell: ({ row }) => <span className="text-[var(--color-muted)]">{row.original.number ?? '—'}</span>,
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
      accessorKey: 'dueDate',
      header: 'Due date',
      cell: ({ row }) => <span className="text-[var(--color-body)]">{formatDate(row.original.dueDate)}</span>,
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
              onValueChange={(value: string) => updateStatus.mutate({ id: row.original.id, status: value as ReceivableStatus })}
            >
              <SelectTrigger className="h-8 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_STATUSES.map(s => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {canWrite && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm('Delete this invoice?')) deleteReceivable.mutate(row.original.id)
              }}
              title="Delete"
            >
              <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
            </Button>
          )}
        </div>
      ),
    },
  ], [canWrite, updateStatus, deleteReceivable])

  const valid = form.customerId !== '' && form.amount !== ''

  function submit() {
    createReceivable.mutate(form)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-heading)]">Accounts Receivable</h1>
          <p className="text-sm text-[var(--color-muted)]">Customer invoices and collection status</p>
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
            <CardDescription>Open balance</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(summary?.openBalance)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Current</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(summary?.currentTotal)}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-[var(--color-muted)]">{summary?.currentCount ?? 0} invoices</p></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Overdue</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(summary?.overdueTotal)}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-[var(--color-muted)]">{summary?.overdueCount ?? 0} invoices</p></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>In collections</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(summary?.inCollectionsTotal)}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-[var(--color-muted)]">{summary?.inCollectionsCount ?? 0} invoices</p></CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(v: string) => { setStatusFilter(v as ReceivableStatus | 'ALL'); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant={overdueOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setOverdueOnly(!overdueOnly); setPage(1) }}
        >
          Overdue only
        </Button>
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
            <DataTable columns={columns} data={receivables} pageSize={25} />
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New receivable invoice</DialogTitle>
            <DialogDescription>Record a customer invoice for collection tracking.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-heading)]">Customer</label>
              <Select
                value={form.customerId || '__none__'}
                onValueChange={v => setForm(prev => ({ ...prev, customerId: v === '__none__' ? '' : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select customer…</SelectItem>
                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {customers.length === 0 && (
                <p className="text-xs text-[var(--color-muted)]">No customers yet. Create one from the overview page.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-heading)]">Invoice number</label>
              <Input
                value={form.number ?? ''}
                onChange={e => setForm(prev => ({ ...prev, number: e.target.value || null }))}
                placeholder="INV-001"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--color-heading)]">Amount</label>
                <Input
                  value={form.amount}
                  onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="4800.00"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--color-heading)]">Due date</label>
                <Input
                  type="date"
                  value={form.dueDate ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, dueDate: e.target.value || null }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-heading)]">Status</label>
              <Select
                value={form.status ?? 'CURRENT'}
                onValueChange={(v: string) => setForm(prev => ({ ...prev, status: v as ReceivableStatus }))}
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
            <Button disabled={!valid || createReceivable.isPending} onClick={submit}>
              {createReceivable.isPending ? 'Creating…' : 'Create invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster />
    </div>
  )
}
