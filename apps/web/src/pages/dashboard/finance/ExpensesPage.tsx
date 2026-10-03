import type { Expense, ExpenseCategory, ExpenseListQuery, ExpenseStatus, ExpenseWriteInput } from '@asas/contracts'
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

const STATUS_VARIANTS: Record<ExpenseStatus, 'warning' | 'danger' | 'secondary' | 'success' | 'outline'> = {
  PENDING: 'warning',
  FLAGGED: 'danger',
  PROCESSING: 'secondary',
  APPROVED: 'success',
  REJECTED: 'outline',
}

const STATUS_LABELS: Record<ExpenseStatus, string> = {
  PENDING: 'Pending',
  FLAGGED: 'Flagged',
  PROCESSING: 'Processing',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
}

const ALL_STATUSES: ExpenseStatus[] = ['PENDING', 'FLAGGED', 'PROCESSING', 'APPROVED', 'REJECTED']

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  OFFICE_SUPPLIES: 'Office Supplies',
  FACILITIES_LEASE: 'Facilities & Lease',
  TRAVEL: 'Travel',
  MEALS: 'Meals',
  MARKETING: 'Marketing',
  SOFTWARE: 'Software',
  PAYROLL: 'Payroll',
  OTHER: 'Other',
}

const ALL_CATEGORIES: ExpenseCategory[] = [
  'OFFICE_SUPPLIES', 'FACILITIES_LEASE', 'TRAVEL', 'MEALS',
  'MARKETING', 'SOFTWARE', 'PAYROLL', 'OTHER',
]

const EMPTY_FORM: ExpenseWriteInput = {
  name: '',
  category: 'OTHER',
  merchant: null,
  date: new Date().toISOString().slice(0, 10),
  amount: '',
  tax: null,
  policyMatch: null,
  status: 'PENDING',
}

/**
 * Expense management — `GET /finance/expenses` with server-side summary KPIs, create/status
 * transitions. Mirrors the EmployeeListPage pattern.
 */
export function ExpensesPage() {
  const role = useMyRole()
  const canWrite = role === 'ADMIN' || role === 'OWNER'
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | 'ALL'>('ALL')
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<ExpenseWriteInput>(EMPTY_FORM)

  const query: Partial<ExpenseListQuery> = useMemo(() => ({
    page,
    limit: 25,
    ...(statusFilter !== 'ALL' && { status: statusFilter }),
    ...(categoryFilter !== 'ALL' && { category: categoryFilter }),
    ...(search && { search }),
  }), [page, statusFilter, categoryFilter, search])

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.finance.expenses.list(query),
    queryFn: () => financeApi.listExpenses(query),
  })

  const summary = data?.summary
  const expenses = data?.items ?? []

  const createExpense = useMutation({
    mutationFn: (input: ExpenseWriteInput) => financeApi.createExpense(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.expenses.all() })
      toast({ title: 'Expense created' })
      setCreateOpen(false)
      setForm(EMPTY_FORM)
    },
    onError: e => toast({ variant: 'error', title: 'Failed to create expense', description: errorMessage(e, 'Try again.') }),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ExpenseStatus }) =>
      financeApi.updateExpenseStatus(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.expenses.all() })
      toast({ title: 'Status updated' })
    },
    onError: e => toast({ variant: 'error', title: 'Failed to update status', description: errorMessage(e, 'Try again.') }),
  })

  const deleteExpense = useMutation({
    mutationFn: (id: string) => financeApi.deleteExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.expenses.all() })
      toast({ title: 'Expense deleted' })
    },
    onError: e => toast({ variant: 'error', title: 'Failed to delete', description: errorMessage(e, 'Try again.') }),
  })

  const columns: ColumnDef<Expense>[] = useMemo(() => [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => <span className="font-medium text-[var(--color-heading)]">{row.original.name}</span>,
    },
    {
      accessorKey: 'category',
      header: 'Category',
      cell: ({ row }) => (
        <Badge variant="secondary">{CATEGORY_LABELS[row.original.category]}</Badge>
      ),
    },
    {
      accessorKey: 'merchant',
      header: 'Merchant',
      cell: ({ row }) => <span className="text-[var(--color-muted)]">{row.original.merchant ?? '—'}</span>,
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
      accessorKey: 'tax',
      header: 'Tax',
      cell: ({ row }) => (
        <span className="tabular-nums text-[var(--color-muted)]">
          {row.original.tax ? formatMoney(row.original.tax) : '—'}
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
              onValueChange={(value: string) => updateStatus.mutate({ id: row.original.id, status: value as ExpenseStatus })}
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
          {canWrite && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm('Delete this expense?')) deleteExpense.mutate(row.original.id)
              }}
              title="Delete"
            >
              <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
            </Button>
          )}
        </div>
      ),
    },
  ], [canWrite, updateStatus, deleteExpense])

  const valid = form.name !== '' && form.amount !== ''

  function submit() {
    createExpense.mutate(form)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-heading)]">Expenses</h1>
          <p className="text-sm text-[var(--color-muted)]">Employee expenses and approval status</p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New expense
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(summary?.total)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Pending</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(summary?.pendingTotal)}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-[var(--color-muted)]">{summary?.pendingCount ?? 0} expenses</p></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Flagged</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(summary?.flaggedTotal)}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-[var(--color-muted)]">{summary?.flaggedCount ?? 0} expenses</p></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Approved</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(summary?.approvedTotal)}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-[var(--color-muted)]">{summary?.approvedCount ?? 0} expenses</p></CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(v: string) => { setStatusFilter(v as ExpenseStatus | 'ALL'); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={(v: string) => { setCategoryFilter(v as ExpenseCategory | 'ALL'); setPage(1) }}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {ALL_CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          placeholder="Search expenses…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="max-w-xs"
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          {isError ? (
            <p className="text-sm text-[var(--color-danger)]">Could not load expenses.</p>
          ) : isLoading ? (
            <p className="text-sm text-[var(--color-muted)]">Loading…</p>
          ) : (
            <DataTable columns={columns} data={expenses} pageSize={25} />
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New expense</DialogTitle>
            <DialogDescription>Record an employee expense for approval tracking.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-heading)]">Name</label>
              <Input
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Team lunch"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--color-heading)]">Category</label>
                <Select
                  value={form.category ?? 'OTHER'}
                  onValueChange={(v: string) => setForm(prev => ({ ...prev, category: v as ExpenseCategory }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--color-heading)]">Merchant</label>
                <Input
                  value={form.merchant ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, merchant: e.target.value || null }))}
                  placeholder="Restaurant name"
                />
              </div>
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
                  placeholder="84.20"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--color-heading)]">Tax (optional)</label>
                <Input
                  value={form.tax ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, tax: e.target.value || null }))}
                  placeholder="7.50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--color-heading)]">Status</label>
                <Select
                  value={form.status ?? 'PENDING'}
                  onValueChange={(v: string) => setForm(prev => ({ ...prev, status: v as ExpenseStatus }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}><X /> Cancel</Button>
            <Button disabled={!valid || createExpense.isPending} onClick={submit}>
              {createExpense.isPending ? 'Creating…' : 'Create expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster />
    </div>
  )
}
