import { useState, useEffect, useRef } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowUpDown,
  History,
  Layers,
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
import { EMPTY } from '../../../lib/emptyText'
import MissingValue from '../../../components/common/MissingValue'
import { useActiveMemberRole, useActiveOrganization, useSession } from '../../../lib/authClient'
import { useDebouncedValue } from '../../../lib/useDebouncedValue'
import {
  clearStockMovementDraft,
  readStockMovementDraft,
  saveStockMovementDraft,
  stockMovementDraftStorageKey,
} from '../../../lib/stockMovementDraft'
import FormDialog from '../../../components/common/FormDialog'
import SearchInput from '../../../components/common/SearchInput'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Badge } from '../../../components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select'
import { RECEIPT_REASONS, ISSUE_REASONS } from '../../../lib/inventoryReasons'

function movementDraftStorage() {
  try { return window.sessionStorage } catch { return null }
}

const EMPTY_MOVEMENT_FORM = {
  productId: '',
  kind: 'receive',
  quantity: '1',
  note: '',
  reason: 'PURCHASE_RECEIPT',
  unitCost: '',
}

export default function StockMovements() {
  const queryClient = useQueryClient()
  const { data: roleData } = useActiveMemberRole()
  const { data: activeOrganization } = useActiveOrganization()
  const { data: sessionData } = useSession()
  const draftStorageKey = stockMovementDraftStorageKey(activeOrganization?.id, sessionData?.user?.id)
  const canWrite = roleData?.role === 'ADMIN' || roleData?.role === 'OWNER'
  const noRoleTitle = canWrite ? undefined : 'Only workspace admins can record stock movements.'

  // Filtering & Pagination state
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput)
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [productSearchInput, setProductSearchInput] = useState('')
  const productSearch = useDebouncedValue(productSearchInput)
  const [productPage, setProductPage] = useState(1)
  const [selectedProduct, setSelectedProduct] = useState(null)

  useEffect(() => { setPage(1) }, [debouncedSearch])
  useEffect(() => { setProductPage(1) }, [productSearch])

  // Record movement dialog state
  const [movementDialogOpen, setMovementDialogOpen] = useState(false)
  const [movementForm, setMovementForm] = useState(EMPTY_MOVEMENT_FORM)
  const [movementError, setMovementError] = useState('')
  const [savedRetryAvailable, setSavedRetryAvailable] = useState(false)
  const requestRef = useRef(null)

  useEffect(() => {
    if (!draftStorageKey) {
      requestRef.current = null
      setSavedRetryAvailable(false)
      return
    }
    const draft = readStockMovementDraft(movementDraftStorage(), draftStorageKey)
    requestRef.current = draft
    setSavedRetryAvailable(Boolean(draft))
  }, [draftStorageKey])

  // Query: Stock movements
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.inventory.movements.list({
      page,
      limit: 25,
      search: debouncedSearch || undefined,
      warehouse: warehouseFilter || undefined,
      type: typeFilter || undefined,
    }),
    queryFn: () =>
      inventoryApi.listStockMovements({
        page,
        limit: 25,
        search: debouncedSearch || undefined,
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
    queryKey: queryKeys.inventory.products.list({ page: productPage, limit: 25, search: productSearch || undefined, archived: false }),
    queryFn: () => inventoryApi.listProducts({ page: productPage, limit: 25, search: productSearch || undefined, archived: false }),
    enabled: movementDialogOpen,
  })

  // Query: Valuation policy (determines whether cost and reason are required)
  const { data: valuationSetup } = useQuery({
    queryKey: queryKeys.inventory.valuationSetup(),
    queryFn: () => inventoryApi.getValuationSetup(),
  })
  const valuationConfigured = valuationSetup?.configured === true

  const rawItems = data?.items ?? []
  const summary = data?.summary
  const pagination = data?.pagination ?? { page: 1, limit: 25, total: 0, pages: 1 }
  const totalPages = Math.max(1, pagination.pages ?? pagination.totalPages ?? 1)
  const warehouses = (Array.isArray(warehousesData) ? warehousesData : warehousesData?.items) ?? []
  const products = (Array.isArray(productsData) ? productsData : productsData?.items) ?? []
  const productOptions = selectedProduct && !products.some((product) => product.id === selectedProduct.id)
    ? [selectedProduct, ...products]
    : products
  const productPagination = productsData?.pagination

  const movements = rawItems

  function buildMovementPayload() {
    const parsedQty = Number(movementForm.quantity)
    if (!movementForm.productId) {
      throw new Error('Please select a product.')
    }
    if (!Number.isSafeInteger(parsedQty) || parsedQty <= 0) {
      throw new Error('Quantity must be a positive integer.')
    }
    const delta = movementForm.kind === 'receive' ? parsedQty : -parsedQty
    const reason = movementForm.reason
    if (valuationConfigured) {
      if (movementForm.kind === 'receive' && !movementForm.unitCost.trim()) {
        throw new Error('Unit cost is required because this workspace values inventory. The selling price is never used as cost.')
      }
      if (movementForm.kind !== 'receive' && !reason) {
        throw new Error('Select a reason so the cost posts to the right ledger account.')
      }
    }
    return {
      productId: movementForm.productId,
      delta,
      note: movementForm.note.trim() || null,
      ...(valuationConfigured && {
        reason,
        ...(movementForm.kind === 'receive' && { unitCost: movementForm.unitCost.trim() }),
      }),
    }
  }

  // Mutation: Record Stock Movement
  const recordMovementMutation = useMutation({
    mutationFn: (payload) => inventoryApi.recordStockMovement(payload),
    onSuccess: () => {
      clearStockMovementDraft(movementDraftStorage(), draftStorageKey)
      requestRef.current = null
      setSavedRetryAvailable(false)
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all() })
      setMovementDialogOpen(false)
      setMovementError('')
    },
    onError: (err) => {
      setSavedRetryAvailable(Boolean(requestRef.current))
      setMovementError(err.message || 'Failed to record stock movement.')
    },
  })

  async function openMovementDialog() {
    const draft = requestRef.current?.payload
      ? requestRef.current
      : readStockMovementDraft(movementDraftStorage(), draftStorageKey)
    if (draft) {
      requestRef.current = draft
      const isReceive = draft.payload.delta > 0
      setMovementForm({
        productId: draft.payload.productId,
        kind: isReceive ? 'receive' : 'issue',
        quantity: String(Math.abs(draft.payload.delta)),
        note: draft.payload.note ?? '',
        reason: draft.payload.reason ?? (isReceive ? 'PURCHASE_RECEIPT' : 'SALE'),
        unitCost: draft.payload.unitCost ?? '',
      })
      setSelectedProduct(null)
      setProductSearchInput('')
      setProductPage(1)
      setMovementError('')
      setSavedRetryAvailable(true)
      setMovementDialogOpen(true)
      try {
        const product = await inventoryApi.getProduct(draft.payload.productId)
        if (product) setSelectedProduct(product)
      } catch {
        setMovementError('The saved product selection could not be loaded. Choose the product again before retrying.')
      }
      return
    }
    requestRef.current = null
    setMovementForm(EMPTY_MOVEMENT_FORM)
    setSelectedProduct(null)
    setProductSearchInput('')
    setProductPage(1)
    setMovementError('')
    setSavedRetryAvailable(false)
    setMovementDialogOpen(true)
  }

  function discardSavedRetry() {
    clearStockMovementDraft(movementDraftStorage(), draftStorageKey)
    requestRef.current = null
    setSavedRetryAvailable(false)
    setMovementForm(EMPTY_MOVEMENT_FORM)
    setSelectedProduct(null)
    setProductSearchInput('')
    setProductPage(1)
    setMovementError('')
  }

  function submitMovement() {
    if (recordMovementMutation.isPending) return
    try {
      const payload = buildMovementPayload()
      const signature = JSON.stringify(payload)
      if (requestRef.current?.signature !== signature) {
        requestRef.current = { signature, requestKey: crypto.randomUUID(), payload }
      } else {
        requestRef.current.payload = payload
      }
      const persisted = saveStockMovementDraft(
        movementDraftStorage(),
        draftStorageKey,
        payload,
        requestRef.current.requestKey,
      )
      setSavedRetryAvailable(persisted)
      setMovementError('')
      recordMovementMutation.mutate({ ...payload, requestKey: requestRef.current.requestKey })
    } catch (error) {
      setMovementError(error.message || 'Failed to record stock movement.')
    }
  }

  function closeMovementDialog() {
    if (!recordMovementMutation.isPending) {
      setMovementDialogOpen(false)
      setMovementError('')
    }
  }

  return (
    <div className="flex h-full flex-col bg-surface-raised overflow-hidden min-w-0">
      <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-5">
        <h1 className="sr-only">Stock Movements</h1>
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
              {summary ? summary.totalIn.toLocaleString() : <MissingValue label={EMPTY.data} className="text-base" />}
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
              {summary ? summary.totalOut.toLocaleString() : <MissingValue label={EMPTY.data} className="text-base" />}
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
              {summary ? (summary.totalIn - summary.totalOut).toLocaleString() : <MissingValue label={EMPTY.data} className="text-base" />}
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
        <div className="bg-white/80 backdrop-blur-xl border border-slate-200/70 rounded-2xl p-3 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Left Cluster: Search Input + Filter Dropdowns */}
          <div className="flex flex-1 flex-wrap sm:flex-nowrap items-center gap-2.5 min-w-0">
            {/* Search */}
            <SearchInput
              placeholder="Search by product, warehouse, or note..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              wrapperClassName="w-full sm:w-80 lg:w-96 max-w-md shrink-0"
            />

            {/* Subtle Divider */}
            <div className="hidden sm:block h-5 w-px bg-slate-200/80 mx-1 shrink-0" />

            {/* Filter Group: Warehouses (embedded funnel) + Types */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative flex items-center shrink-0">
                <Select
                  value={warehouseFilter || '__all__'}
                  onValueChange={(val) => {
                    setWarehouseFilter(val === '__all__' ? '' : val)
                    setPage(1)
                  }}
                >
                  <SelectTrigger
                    aria-label="Warehouse filter"
                    className="h-9 pl-8 pr-8 w-auto gap-2 rounded-xl bg-slate-100/75 hover:bg-slate-100 border border-slate-200/70 text-xs sm:text-sm font-medium text-slate-700 shrink-0 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50"
                  >
                    <SelectValue placeholder="All Warehouses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Warehouses</SelectItem>
                    {warehouses.map((w) => (
                      <SelectItem key={w.name} value={w.name}>
                        {w.name} ({w.productCount})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Filter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 z-10" />
              </div>

              <Select
                value={typeFilter || '__all__'}
                onValueChange={(val) => {
                  setTypeFilter(val === '__all__' ? '' : val)
                  setPage(1)
                }}
              >
                <SelectTrigger
                  aria-label="Type filter"
                  className="h-9 pl-3.5 pr-8 w-auto gap-2 rounded-xl bg-slate-100/75 hover:bg-slate-100 border border-slate-200/70 text-xs sm:text-sm font-medium text-slate-700 shrink-0 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50"
                >
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Types</SelectItem>
                  <SelectItem value="IN">Inbound (IN)</SelectItem>
                  <SelectItem value="OUT">Outbound (OUT)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex items-center justify-end shrink-0">
            <Button
              type="button"
              onClick={openMovementDialog}
              disabled={!canWrite}
              title={noRoleTitle}
              className="h-9 px-3.5 rounded-xl text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-sm"
            >
              <Plus size={14} />
              Record Movement
            </Button>
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
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setSearchInput('')
                    setWarehouseFilter('')
                    setTypeFilter('')
                    setPage(1)
                  }}
                  className="h-auto p-0 text-xs font-semibold text-primary"
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-left border-collapse">
                <TableHeader className="bg-surface-muted border-b border-border-default">
                  <TableRow className="hover:bg-transparent border-0">
                    <TableHead className="px-5 py-3 text-[11px] font-bold text-muted uppercase tracking-wider text-left rtl:text-right">
                      Timestamp
                    </TableHead>
                    <TableHead className="px-5 py-3 text-[11px] font-bold text-muted uppercase tracking-wider text-left rtl:text-right">
                      Product
                    </TableHead>
                    <TableHead className="px-5 py-3 text-[11px] font-bold text-muted uppercase tracking-wider text-left rtl:text-right">
                      Warehouse
                    </TableHead>
                    <TableHead className="px-5 py-3 text-[11px] font-bold text-muted uppercase tracking-wider text-left rtl:text-right">
                      Type
                    </TableHead>
                    <TableHead className="px-5 py-3 text-[11px] font-bold text-muted uppercase tracking-wider text-right rtl:text-left">
                      Quantity
                    </TableHead>
                    <TableHead className="px-5 py-3 text-[11px] font-bold text-muted uppercase tracking-wider text-left rtl:text-right">
                      Note / Reference
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border-subtle">
                  {movements.map((movement) => {
                    const isIn = movement.delta > 0
                    return (
                      <TableRow key={movement.id} className="hover:bg-surface-muted/50 transition-colors border-0">
                        <TableCell className="px-5 py-3.5 text-xs text-body whitespace-nowrap">
                          {formatDate(movement.createdAt, { includeTime: true })}
                        </TableCell>
                        <TableCell className="px-5 py-3.5 text-xs font-semibold text-heading">
                          {movement.productName}
                        </TableCell>
                        <TableCell className="px-5 py-3.5 text-xs text-body">
                          {movement.warehouse ? (
                            <Badge variant="outline" className="px-2 py-0.5 rounded text-[11px] font-medium bg-surface-muted text-heading border-border-default">
                              {movement.warehouse}
                            </Badge>
                          ) : (
                            <span className="text-muted">No warehouse</span>
                          )}
                        </TableCell>
                        <TableCell className="px-5 py-3.5 whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                              isIn
                                ? 'bg-success-light text-success-text border-success-border'
                                : 'bg-danger-light text-danger border-danger-border'
                            }`}
                          >
                            {isIn ? <ArrowDownLeft size={10} /> : <ArrowUpRight size={10} />}
                            {movement.type || (isIn ? 'IN' : 'OUT')}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={`px-5 py-3.5 text-xs font-bold tabular-nums text-right rtl:text-left ${
                            isIn ? 'text-success-text' : 'text-danger'
                          }`}
                        >
                          {isIn ? '+' : '−'}
                          {Math.abs(movement.delta).toLocaleString()}
                        </TableCell>
                        <TableCell className="px-5 py-3.5 text-xs text-body max-w-xs truncate" title={movement.note || ''}>
                          {movement.note || <MissingValue label={EMPTY.note} />}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Table Footer / Pagination */}
          <div className="px-5 py-3 bg-surface-muted/50 border-t border-border-default flex items-center justify-between">
            <span className="text-xs text-muted">
              Page {pagination.page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
                className="h-7 w-7 text-heading"
                aria-label="Previous page"
              >
                <ChevronLeft size={14} />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
                className="h-7 w-7 text-heading"
                aria-label="Next page"
              >
                <ChevronRight size={14} />
              </Button>
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
        onConfirm={submitMovement}
        width="max-w-md"
      >
        <div className="space-y-4">
          {savedRetryAvailable && (
            <div role="status" className="flex items-start justify-between gap-3 rounded-input border border-accent/30 bg-accent/5 p-3 text-xs text-body">
              <span>
                A previous request may have reached the server before its response was lost. Retry unchanged to
                reuse its request key; changing details creates a new request.
              </span>
              <Button
                variant="link"
                size="sm"
                type="button"
                onClick={discardSavedRetry}
                className="h-auto p-0 font-semibold text-accent hover:underline shrink-0"
              >
                Discard saved retry
              </Button>
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-heading mb-1.5">Product</label>
            <Input
              type="search"
              value={productSearchInput}
              onChange={(event) => setProductSearchInput(event.target.value)}
              placeholder="Search products by name or SKU..."
              aria-label="Search products"
              className="mb-2 w-full text-sm bg-surface-raised"
            />
            <Select
              value={movementForm.productId || '__none__'}
              onValueChange={(val) => {
                const prodId = val === '__none__' ? '' : val
                const product = productOptions.find((item) => item.id === prodId) ?? null
                setSelectedProduct(product)
                setMovementForm((f) => ({ ...f, productId: prodId }))
              }}
            >
              <SelectTrigger aria-label="Product" className="w-full text-sm bg-surface-raised">
                <SelectValue placeholder="Select a product..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select a product...</SelectItem>
                {productOptions.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name} ({product.sku}): {product.stock} on hand
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {productPagination && productPagination.pages > 1 && <div className="mt-2 flex items-center justify-between text-xs text-muted">
              <span>{productPagination.total.toLocaleString()} matching products · page {productPage} of {productPagination.pages}</span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" aria-label="Previous product page" disabled={productPage <= 1} onClick={() => setProductPage((current) => Math.max(1, current - 1))} className="h-7 px-2 text-xs">Previous</Button>
                <Button type="button" variant="outline" size="sm" aria-label="Next product page" disabled={productPage >= productPagination.pages} onClick={() => setProductPage((current) => Math.min(productPagination.pages, current + 1))} className="h-7 px-2 text-xs">Next</Button>
              </div>
            </div>}
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
                  onChange={() => setMovementForm((f) => ({ ...f, kind: 'receive', reason: 'PURCHASE_RECEIPT' }))}
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
                  onChange={() => setMovementForm((f) => ({ ...f, kind: 'issue', reason: 'SALE' }))}
                  className="accent-primary"
                />
                Issue (Outbound)
              </label>
            </div>
          </div>

          {valuationConfigured && (
            <>
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">
                  {movementForm.kind === 'receive' ? 'Unit Cost' : 'Reason'}
                </label>
                {movementForm.kind === 'receive' && (
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={movementForm.unitCost}
                    onChange={(e) => setMovementForm((f) => ({ ...f, unitCost: e.target.value }))}
                    placeholder="e.g. 12.50"
                    aria-label="Unit cost"
                    className="mb-2 w-full text-sm bg-surface-raised"
                  />
                )}
                <Select
                  value={movementForm.reason}
                  onValueChange={(value) => setMovementForm((f) => ({ ...f, reason: value }))}
                >
                  <SelectTrigger aria-label="Movement reason" className="w-full text-sm bg-surface-raised">
                    <SelectValue placeholder="Select a reason..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(movementForm.kind === 'receive' ? RECEIPT_REASONS : ISSUE_REASONS).map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-[11px] text-muted">
                  {movementForm.kind === 'receive'
                    ? 'The exact acquisition cost per unit. The selling price is never used as cost.'
                    : 'The reason decides whether cost leaves through cost of goods sold, shrinkage, or a supplier return.'}
                </p>
              </div>

              <div className="rounded-input border border-info-border bg-info-light px-3 py-2 text-[11px] text-info">
                Inventory valuation is configured. This movement will post to the mapped inventory and offset accounts in the ledger.
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-bold text-heading mb-1.5">Quantity</label>
            <Input
              type="number"
              min="1"
              step="1"
              required
              value={movementForm.quantity}
              onChange={(e) => setMovementForm((f) => ({ ...f, quantity: e.target.value }))}
              placeholder="1"
              className="w-full text-sm bg-surface-raised"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-heading mb-1.5">Note / Reference (Optional)</label>
            <Input
              type="text"
              value={movementForm.note}
              onChange={(e) => setMovementForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="e.g. PO-2026-081 or Customer order fulfillment"
              className="w-full text-sm bg-surface-raised"
            />
          </div>
        </div>
      </FormDialog>
    </div>
  )
}

