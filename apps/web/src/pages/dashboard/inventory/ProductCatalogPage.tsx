import type { Product, ProductStockStatus } from '@asas/contracts'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { Input } from '@/components/ui/input'
import { inventoryApi } from '@/lib/api/inventory.js'
import { formatMoney } from '@/lib/format.js'
import { queryKeys } from '@/lib/queryKeys.js'

const STATUS_VARIANTS: Record<ProductStockStatus, 'success' | 'warning' | 'danger'> = {
  IN_STOCK: 'success',
  LOW_STOCK: 'warning',
  OUT_OF_STOCK: 'danger',
}

const STATUS_LABELS: Record<ProductStockStatus, string> = {
  IN_STOCK: 'In stock',
  LOW_STOCK: 'Low stock',
  OUT_OF_STOCK: 'Out of stock',
}

/**
 * Ports the legacy `ProductCatalog` onto `GET /inventory/products`. The KPI cards read the
 * server `summary` (SQL aggregates over the whole tenant, not the fetched page), and each
 * row's stock badge is the API's derived `status` — never a client-side comparison of
 * `stock` against a threshold.
 */
export function ProductCatalogPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProductStockStatus | 'ALL'>('ALL')

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.inventory.products.list({
      search: search || undefined,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
    }),
    queryFn: () =>
      inventoryApi.listProducts({
        search: search || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        limit: 100,
      }),
  })

  const products = useMemo(() => data?.items ?? [], [data])
  const summary = data?.summary ?? { totalProducts: 0, totalUnitsOnHand: 0, lowStockProducts: 0 }

  const columns = useMemo<ColumnDef<Product>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Product',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-[var(--color-heading)]">{row.original.name}</p>
            <p className="text-xs text-[var(--color-muted)]">{row.original.sku}</p>
          </div>
        ),
      },
      {
        accessorKey: 'price',
        header: 'Price',
        cell: ({ row }) => formatMoney(row.original.price, { minimumFractionDigits: 2 }),
      },
      {
        accessorKey: 'stock',
        header: 'On hand',
        cell: ({ row }) => <span className="tabular-nums">{row.original.stock}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANTS[row.original.status]}>{STATUS_LABELS[row.original.status]}</Badge>
        ),
      },
      {
        accessorKey: 'warehouse',
        header: 'Location',
        cell: ({ row }) =>
          row.original.warehouse
            ? [row.original.warehouse, row.original.aisle, row.original.bin]
                .filter(Boolean)
                .join(' · ')
            : '—',
      },
      {
        accessorKey: 'minThreshold',
        header: 'Reorder at',
        cell: ({ row }) => <span className="tabular-nums">{row.original.minThreshold}</span>,
      },
    ],
    [],
  )

  return (
    <div className="flex flex-col gap-6 p-[var(--spacing-page)]">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--color-heading)]">Product catalog</h1>
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search products…"
            className="w-64"
          />
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value as ProductStockStatus | 'ALL')}
            className="h-9 rounded-[var(--radius-input)] border border-[var(--color-border-default)] bg-[var(--color-surface-raised)] px-3 text-sm text-[var(--color-body)]"
          >
            <option value="ALL">All statuses</option>
            <option value="IN_STOCK">In stock</option>
            <option value="LOW_STOCK">Low stock</option>
            <option value="OUT_OF_STOCK">Out of stock</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardDescription>Total products</CardDescription>
            <CardTitle className="text-3xl">{summary.totalProducts}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Units on hand</CardDescription>
            <CardTitle className="text-3xl">{summary.totalUnitsOnHand}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Low stock</CardDescription>
            <CardTitle className="text-3xl">{summary.lowStockProducts}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isError ? (
            <p className="text-sm text-[var(--color-danger)]">Could not load products.</p>
          ) : isLoading ? (
            <p className="text-sm text-[var(--color-muted)]">Loading…</p>
          ) : (
            <DataTable columns={columns} data={products} pageSize={25} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
