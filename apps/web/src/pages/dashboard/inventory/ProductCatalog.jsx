import React, { useState, useEffect } from 'react';
import {
  Search,
  Bell,
  Sun,
  LayoutGrid,
  Filter,
  X,
  AlertTriangle,
  ShoppingCart,
  Loader2,
  Box,
  Pencil,
  ArrowDownUp,
  Check
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '../../../lib/api/inventory';
import { queryKeys } from '../../../lib/queryKeys';
import { formatMoney, formatDate } from '../../../lib/format';
import { useActiveMemberRole } from '../../../lib/authClient';
import FormDialog from '../../../components/common/FormDialog';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import TopBarActions from '../../../components/TopBarActions';

export default function Inventory() {
  const [selectedId, setSelectedId] = useState(null);
  const [manualDeselect, setManualDeselect] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [purchaseOrderOpen, setPurchaseOrderOpen] = useState(false);
  const [purchaseQuantity, setPurchaseQuantity] = useState('1');
  const [purchaseOrderError, setPurchaseOrderError] = useState('');
  const [createdOrder, setCreatedOrder] = useState(null);

  // Debounce the top-bar search into the list query's `search` param.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.inventory.products.list({ search: search || undefined, status: stockFilter || undefined, archived: showArchived, limit: 100 }),
    queryFn: () => inventoryApi.listProducts({ search: search || undefined, status: stockFilter || undefined, archived: showArchived, limit: 100 }),
  });

  const products = data?.items ?? [];

  // Auto-select the first product once the list lands (and the user hasn't dismissed it).
  useEffect(() => {
    if (!manualDeselect && selectedId == null && products.length > 0) {
      setSelectedId(products[0].id);
    }
  }, [products, selectedId, manualDeselect]);

  const selectedProduct = products.find(p => p.id === selectedId);

  // History tab — real stock movements for the selected product (lazy, only while visible).
  const { data: movementData, isLoading: isMovementsLoading } = useQuery({
    queryKey: queryKeys.inventory.movements.list({ productId: selectedId, limit: 100 }),
    queryFn: () => inventoryApi.listStockMovements({ productId: selectedId, limit: 100 }),
    enabled: activeTab === 'history' && !!selectedProduct,
  });
  const movements = movementData?.items ?? [];
  const { data: suppliersData, isLoading: isSuppliersLoading, isError: isSuppliersError } = useQuery({
    queryKey: [...queryKeys.inventory.all(), 'productSuppliers', selectedId],
    queryFn: () => inventoryApi.listProductSuppliers(selectedId),
    enabled: activeTab === 'suppliers' && !!selectedProduct,
  });

  const queryClient = useQueryClient();
  const { data: activeMemberRole } = useActiveMemberRole();
  // Server requires ADMIN for every write (MEMBER gets 403). Gate the write controls so a
  // MEMBER sees them disabled rather than learning the rule from a rejected request.
  const canWrite = activeMemberRole === 'OWNER' || activeMemberRole === 'ADMIN';
  const noRoleTitle = 'Requires the ADMIN role';

  // ── Create / edit product dialog ─────────────────────────────────────────
  const [productDialog, setProductDialog] = useState({ open: false, mode: 'create', product: null });
  const [productForm, setProductForm] = useState({
    name: '',
    sku: '',
    price: '',
    stock: '',
    minThreshold: '',
    warehouse: '',
  });
  const [productError, setProductError] = useState('');

  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [movementForm, setMovementForm] = useState({ kind: 'receive', qty: '', note: '' });
  const [movementError, setMovementError] = useState('');
  // Server-side on-hand count after the last successful movement (newStock) — surfaced next
  // to the Adjust Stock button until the list refetch lands.
  const [freshStock, setFreshStock] = useState(null);

  const createProductMutation = useMutation({
    mutationFn: (body) => inventoryApi.createProduct(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all() });
      setProductDialog({ open: false, mode: 'create', product: null });
    },
    // Surface the server's message in the dialog rather than swallowing it.
    onError: (error) => setProductError(error?.message || 'Could not create product.'),
  });

  const updateProductMutation = useMutation({
    mutationFn: ({ id, patch }) => inventoryApi.updateProduct(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all() });
      setProductDialog({ open: false, mode: 'create', product: null });
    },
    onError: (error) => setProductError(error?.message || 'Could not save product.'),
  });

  const recordMovementMutation = useMutation({
    mutationFn: (body) => inventoryApi.recordStockMovement(body),
    onSuccess: (result) => {
      setFreshStock(typeof result?.newStock === 'number' ? result.newStock : null);
      setAdjustDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.products.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.movements.all() });
    },
    onError: (error) => setMovementError(error?.message || 'Could not record movement.'),
  });
  const purchaseOrderMutation = useMutation({
    mutationFn: () => inventoryApi.createPurchaseOrder({ productId: selectedProduct.id, quantity: Number(purchaseQuantity) }),
    onSuccess: order => {
      setCreatedOrder(order);
      setPurchaseOrderOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all() });
    },
    onError: error => setPurchaseOrderError(error?.message || 'Could not create purchase order.'),
  });
  const archiveMutation = useMutation({
    mutationFn: () => inventoryApi.setProductArchived(selectedProduct.id, !showArchived),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all() });
      setArchiveDialogOpen(false);
      setSelectedId(null);
      setManualDeselect(false);
    },
  });

  // Reset the transient on-hand override when a different product is inspected.
  useEffect(() => {
    setFreshStock(null);
  }, [selectedId]);

  const openCreateDialog = () => {
    setProductForm({ name: '', sku: '', price: '', stock: '', minThreshold: '', warehouse: '' });
    setProductError('');
    setProductDialog({ open: true, mode: 'create', product: null });
  };

  const openEditDialog = (product) => {
    setProductForm({
      name: product?.name ?? '',
      sku: product?.sku ?? '',
      price: product?.price ?? '',
      // stock is not editable on update (it changes only through stock movements) — but the
      // form still carries a key so the shared shape stays stable; it is never rendered or sent.
      stock: String(product?.stock ?? ''),
      minThreshold: product?.minThreshold != null ? String(product.minThreshold) : '',
      warehouse: product?.warehouse ?? '',
    });
    setProductError('');
    setProductDialog({ open: true, mode: 'edit', product });
  };

  const closeProductDialog = () => {
    if (createProductMutation.isPending || updateProductMutation.isPending) return;
    setProductDialog({ open: false, mode: 'create', product: null });
    setProductError('');
  };

  const isProductBusy = createProductMutation.isPending || updateProductMutation.isPending;

  const handleProductConfirm = () => {
    const isCreate = productDialog.mode === 'create';

    const name = productForm.name.trim();
    const sku = productForm.sku.trim();
    if (!name || !sku) {
      setProductError('Name and SKU are required.');
      return;
    }

    const num = (value) => {
      const trimmed = String(value).trim();
      if (trimmed === '') return null;
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : NaN;
    };

    const body = {};
    if (name) body.name = name;
    if (sku) body.sku = sku;
    // price is a major-unit decimal string — kept verbatim from the input (never a float).
    const price = String(productForm.price).trim();
    if (price !== '') body.price = price;

    if (isCreate) {
      if (productForm.stock !== '' && Number.isInteger(num(productForm.stock))) {
        body.stock = num(productForm.stock);
      }
    }
    if (productForm.minThreshold !== '' && Number.isInteger(num(productForm.minThreshold))) {
      body.minThreshold = num(productForm.minThreshold);
    }
    // Empty warehouse sends null (clears the location) — the schema accepts a nullable string.
    body.warehouse = productForm.warehouse.trim() === '' ? null : productForm.warehouse.trim();

    // Client-side range guard: the contract rejects negatives/non-integers, so surface it
    // inline instead of waiting for a 400 — or silently dropping the field from the body.
    // (Number.isInteger is false for NaN, so this also covers unparsable input.)
    if (isCreate && productForm.stock !== '') {
      const stockN = num(productForm.stock);
      if (!Number.isInteger(stockN) || stockN < 0) {
        setProductError('Initial stock must be a whole number of 0 or more.');
        return;
      }
    }
    if (productForm.minThreshold !== '') {
      const minN = num(productForm.minThreshold);
      if (!Number.isInteger(minN) || minN < 0) {
        setProductError('Minimum threshold must be a whole number of 0 or more.');
        return;
      }
    }

    if (isCreate) {
      createProductMutation.mutate(body);
    } else {
      updateProductMutation.mutate({ id: productDialog.product?.id, patch: body });
    }
  };

  const openAdjustDialog = () => {
    setMovementForm({ kind: 'receive', qty: '', note: '' });
    setMovementError('');
    setAdjustDialogOpen(true);
  };

  const closeAdjustDialog = () => {
    if (recordMovementMutation.isPending) return;
    setAdjustDialogOpen(false);
    setMovementError('');
  };

  const handleMovementConfirm = () => {
    if (!selectedProduct) return;
    const qtyN = Number(String(movementForm.qty).trim());
    if (!Number.isInteger(qtyN) || qtyN <= 0) {
      setMovementError('Quantity must be a whole number greater than 0.');
      return;
    }
    // The contract keeps stock non-negative (`stock: z.int().min(0)`); the server does not
    // clamp an over-issue, so surface it here instead of recording a negative on-hand count.
    if (movementForm.kind === 'issue' && qtyN > selectedProduct.stock) {
      setMovementError(`Only ${selectedProduct.stock} unit${selectedProduct.stock === 1 ? '' : 's'} on hand — cannot issue ${qtyN}.`);
      return;
    }
    recordMovementMutation.mutate({
      productId: selectedProduct.id,
      delta: movementForm.kind === 'receive' ? qtyN : -qtyN,
      note: movementForm.note.trim() === '' ? null : movementForm.note.trim(),
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center bg-surface text-danger">
        Failed to load product catalog.
      </div>
    );
  }

  const selectProduct = (id) => {
    setSelectedId(id);
    setManualDeselect(false);
  };

  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden min-w-[1000px]">

      <TopBarActions>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search..."
              className="pl-9 pr-12 py-1.5 text-sm border border-border-default rounded-input bg-surface-raised w-72 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          <button className="text-muted hover:text-heading transition-colors">
            <Bell size={18} />
          </button>
          <button className="text-muted hover:text-heading transition-colors">
            <Sun size={18} />
          </button>
          <button className="text-muted hover:text-heading transition-colors">
            <LayoutGrid size={18} />
          </button>

          <button
            onClick={openCreateDialog}
            disabled={!canWrite}
            title={canWrite ? undefined : noRoleTitle}
            className="bg-primary text-white px-4 py-1.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60"
          >
            New Product
          </button>
        </div>
      </TopBarActions>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: Product Catalog Area */}
        <div className="flex-1 overflow-y-auto p-8 flex flex-col">

          {/* Section Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-heading">Product Catalog</h1>
            <div className="flex items-center gap-3">
            <select value={showArchived ? 'archived' : 'active'} onChange={event => setShowArchived(event.target.value === 'archived')} aria-label="Show active or archived products" className="border border-border-default bg-surface-raised text-body px-3 py-2 rounded-input text-sm font-medium shadow-card">
              <option value="active">Active products</option>
              <option value="archived">Archived products</option>
            </select>
            <div className="relative">
              <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <select value={stockFilter} onChange={event => setStockFilter(event.target.value)} aria-label="Filter products by stock status" className="appearance-none border border-border-default bg-surface-raised text-body pl-9 pr-4 py-2 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors shadow-card">
                <option value="">All Stock</option>
                <option value="IN_STOCK">In Stock</option>
                <option value="LOW_STOCK">Low Stock</option>
                <option value="OUT_OF_STOCK">Out of Stock</option>
              </select>
            </div>
            </div>
          </div>

          {/* Catalog Table */}
          <div className="bg-surface-raised border border-border-default rounded-button shadow-card overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-muted/80 border-b border-border-default">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">Product</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">SKU</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider text-right">Price</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-8 text-center text-sm text-muted">
                      No products found.
                    </td>
                  </tr>
                ) : (
                  products.map(product => {
                    const isSelected = selectedId === product.id;
                    const isLowStock = product.status === 'LOW_STOCK' || product.status === 'OUT_OF_STOCK';

                    return (
                      <tr
                        key={product.id}
                        onClick={() => selectProduct(product.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-accent-light/30 border-l-2 border-l-blue-600' : 'bg-surface-raised hover:bg-surface-muted border-l-2 border-l-transparent'
                        }`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded border border-border-default bg-surface-muted flex items-center justify-center shrink-0">
                              <Box size={18} className="text-body-light" />
                            </div>
                            <span className="text-sm font-semibold text-heading">{product.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-body-light">
                          {product.sku}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-heading tabular-nums text-right">
                          {formatMoney(product.price)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`inline-flex px-2.5 py-1 rounded text-xs font-semibold ${
                            isLowStock
                              ? 'bg-danger-light text-danger border border-danger-border'
                              : 'bg-success-light text-success-text border border-[#bbf7d0]'
                          }`}>
                            {product.stock} {product.status.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Detail Panel */}
        <div className="w-[420px] bg-surface-raised border-l border-border-default flex flex-col flex-shrink-0">

          {selectedProduct ? (
            <>
              {/* Detail Header */}
              <div className="p-6 border-b border-border-default">
                <div className="flex items-start justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-surface-active rounded-button flex items-center justify-center border border-border-default">
                      <Box size={24} className="text-body-light" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-heading">{selectedProduct.name}</h2>
                      <p className="text-sm text-muted mt-0.5">SKU: {selectedProduct.sku}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setSelectedId(null); setManualDeselect(true); }}
                    className="text-caption hover:text-body transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                {selectedProduct.archivedAt && <p className="mb-4 rounded-button bg-surface-muted px-3 py-2 text-xs font-semibold text-muted">Archived {formatDate(selectedProduct.archivedAt)}</p>}

                {/* Tabs */}
                <div className="flex items-center gap-6">
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`pb-2 text-sm transition-colors ${
                      activeTab === 'overview'
                        ? 'font-bold text-heading border-b-2 border-black'
                        : 'font-medium text-muted hover:text-heading'
                    }`}
                  >
                    Overview
                  </button>
                  <button
                    onClick={() => setActiveTab('suppliers')}
                    className={`pb-2 text-sm transition-colors ${activeTab === 'suppliers' ? 'font-bold text-heading border-b-2 border-black' : 'font-medium text-muted hover:text-heading'}`}
                  >
                    Suppliers
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`pb-2 text-sm transition-colors ${
                      activeTab === 'history'
                        ? 'font-bold text-heading border-b-2 border-black'
                        : 'font-medium text-muted hover:text-heading'
                    }`}
                  >
                    History
                  </button>
                </div>
              </div>

              {/* Detail Content Area */}
              {activeTab === 'overview' ? (
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                  {/* Stock Alert */}
                  {(selectedProduct.status === 'LOW_STOCK' || selectedProduct.status === 'OUT_OF_STOCK') && (
                    <div className="bg-danger-light border border-danger-border rounded-button p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle size={16} className="text-danger" />
                        <h3 className="text-xs font-bold text-danger-hover uppercase tracking-wide">Stock Alert</h3>
                      </div>
                      <p className="text-sm text-[#991b1b] ml-6 leading-relaxed">
                        Current stock ({selectedProduct.stock}) is {selectedProduct.stock === 0 ? 'empty' : `below minimum threshold (${selectedProduct.minThreshold})`}. Action required.
                      </p>
                    </div>
                  )}

                  {/* Form Fields (Read Only styling) */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-muted mb-1.5">Unit Price</label>
                      <div className="w-full bg-surface-muted border border-border-default rounded-input px-3 py-2.5 text-sm font-medium text-heading">
                        {formatMoney(selectedProduct.price)}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted mb-1.5">Location</label>
                      <div className="w-full bg-surface-muted border border-border-default rounded-input px-3 py-2.5 text-sm font-medium text-heading">
                        {selectedProduct.warehouse ? `${selectedProduct.warehouse} - Aisle ${selectedProduct.aisle || 'N/A'}, Bin ${selectedProduct.bin || 'N/A'}` : 'Location Not Set'}
                      </div>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="border border-border-default rounded-button p-4 bg-surface-raised">
                      <p className="text-[11px] font-medium text-muted mb-1">Avg. Monthly Usage</p>
                      <p className="text-lg font-bold text-heading">{selectedProduct.avgMonthlyUsage || 0} Units</p>
                    </div>
                    <div className="border border-border-default rounded-button p-4 bg-surface-raised">
                      <p className="text-[11px] font-medium text-muted mb-1">Lead Time</p>
                      <p className="text-lg font-bold text-heading">{selectedProduct.leadTimeDays || 0} Days</p>
                    </div>
                  </div>
                </div>
              ) : activeTab === 'suppliers' ? (
                <div className="flex-1 overflow-y-auto p-6">
                  {isSuppliersLoading ? <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-muted" size={20} /></div> : isSuppliersError ? <p className="text-sm text-danger">Suppliers could not be loaded.</p> : (suppliersData?.items ?? []).length === 0 ? <div className="flex h-full items-center justify-center text-sm text-muted text-center">No suppliers are linked to this product yet.</div> : <ul className="space-y-3">{suppliersData.items.map(supplier => <li key={supplier.id} className="rounded-button border border-border-default bg-surface-muted px-4 py-3 text-sm font-semibold text-heading">{supplier.name}</li>)}</ul>}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-6">
                  {/* History: real stock movements for this product */}
                  {isMovementsLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="animate-spin text-muted" size={20} />
                    </div>
                  ) : movements.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted">
                      No stock movements recorded.
                    </div>
                  ) : (
                    <div className="bg-surface-raised border border-border-default rounded-button shadow-card overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-surface-muted/80 border-b border-border-default">
                          <tr>
                            <th className="px-4 py-3 text-[10px] font-bold text-muted uppercase tracking-wider">Date</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-muted uppercase tracking-wider">Type</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-muted uppercase tracking-wider text-right">Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                          {movements.map(movement => {
                            const isIn = movement.type === 'IN';
                            return (
                              <tr key={movement.id}>
                                <td className="px-4 py-3 text-xs text-body-light">
                                  <div className="font-medium text-heading">{formatDate(movement.createdAt)}</div>
                                  {movement.note && <div className="text-caption truncate max-w-[180px]" title={movement.note}>{movement.note}</div>}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    isIn
                                      ? 'bg-success-light text-success-text border border-success-border'
                                      : 'bg-danger-light text-danger border border-danger-border'
                                  }`}>
                                    {isIn ? 'IN' : 'OUT'}
                                  </span>
                                </td>
                                <td className={`px-4 py-3 text-xs font-semibold tabular-nums text-right ${isIn ? 'text-success-text' : 'text-danger'}`}>
                                  {isIn ? '+' : '−'}{Math.abs(movement.delta)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Sticky Footer */}
              <div className="p-6 border-t border-border-default bg-surface-raised mt-auto">
                {/* Transient confirmation: shows the server's post-movement count until the
                    refetch has synced the list (at which point it equals the displayed stock). */}
                {freshStock != null && freshStock !== selectedProduct.stock && (
                  <div className="flex items-center justify-center gap-1.5 mb-3 text-xs font-semibold text-success-text">
                    <Check size={14} /> On hand: {freshStock} units
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => openEditDialog(selectedProduct)}
                    disabled={!canWrite}
                    title={canWrite ? undefined : noRoleTitle}
                    className="flex items-center justify-center gap-2 border border-border-default bg-surface-raised text-body px-4 py-2.5 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors shadow-card disabled:opacity-60"
                  >
                    <Pencil size={15} /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={openAdjustDialog}
                    disabled={!canWrite || Boolean(selectedProduct.archivedAt)}
                    title={selectedProduct.archivedAt ? 'Restore this product before adjusting stock' : canWrite ? undefined : noRoleTitle}
                    className="flex items-center justify-center gap-2 bg-primary text-white px-4 py-2.5 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60"
                  >
                    <ArrowDownUp size={15} /> Adjust Stock
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => { setPurchaseQuantity('1'); setPurchaseOrderError(''); setPurchaseOrderOpen(true); }}
                  disabled={!canWrite || Boolean(selectedProduct.archivedAt)}
                  title={selectedProduct.archivedAt ? 'Restore this product before creating an order' : canWrite ? undefined : noRoleTitle}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-input text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60"
                >
                  <ShoppingCart size={16} />
                  Create Purchase Order
                </button>
                <button type="button" onClick={() => setArchiveDialogOpen(true)} disabled={!canWrite || archiveMutation.isPending} title={canWrite ? undefined : noRoleTitle} className="mt-3 w-full rounded-input border border-border-default py-2 text-sm font-semibold text-body hover:bg-surface-muted disabled:opacity-60">
                  {showArchived ? 'Restore Product' : 'Archive Product'}
                </button>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-muted">
              Select a product to view details.
            </div>
          )}

        </div>

        {/* ── New / Edit Product dialog ── */}
        <FormDialog
          open={productDialog.open}
          onClose={closeProductDialog}
          title={productDialog.mode === 'create' ? 'New product' : 'Edit product'}
          subtitle={
            productDialog.mode === 'create'
              ? 'Add a product to the catalog.'
              : 'Stock on hand is changed via Adjust Stock, not here.'
          }
          confirmLabel={productDialog.mode === 'create' ? 'Create product' : 'Save changes'}
          busy={isProductBusy}
          onConfirm={handleProductConfirm}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-heading mb-1.5">Name</label>
              <input
                type="text"
                value={productForm.name}
                onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Product name"
                className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-heading mb-1.5">SKU</label>
              <input
                type="text"
                value={productForm.sku}
                onChange={(e) => setProductForm((f) => ({ ...f, sku: e.target.value }))}
                placeholder="e.g. WIDGET-001"
                className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Price</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={productForm.price}
                  onChange={(e) => setProductForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="0.00"
                  className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Min threshold</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={productForm.minThreshold}
                  onChange={(e) => setProductForm((f) => ({ ...f, minThreshold: e.target.value }))}
                  placeholder="0"
                  className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>
            {productDialog.mode === 'create' && (
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Initial stock</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={productForm.stock}
                  onChange={(e) => setProductForm((f) => ({ ...f, stock: e.target.value }))}
                  placeholder="0"
                  className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-heading mb-1.5">Warehouse</label>
              <input
                type="text"
                value={productForm.warehouse}
                onChange={(e) => setProductForm((f) => ({ ...f, warehouse: e.target.value }))}
                placeholder="e.g. Main — Bay A (optional)"
                className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            {productError && (
              <p className="text-sm text-danger flex items-center gap-1.5">
                <AlertTriangle size={14} /> {productError}
              </p>
            )}
          </div>
        </FormDialog>

        <FormDialog open={purchaseOrderOpen} onClose={() => !purchaseOrderMutation.isPending && setPurchaseOrderOpen(false)} title="Create purchase order" subtitle={selectedProduct ? `Create a draft order for ${selectedProduct.name}.` : undefined} busy={purchaseOrderMutation.isPending} onConfirm={() => {
          const quantity = Number(purchaseQuantity);
          if (!Number.isSafeInteger(quantity) || quantity < 1) { setPurchaseOrderError('Quantity must be a whole number greater than 0.'); return; }
          setPurchaseOrderError('');
          purchaseOrderMutation.mutate();
        }} confirmLabel="Create draft order">
          <label className="block text-sm font-medium text-body">Quantity<input type="number" min={1} step={1} value={purchaseQuantity} onChange={event => setPurchaseQuantity(event.target.value)} className="mt-1 w-full rounded-input border border-border-default px-3 py-2" /></label>
          {purchaseOrderError && <p role="alert" className="mt-3 text-sm text-danger">{purchaseOrderError}</p>}
        </FormDialog>
        <ConfirmDialog open={archiveDialogOpen} onClose={() => !archiveMutation.isPending && setArchiveDialogOpen(false)} onConfirm={() => archiveMutation.mutate()} title={showArchived ? 'Restore product?' : 'Archive product?'} description={showArchived ? `Restore ${selectedProduct?.name || 'this product'} to the active catalog?` : `Archive ${selectedProduct?.name || 'this product'}? Its stock history and purchase order records will be retained.`} confirmLabel={showArchived ? 'Restore product' : 'Archive product'} busy={archiveMutation.isPending} />
        {createdOrder && <div role="status" className="fixed bottom-4 right-4 z-40 rounded-button border border-success-border bg-success-light px-4 py-3 text-sm text-success-text shadow-card">Draft purchase order created for {createdOrder.quantity} × {createdOrder.productName}.</div>}

        {/* ── Adjust Stock (movement) dialog ── */}
        <FormDialog
          open={adjustDialogOpen}
          onClose={closeAdjustDialog}
          title="Adjust stock"
          subtitle={selectedProduct ? `${selectedProduct.name} — currently ${selectedProduct.stock} on hand.` : undefined}
          confirmLabel="Record movement"
          busy={recordMovementMutation.isPending}
          onConfirm={handleMovementConfirm}
          width="max-w-md"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-heading mb-1.5">Movement type</label>
              <div className="grid grid-cols-2 gap-3">
                <label
                  className={`flex items-center gap-2 border rounded-input px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                    movementForm.kind === 'receive'
                      ? 'border-success-border bg-success-light text-success-text'
                      : 'border-border-default bg-surface-raised text-body hover:bg-surface-muted'
                  }`}
                >
                  <input
                    type="radio"
                    name="movement-kind"
                    value="receive"
                    checked={movementForm.kind === 'receive'}
                    onChange={() => setMovementForm((f) => ({ ...f, kind: 'receive' }))}
                    className="accent-primary"
                  />
                  Receive stock
                </label>
                <label
                  className={`flex items-center gap-2 border rounded-input px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                    movementForm.kind === 'issue'
                      ? 'border-danger-border bg-danger-light text-danger'
                      : 'border-border-default bg-surface-raised text-body hover:bg-surface-muted'
                  }`}
                >
                  <input
                    type="radio"
                    name="movement-kind"
                    value="issue"
                    checked={movementForm.kind === 'issue'}
                    onChange={() => setMovementForm((f) => ({ ...f, kind: 'issue' }))}
                    className="accent-primary"
                  />
                  Issue stock
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-heading mb-1.5">Quantity</label>
              <input
                type="number"
                min={1}
                step={1}
                value={movementForm.qty}
                onChange={(e) => setMovementForm((f) => ({ ...f, qty: e.target.value }))}
                placeholder="0"
                className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-heading mb-1.5">Note</label>
              <input
                type="text"
                value={movementForm.note}
                onChange={(e) => setMovementForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="e.g. PO #4521 receipt (optional)"
                className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            {movementError && (
              <p className="text-sm text-danger flex items-center gap-1.5">
                <AlertTriangle size={14} /> {movementError}
              </p>
            )}
          </div>
        </FormDialog>
      </div>
    </div>
  );
}
