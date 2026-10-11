import { useState, useMemo } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowUpDown,
  History,
  Layers,
  Search,
  Filter,
  Plus,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { inventoryApi } from '../../../lib/api/inventory'
import { queryKeys } from '../../../lib/queryKeys'
import { formatDate } from '../../../lib/format'
import { useActiveMemberRole } from '../../../lib/authClient'
import { useDebouncedValue } from '../../../lib/useDebouncedValue'
import FormDialog from '../../../components/common/FormDialog'
import TopBarActions from '../../../components/TopBarActions'

export default function StockMovements() {
  const queryClient = useQueryClient()
  const { data: roleData } = useActiveMemberRole()
  const canWrite = roleData?.role === 'ADMIN' || roleData?.role === 'OWNER'
  const noRoleTitle = canWrite ? undefined : 'Only workspace admins can record stock movements.'

  // Filtering & Pagination state
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput)
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  // Record movement dialog state
  const [movementDialogOpen, setMovementDialogOpen] = useState(false)
  const [movementForm, setMovementForm] = useState({
    productId: '',
    kind: 'receive', // 'receive' | 'issue'
    quantity: '1',
    note: '',
  })
  const [movementError, setMovementError] = useState('')

  // Query: Stock movements
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.inventory.movements.list({
      page,
      limit: 25,
      warehouse: warehouseFilter || undefined,
      type: typeFilter || undefined,
    }),
    queryFn: () =>
      inventoryApi.listStockMovements({
        page,
        limit: 25,
        warehouse: warehouseFilter || undefined,
        type: typeFilter || undefined,
      }),
    placeholderData: keepPreviousData,
  })

  // Query: Warehouses for filter
  const { data: warehousesData } = useQuery({
    queryKey: queryKeys.inventory.warehouses(),
    queryFn: () => inventoryApi.listWarehouses(),
  })

  // Query: Products for Record Movement dropdown
  const { data: productsData } = useQuery({
    queryKey: queryKeys.inventory.products.list({ limit: 100, archived: false }),
    queryFn: () => inventoryApi.listProducts({ limit: 100, archived: false }),
    enabled: movementDialogOpen,
  })

  const rawItems = data?.items ?? []
  const summary = data?.summary
  const pagination = data?.pagination ?? { page: 1, limit: 25, total: 0, totalPages: 1 }
  const warehouses = (Array.isArray(warehousesData) ? warehousesData : warehousesData?.items) ?? []
  const products = (Array.isArray(productsData) ? productsData : productsData?.items) ?? []

  // Filter items client-side by debounced product name search if typed
  const movements = useMemo(() => {
    if (!debouncedSearch) return rawItems
    const term = debouncedSearch.toLowerCase()
    return rawItems.filter(
      (m) =>
        m.productName?.toLowerCase().includes(term) ||
        m.warehouse?.toLowerCase().includes(term) ||
        m.note?.toLowerCase().includes(term)
    )
  }, [rawItems, debouncedSearch])

  // Mutation: Record Stock Movement
  const recordMovementMutation = useMutation({
    mutationFn: async () => {
      const parsedQty = Number(movementForm.quantity)
      if (!movementForm.productId) {
        throw new Error('Please select a product.')
      }
      if (!Number.isSafeInteger(parsedQty) || parsedQty <= 0) {
        throw new Error('Quantity must be a positive integer.')
      }
      const delta = movementForm.kind === 'receive' ? parsedQty : -parsedQty
      return inventoryApi.recordStockMovement({
        productId: movementForm.productId,
        delta,
        note: movementForm.note.trim() || null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all() })
      closeMovementDialog()
    },
    onError: (err) => {
      setMovementError(err.message || 'Failed to record stock movement.')
    },
  })

  function openMovementDialog() {
    setMovementForm({ productId: '', kind: 'receive', quantity: '1', note: '' })
    setMovementError('')
    setMovementDialogOpen(true)
  }

  function closeMovementDialog() {
    if (!recordMovementMutation.isPending) {
      setMovementDialogOpen(false)
      setMovementError('')
    }
  }

  return (
    <div className="flex h-screen flex-col bg-surface-muted overflow-hidden">
      {/* Top Bar */}
      <div className="px-8 py-5 bg-surface-raised border-b border-border-default flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-heading">Stock Movements</h1>
          <p className="text-xs text-muted mt-0.5">
            Audit ledger of inbound receipts, outbound fulfillment, and inventory adjustments
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openMovementDialog}
            disabled={!canWrite}
            title={noRoleTitle}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-input text-xs font-semibold hover:bg-primary-hover transition-colors shadow-card disabled:opacity-60"
          >
            <Plus size={14} />
            Record Movement
          </button>
          <TopBarActions />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total In */}
          <div className="bg-surface-raised border border-border-default rounded-card p-5 shadow-card">
            <div className="flex items-center justify-between text-muted mb-2">
              <span className="text-xs font-medium">Total Inbound</span>
              <div className="p-1.5 bg-success-light text-success-text rounded-button">
                <ArrowDownLeft size={16} />
              </div>
            </div>
            <p className="text-2xl font-bold text-heading tabular-nums">
              {summary ? summary.totalIn.toLocaleString() : '—'}
            </p>
            <p className="text-[11px] text-muted mt-1.5 flex items-center gap-1">
              {summary?.recordedThisMonth ? (
                <>
                  <span className="font-semibold text-success-text">
                    +{summary.recordedThisMonth.totalIn} this month
                  </span>
                  <span>(vs {summary.recordedThisMonthComparison?.totalIn ?? 0} prior)</span>
                </>
              ) : (
                'Lifetime units received'
              )}
            </p>
          </div>

          {/* Total Out */}
          <div className="bg-surface-raised border border-border-default rounded-card p-5 shadow-card">
            <div className="flex items-center justify-between text-muted mb-2">
              <span className="text-xs font-medium">Total Outbound</span>
              <div className="p-1.5 bg-danger-light text-danger rounded-button">
                <ArrowUpRight size={16} />
              </div>
            </div>
            <p className="text-2xl font-bold text-heading tabular-nums">
              {summary ? summary.totalOut.toLocaleString() : '—'}
            </p>
            <p className="text-[11px] text-muted mt-1.5 flex items-center gap-1">
              {summary?.recordedThisMonth ? (
                <>
                  <span className="font-semibold text-danger">
                    −{summary.recordedThisMonth.totalOut} this month
                  </span>
                  <span>(vs {summary.recordedThisMonthComparison?.totalOut ?? 0} prior)</span>
                </>
              ) : (
                'Lifetime units dispatched'
              )}
            </p>
          </div>

          {/* Net Flow */}
          <div className="bg-surface-raised border border-border-default rounded-card p-5 shadow-card">
            <div className="flex items-center justify-between text-muted mb-2">
              <span className="text-xs font-medium">Net Stock Flow</span>
              <div className="p-1.5 bg-surface-muted text-heading rounded-button">
                <ArrowUpDown size={16} />
              </div>
            </div>
            <p className="text-2xl font-bold text-heading tabular-nums">
              {summary ? (summary.totalIn - summary.totalOut).toLocaleString() : '—'}
            </p>
            <p className="text-[11px] text-muted mt-1.5">
              Net movement differential across catalog
            </p>
          </div>

          {/* Total Ledger Entries */}
          <div className="bg-surface-raised border border-border-default rounded-card p-5 shadow-card">
            <div className="flex items-center justify-between text-muted mb-2">
              <span className="text-xs font-medium">Ledger Entries</span>
              <div className="p-1.5 bg-surface-muted text-heading rounded-button">
                <History size={16} />
              </div>
            </div>
            <p className="text-2xl font-bold text-heading tabular-nums">
              {pagination.total.toLocaleString()}
            </p>
            <p className="text-[11px] text-muted mt-1.5">
              Historical movement transactions
            </p>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-raised p-4 rounded-card border border-border-default shadow-card">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Search by product, warehouse, or note..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full bg-surface-muted border border-border-default rounded-input pl-9 pr-3 py-1.5 text-xs text-heading placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Warehouse Filter */}
            <div className="flex items-center gap-2">
              <Filter size={13} className="text-muted" />
              <select
                value={warehouseFilter}
                onChange={(e) => {
                  setWarehouseFilter(e.target.value)
                  setPage(1)
                }}
                className="bg-surface-muted border border-border-default rounded-input px-3 py-1.5 text-xs text-heading focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">All Warehouses</option>
                {warehouses.map((w) => (
                  <option key={w.name} value={w.name}>
                    {w.name} ({w.productCount})
                  </option>
                ))}
              </select>
            </div>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value)
                setPage(1)
              }}
              className="bg-surface-muted border border-border-default rounded-input px-3 py-1.5 text-xs text-heading focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Types</option>
              <option value="IN">Inbound (IN)</option>
              <option value="OUT">Outbound (OUT)</option>
            </select>
          </div>

          {/* Quick Page Info */}
          <div className="text-xs text-muted">
            Showing <span className="font-semibold text-heading">{movements.length}</span> movements
            {pagination.total > 0 && ` of ${pagination.total}`}
          </div>
        </div>

        {/* Movements Table */}
        <div className="bg-surface-raised border border-border-default rounded-card shadow-card overflow-hidden">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="animate-spin text-muted" size={24} />
            </div>
          ) : isError ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-danger">
              <AlertTriangle size={24} />
              <p className="text-sm font-semibold">Failed to load stock movements.</p>
            </div>
          ) : movements.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted">
              <Layers size={32} strokeWidth={1.5} />
              <p className="text-sm">No stock movements found.</p>
              {searchInput || warehouseFilter || typeFilter ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('')
                    setWarehouseFilter('')
                    setTypeFilter('')
                    setPage(1)
                  }}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-muted border-b border-border-default">
                  <tr>
                    <th className="px-5 py-3 text-[11px] font-bold text-muted uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-5 py-3 text-[11px] font-bold text-muted uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-5 py-3 text-[11px] font-bold text-muted uppercase tracking-wider">
                      Warehouse
                    </th>
                    <th className="px-5 py-3 text-[11px] font-bold text-muted uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-5 py-3 text-[11px] font-bold text-muted uppercase tracking-wider text-right">
                      Quantity
                    </th>
                    <th className="px-5 py-3 text-[11px] font-bold text-muted uppercase tracking-wider">
                      Note / Reference
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {movements.map((movement) => {
                    const isIn = movement.delta > 0
                    return (
                      <tr key={movement.id} className="hover:bg-surface-muted/50 transition-colors">
                        <td className="px-5 py-3.5 text-xs text-body whitespace-nowrap">
                          {formatDate(movement.createdAt, { includeTime: true })}
                        </td>
                        <td className="px-5 py-3.5 text-xs font-semibold text-heading">
                          {movement.productName}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-body">
                          {movement.warehouse ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-surface-muted text-heading border border-border-default">
                              {movement.warehouse}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                              isIn
                                ? 'bg-success-light text-success-text border border-success-border'
                                : 'bg-danger-light text-danger border border-danger-border'
                            }`}
                          >
                            {isIn ? <ArrowDownLeft size={10} /> : <ArrowUpRight size={10} />}
                            {movement.type || (isIn ? 'IN' : 'OUT')}
                          </span>
                        </td>
                        <td
                          className={`px-5 py-3.5 text-xs font-bold tabular-nums text-right ${
                            isIn ? 'text-success-text' : 'text-danger'
                          }`}
                        >
                          {isIn ? '+' : '−'}
                          {Math.abs(movement.delta).toLocaleString()}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-body max-w-xs truncate" title={movement.note || ''}>
                          {movement.note || <span className="text-muted">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Table Footer / Pagination */}
          <div className="px-5 py-3 bg-surface-muted/50 border-t border-border-default flex items-center justify-between">
            <span className="text-xs text-muted">
              Page {pagination.page} of {Math.max(1, pagination.totalPages)}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
                className="p-1.5 rounded-button border border-border-default bg-surface-raised text-heading hover:bg-surface-muted disabled:opacity-40 transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages || isLoading}
                className="p-1.5 rounded-button border border-border-default bg-surface-raised text-heading hover:bg-surface-muted disabled:opacity-40 transition-colors"
                aria-label="Next page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Record Movement Dialog */}
      <FormDialog
        open={movementDialogOpen}
        onClose={closeMovementDialog}
        title="Record Stock Movement"
        subtitle="Log an inventory receipt or fulfillment dispatch."
        confirmLabel="Save Movement"
        busy={recordMovementMutation.isPending}
        error={movementError}
        onConfirm={() => recordMovementMutation.mutate()}
        width="max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-heading mb-1.5">Product</label>
            <select
              value={movementForm.productId}
              onChange={(e) => setMovementForm((f) => ({ ...f, productId: e.target.value }))}
              required
              className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading bg-surface-raised focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">Select a product...</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.sku}) — {product.stock} on hand
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-heading mb-1.5">Movement Type</label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-center gap-2 border rounded-input px-3 py-2 text-xs font-medium cursor-pointer transition-colors ${
                  movementForm.kind === 'receive'
                    ? 'border-success-border bg-success-light text-success-text font-bold'
                    : 'border-border-default bg-surface-raised text-body hover:bg-surface-muted'
                }`}
              >
                <input
                  type="radio"
                  name="modal-movement-kind"
                  value="receive"
                  checked={movementForm.kind === 'receive'}
                  onChange={() => setMovementForm((f) => ({ ...f, kind: 'receive' }))}
                  className="accent-primary"
                />
                Receive (Inbound)
              </label>
              <label
                className={`flex items-center gap-2 border rounded-input px-3 py-2 text-xs font-medium cursor-pointer transition-colors ${
                  movementForm.kind === 'issue'
                    ? 'border-danger-border bg-danger-light text-danger font-bold'
                    : 'border-border-default bg-surface-raised text-body hover:bg-surface-muted'
                }`}
              >
                <input
                  type="radio"
                  name="modal-movement-kind"
                  value="issue"
                  checked={movementForm.kind === 'issue'}
                  onChange={() => setMovementForm((f) => ({ ...f, kind: 'issue' }))}
                  className="accent-primary"
                />
                Issue (Outbound)
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-heading mb-1.5">Quantity</label>
            <input
              type="number"
              min="1"
              step="1"
              required
              value={movementForm.quantity}
              onChange={(e) => setMovementForm((f) => ({ ...f, quantity: e.target.value }))}
              placeholder="1"
              className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading bg-surface-raised focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-heading mb-1.5">Note / Reference (Optional)</label>
            <input
              type="text"
              value={movementForm.note}
              onChange={(e) => setMovementForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="e.g. PO-2026-081 or Customer order fulfillment"
              className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading bg-surface-raised focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>
      </FormDialog>
    </div>
  )
}

