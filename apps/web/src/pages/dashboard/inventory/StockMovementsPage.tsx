import type { StockMovement, StockMovementListQuery, StockMovementType, StockMovementWriteInput } from '@asas/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, X } from 'lucide-react'
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
import { inventoryApi } from '@/lib/api/inventory.js'
import { formatDate } from '@/lib/format.js'
import { queryKeys } from '@/lib/queryKeys.js'
import { useMyRole } from '@/lib/useMyRole.js'

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

const EMPTY_FORM: StockMovementWriteInput = {
  productId: '',
  delta: 0,
  note: null,
}

/**
 * Stock movements — `GET /inventory/stock/movements` with server-side summary KPIs and a
 * "record movement" dialog. Stock only changes through this endpoint; the product's
 * `currentStock` is always the SQL sum of its movement rows.
 */
export function StockMovementsPage() {
  const role = useMyRole()
  const canWrite = role === 'ADMIN' || role === 'OWNER'
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<StockMovementWriteInput>(EMPTY_FORM)
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN')
  const [quantity, setQuantity] = useState('1')

  const query: Partial<StockMovementListQuery> = useMemo(() => ({ page, limit: 25 }), [page])

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.inventory.movements.list(query),
    queryFn: () => inventoryApi.listStockMovements(query),
  })

  const { data: productsData } = useQuery({
    queryKey: queryKeys.inventory.products.list({ page: 1, limit: 100 }),
    queryFn: () => inventoryApi.listProducts({ page: 1, limit: 100 }),
  })

  const products = productsData?.items ?? []
  const summary = data?.summary
  const movements = data?.items ?? []

  const recordMovement = useMutation({
    mutationFn: (input: StockMovementWriteInput) => inventoryApi.recordStockMovement(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.movements.all() })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.products.all() })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.stockLevels() })
      toast({ title: 'Stock movement recorded' })
      setCreateOpen(false)
      setForm(EMPTY_FORM)
      setDirection('IN')
      setQuantity('1')
    },
    onError: e => toast({ variant: 'error', title: 'Failed to record movement', description: errorMessage(e, 'Try again.') }),
  })

  const columns: ColumnDef<StockMovement>[] = useMemo(() => [
    {
      accessorKey: 'product',
      header: 'Product',
      cell: ({ row }) => (
        <span className="font-medium text-[var(--color-heading)]">
          {row.original.productName ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'delta',
      header: 'Type',
      cell: ({ row }) => {
        const type: StockMovementType = row.original.delta > 0 ? 'IN' : 'OUT'
        return (
          <Badge variant={type === 'IN' ? 'success' : 'danger'}>
            {type === 'IN' ? 'Stock in' : 'Stock out'}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'delta',
      header: 'Quantity',
      cell: ({ row }) => (
        <span className="font-medium tabular-nums text-[var(--color-heading)]">
          {row.original.delta > 0 ? '+' : ''}{row.original.delta}
        </span>
      ),
    },
    {
      accessorKey: 'note',
      header: 'Note',
      cell: ({ row }) => (
        <span className="text-[var(--color-muted)]">{row.original.note ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Date',
      cell: ({ row }) => <span className="text-[var(--color-body)]">{formatDate(row.original.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</span>,
    },
  ], [])

  const valid = form.productId !== '' && parseInt(quantity, 10) > 0

  function submit() {
    const qty = parseInt(quantity, 10)
    const delta = direction === 'IN' ? qty : -qty
    recordMovement.mutate({ ...form, delta })
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-heading)]">Stock Movements</h1>
          <p className="text-sm text-[var(--color-muted)]">Transaction log for all inventory stock changes</p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> Record movement
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Total stock in</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{summary?.totalIn ?? 0}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-[var(--color-muted)]">Units received</p></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total stock out</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{summary?.totalOut ?? 0}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-[var(--color-muted)]">Units dispatched</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isError ? (
            <p className="text-sm text-[var(--color-danger)]">Could not load movements.</p>
          ) : isLoading ? (
            <p className="text-sm text-[var(--color-muted)]">Loading…</p>
          ) : (
            <DataTable columns={columns} data={movements} pageSize={25} />
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record stock movement</DialogTitle>
            <DialogDescription>Adjust a product's stock level. This creates an auditable movement record.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-heading)]">Product</label>
              <Select
                value={form.productId || '__none__'}
                onValueChange={v => setForm(prev => ({ ...prev, productId: v === '__none__' ? '' : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select product…</SelectItem>
                  {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--color-heading)]">Direction</label>
                <Select
                  value={direction}
                  onValueChange={(v: string) => setDirection(v as 'IN' | 'OUT')}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">Stock in (+)</SelectItem>
                    <SelectItem value="OUT">Stock out (−)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--color-heading)]">Quantity</label>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="10"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-heading)]">Note (optional)</label>
              <Input
                value={form.note ?? ''}
                onChange={e => setForm(prev => ({ ...prev, note: e.target.value || null }))}
                placeholder="Received from supplier"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}><X /> Cancel</Button>
            <Button disabled={!valid || recordMovement.isPending} onClick={submit}>
              {recordMovement.isPending ? 'Recording…' : 'Record movement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster />
    </div>
  )
}
