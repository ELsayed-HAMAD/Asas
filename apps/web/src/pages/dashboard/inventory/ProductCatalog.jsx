import React, { useState, useEffect } from 'react';
import {
  Search,
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
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '../../../lib/api/inventory';
import { queryKeys } from '../../../lib/queryKeys';
import { formatCompactNumber, formatCompactTableMoney, formatMoney, formatDate } from '../../../lib/format';
import { useActiveMemberRole } from '../../../lib/authClient';
import { getMemberRoleName } from '../../../lib/memberRole';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import FormDialog from '../../../components/common/FormDialog';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import TopBarActions from '../../../components/TopBarActions';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/table';

export default function Inventory() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [manualDeselect, setManualDeselect] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [movementPage, setMovementPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  // Debounce the top-bar search into the list query's `search` param (shared helper).
  const search = useDebouncedValue(searchInput);
  const [stockFilter, setStockFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [productPage, setProductPage] = useState(1);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [purchaseOrderOpen, setPurchaseOrderOpen] = useState(false);
  const [purchaseQuantity, setPurchaseQuantity] = useState('1');
  const [purchaseOrderError, setPurchaseOrderError] = useState('');
  const [createdOrder, setCreatedOrder] = useState(null);

  useEffect(() => {
    if (!createdOrder) return;
    const timer = setTimeout(() => setCreatedOrder(null), 5000);
    return () => clearTimeout(timer);
  }, [createdOrder]);


  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.inventory.products.list({ page: productPage, search: search || undefined, status: stockFilter || undefined, archived: showArchived, limit: 25 }),
    queryFn: () => inventoryApi.listProducts({ page: productPage, search: search || undefined, status: stockFilter || undefined, archived: showArchived, limit: 25 }),
    placeholderData: keepPreviousData,
  });
  useEffect(() => setProductPage(1), [search, stockFilter, showArchived]);
  useEffect(() => {
    const pages = data?.pagination?.pages;
    if (pages === undefined) return;
    if (pages === 0 && productPage !== 1) setProductPage(1);
    else if (pages > 0 && productPage > pages) setProductPage(pages);
  }, [data?.pagination?.pages, productPage]);

  const products = data?.items ?? [];

  // Auto-select the first product once the list lands (and the user hasn't dismissed it).
  useEffect(() => {
    if (products.length > 0 && (!manualDeselect && selectedId == null || selectedId && !products.some(product => product.id === selectedId))) {
      setSelectedId(products[0].id);
      setManualDeselect(false);
    }
  }, [products, selectedId, manualDeselect]);

  const selectedProduct = products.find(p => p.id === selectedId);

  // History tab — real stock movements for the selected product (lazy, only while visible).
  useEffect(() => setMovementPage(1), [selectedId]);
  const { data: movementData, isLoading: isMovementsLoading, isError: isMovementsError, error: movementsError, refetch: refetchMovements } = useQuery({
    queryKey: queryKeys.inventory.movements.list({ productId: selectedId, page: movementPage, limit: 25 }),
    queryFn: () => inventoryApi.listStockMovements({ productId: selectedId, page: movementPage, limit: 25 }),
    enabled: activeTab === 'history' && !!selectedProduct,
  });
  useEffect(() => {
    const pages = movementData?.pagination?.pages;
    if (pages === undefined) return;
    if (pages === 0 && movementPage !== 1) setMovementPage(1);
    else if (pages > 0 && movementPage > pages) setMovementPage(pages);
  }, [movementData?.pagination?.pages, movementPage]);
  const movements = movementData?.items ?? [];
  const movementSummary = movementData?.summary;
  const { data: suppliersData, isLoading: isSuppliersLoading, isError: isSuppliersError } = useQuery({
    queryKey: [...queryKeys.inventory.all(), 'productSuppliers', selectedId],
    queryFn: () => inventoryApi.listProductSuppliers(selectedId),
    enabled: activeTab === 'suppliers' && !!selectedProduct,
  });
  const { data: ordersData, isLoading: isOrdersLoading, isError: isOrdersError } = useQuery({
    queryKey: queryKeys.inventory.purchaseOrders.list({ productId: selectedId }),
    queryFn: () => inventoryApi.listPurchaseOrders({ productId: selectedId }),
    enabled: activeTab === 'orders' && !!selectedProduct,
  });
  const purchaseOrders = ordersData?.items ?? [];

  const queryClient = useQueryClient();
  const { data: activeMemberRole } = useActiveMemberRole();
  // Server requires ADMIN for every write (MEMBER gets 403). Gate the write controls so a
  // MEMBER sees them disabled rather than learning the rule from a rejected request.
  const canWrite = ['OWNER', 'ADMIN'].includes(getMemberRoleName(activeMemberRole));
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
  const approveOrderMutation = useMutation({
    mutationFn: (orderId) => inventoryApi.approvePurchaseOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all() });
    },
  });
  const receiveOrderMutation = useMutation({
    mutationFn: (orderId) => inventoryApi.receivePurchaseOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all() });
    },
  });

  const [newSupplierName, setNewSupplierName] = useState('');
  const [supplierError, setSupplierError] = useState('');

  const addSupplierMutation = useMutation({
    mutationFn: (name) => inventoryApi.addProductSupplier(selectedProduct?.id, name),
    onSuccess: () => {
      setNewSupplierName('');
      setSupplierError('');
      queryClient.invalidateQueries({ queryKey: [...queryKeys.inventory.all(), 'productSuppliers', selectedId] });
    },
    onError: (err) => setSupplierError(err?.message || 'Could not add supplier.'),
  });

  const removeSupplierMutation = useMutation({
    mutationFn: (supplierId) => inventoryApi.removeProductSupplier(selectedProduct?.id, supplierId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.inventory.all(), 'productSuppliers', selectedId] });
    },
    onError: (err) => setSupplierError(err?.message || 'Could not remove supplier.'),
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

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openCreateDialog();
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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
    <div className="flex-1 min-h-0 flex flex-col bg-surface overflow-hidden min-w-0">

      <TopBarActions>
        <Button
          type="button"
          onClick={openCreateDialog}
          disabled={!canWrite}
          title={canWrite ? undefined : noRoleTitle}
          className="h-9 px-4 font-semibold shadow-sm"
        >
          New Product
        </Button>
      </TopBarActions>

      {/* ── Main Split View ── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 min-[1100px]:grid-cols-[1fr_400px] gap-4 p-4 min-[1100px]:p-6 min-[1100px]:overflow-hidden overflow-y-auto items-stretch">

        {/* Left: Product Catalog List Pane */}
        <div data-testid="product-list-pane" className="flex-1 min-w-0 flex flex-col min-h-0">

          {/* List Pane Header (Toolbar row, directly above the table) */}
          <div data-testid="product-list-header" className="flex flex-wrap min-[900px]:flex-nowrap items-center gap-2 mb-4 shrink-0 min-h-[36px]">
            <h1 className="sr-only">Product Catalog</h1>

            <div className="relative w-full min-[900px]:w-auto min-[900px]:flex-1 min-w-[200px] shrink-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-caption pointer-events-none" />
              <Input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search..."
                aria-label="Search products"
                className="w-full h-9 pl-9 pr-3 text-sm bg-surface-raised text-heading placeholder:text-caption shadow-card"
              />
            </div>

            <select
              value={showArchived ? 'archived' : 'active'}
              onChange={(event) => setShowArchived(event.target.value === 'archived')}
              aria-label="Show active or archived products"
              className="w-[150px] h-9 border border-border-default bg-surface-raised text-body px-3 rounded-input text-sm font-medium shadow-card focus:outline-none focus:ring-2 focus:ring-accent shrink-0 cursor-pointer"
            >
              <option value="active">Active products</option>
              <option value="archived">Archived products</option>
            </select>

            <div className="relative w-[110px] shrink-0">
              <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <select
                value={stockFilter}
                onChange={(event) => setStockFilter(event.target.value)}
                aria-label="Filter products by stock status"
                className="w-full h-9 appearance-none border border-border-default bg-surface-raised text-body pl-8 pr-3 rounded-input text-sm font-medium hover:bg-surface-muted transition-colors shadow-card focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
              >
                <option value="">All Stock</option>
                <option value="IN_STOCK">In Stock</option>
                <option value="LOW_STOCK">Low Stock</option>
                <option value="OUT_OF_STOCK">Out of Stock</option>
              </select>
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => navigate('/dashboard/inventory/movements')}
              title="Stock Movements"
              aria-label="Stock Movements"
              className="w-9 h-9 bg-surface-raised text-muted hover:text-heading shadow-card shrink-0"
            >
              <LayoutGrid size={16} />
            </Button>
          </div>

          {/* Table Card (fills the list pane height) */}
          <div data-testid="product-table-card" className="flex-1 min-h-0 bg-surface-raised border border-border-default rounded-card shadow-card flex flex-col overflow-hidden">
            {/* Rows area: flex: 1; min-height: 0; overflow-y: auto */}
            <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:thin]">
              <Table className="w-full table-fixed border-collapse">
                <colgroup>
                  <col className="min-w-[220px]" />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '140px' }} />
                </colgroup>
                <TableHeader className="sticky top-0 z-10 bg-surface-muted/95 backdrop-blur-xs border-b border-border-default">
                  <TableRow className="h-10 hover:bg-transparent border-0">
                    <TableHead className="h-10 ps-5 pe-3 text-start rtl:text-right text-[11px] font-semibold text-muted uppercase tracking-[0.06em] whitespace-nowrap">Product</TableHead>
                    <TableHead className="h-10 px-3 text-start rtl:text-right text-[11px] font-semibold text-muted uppercase tracking-[0.06em] whitespace-nowrap">SKU</TableHead>
                    <TableHead className="h-10 px-3 text-end rtl:text-left text-[11px] font-semibold text-muted uppercase tracking-[0.06em] whitespace-nowrap">Price</TableHead>
                    <TableHead className="h-10 ps-3 pe-5 text-end rtl:text-left text-[11px] font-semibold text-muted uppercase tracking-[0.06em] whitespace-nowrap">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border-subtle">
                  {products.length === 0 ? (
                    <TableRow className="h-32 hover:bg-transparent border-0">
                      <TableCell colSpan={4} className="px-6 py-8 text-center text-sm text-muted">
                        No products found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    products.map(product => {
                      const isSelected = selectedId === product.id;
                      const isLowStock = product.status === 'LOW_STOCK' || product.status === 'OUT_OF_STOCK';

                      return (
                        <TableRow
                          key={product.id}
                          onClick={() => selectProduct(product.id)}
                          className={`relative h-14 cursor-pointer transition-colors border-0 ${
                            isSelected
                              ? 'bg-accent-light/30'
                              : 'bg-surface-raised hover:bg-surface-muted/60'
                          }`}
                        >
                          <TableCell className="relative ps-5 pe-3 py-0 align-middle">
                            {isSelected && (
                              <span className="absolute inset-y-0 start-0 w-[3px] bg-primary pointer-events-none" aria-hidden="true" />
                            )}
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded border border-border-default bg-surface-muted flex items-center justify-center shrink-0">
                                <Box size={16} className="text-body-light" />
                              </div>
                              <span className="text-sm font-medium text-heading truncate whitespace-nowrap" title={product.name}>
                                {product.name}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-0 align-middle text-[13px] text-body-light whitespace-nowrap">
                            {product.sku}
                          </TableCell>
                          <TableCell className="px-3 py-0 align-middle text-sm font-semibold text-heading tabular-nums text-end rtl:text-left whitespace-nowrap" title={formatMoney(product.price)}>
                            {formatCompactTableMoney(product.price)}
                          </TableCell>
                          <TableCell className="ps-3 pe-5 py-0 align-middle text-end rtl:text-left whitespace-nowrap">
                            <Badge
                              variant="outline"
                              className={`h-[22px] min-w-[96px] px-2.5 rounded text-xs font-semibold whitespace-nowrap justify-center ${
                                isLowStock
                                  ? 'bg-danger-light text-danger border-danger-border'
                                  : 'bg-success-light text-success-text border-[#bbf7d0]'
                              }`}
                            >
                              {product.stock} {product.status.replaceAll('_', ' ')}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Footer (Pinned at bottom of card, 44px, 1px top border) */}
            {data?.pagination && (
              <div className="h-11 shrink-0 border-t border-border-default px-4 flex items-center justify-between text-[13px] text-muted bg-surface-raised">
                <span className="whitespace-nowrap">
                  Showing {data.pagination.total === 0 ? 0 : (productPage - 1) * data.pagination.limit + 1}–{Math.min(productPage * data.pagination.limit, data.pagination.total)} of {data.pagination.total} products
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={productPage <= 1}
                    onClick={() => setProductPage(current => current - 1)}
                    className="h-7 px-2 text-xs font-medium"
                  >
                    Previous
                  </Button>
                  <span className="text-xs whitespace-nowrap">
                    Page {data.pagination.pages === 0 ? 0 : productPage} of {data.pagination.pages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={productPage >= data.pagination.pages}
                    onClick={() => setProductPage(current => current + 1)}
                    className="h-7 px-2 text-xs font-medium"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Detail Panel */}
        <aside
          data-testid="product-detail-panel"
          aria-label="Product details"
          className="w-full min-[1100px]:w-[400px] shrink-0 bg-surface-raised border border-border-default rounded-card shadow-card flex flex-col overflow-hidden min-h-0"
        >
          {selectedProduct ? (
            <>
              {/* Detail Header (Fixed 20px padding) */}
              <div className="p-5 border-b border-border-default shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-[12px] bg-surface-active flex items-center justify-center border border-border-default shrink-0">
                      <Box size={22} className="text-body-light" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-heading truncate" title={selectedProduct.name}>
                        {selectedProduct.name}
                      </h2>
                      <p className="text-[13px] text-muted mt-0.5 truncate">
                        SKU: {selectedProduct.sku}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => { setSelectedId(null); setManualDeselect(true); }}
                    className="w-9 h-9 text-caption hover:text-body shrink-0"
                    aria-label="Close details"
                  >
                    <X size={18} />
                  </Button>
                </div>
                {selectedProduct.archivedAt && (
                  <p className="mt-3 rounded-button bg-surface-muted px-3 py-1.5 text-xs font-semibold text-muted">
                    Archived {formatDate(selectedProduct.archivedAt)}
                  </p>
                )}
              </div>

              {/* Tabs (Fixed 44px high, 20px gap, px-5, 1px bottom border) */}
              <div className="h-11 px-5 border-b border-border-default flex items-center gap-5 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className={`h-full flex items-center text-sm transition-colors border-b-2 cursor-pointer ${
                    activeTab === 'overview'
                      ? 'font-semibold text-heading border-black dark:border-white'
                      : 'font-medium text-muted hover:text-heading border-transparent'
                  }`}
                >
                  Overview
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('suppliers')}
                  className={`h-full flex items-center text-sm transition-colors border-b-2 cursor-pointer ${
                    activeTab === 'suppliers'
                      ? 'font-semibold text-heading border-black dark:border-white'
                      : 'font-medium text-muted hover:text-heading border-transparent'
                  }`}
                >
                  Suppliers
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className={`h-full flex items-center text-sm transition-colors border-b-2 cursor-pointer ${
                    activeTab === 'history'
                      ? 'font-semibold text-heading border-black dark:border-white'
                      : 'font-medium text-muted hover:text-heading border-transparent'
                  }`}
                >
                  History
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('orders')}
                  className={`h-full flex items-center text-sm transition-colors border-b-2 cursor-pointer ${
                    activeTab === 'orders'
                      ? 'font-semibold text-heading border-black dark:border-white'
                      : 'font-medium text-muted hover:text-heading border-transparent'
                  }`}
                >
                  Orders
                </button>
              </div>

              {/* Content Area (flex: 1; min-height: 0; padding 20px) */}
              {activeTab === 'overview' ? (
                <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">

                  {/* Stock Alert */}
                  {(selectedProduct.status === 'LOW_STOCK' || selectedProduct.status === 'OUT_OF_STOCK') && (
                    <div className="bg-danger-light border border-danger-border rounded-button p-3.5">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle size={15} className="text-danger" />
                        <h3 className="text-xs font-bold text-danger-hover uppercase tracking-wide">Stock Alert</h3>
                      </div>
                      <p className="text-sm text-[#991b1b] ps-6 leading-relaxed">
                        Current stock ({selectedProduct.stock}) is {selectedProduct.stock === 0 ? 'empty' : `below minimum threshold (${selectedProduct.minThreshold})`}. Action required.
                      </p>
                    </div>
                  )}

                  {/* Unit Price and Location: 2-column grid, gap 12px */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted mb-1">Unit Price</label>
                      <div className="w-full h-9 bg-surface-muted border border-border-default rounded-input px-3 flex items-center text-sm font-medium text-heading">
                        {formatMoney(selectedProduct.price)}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted mb-1">Location</label>
                      <div
                        className="w-full h-9 bg-surface-muted border border-border-default rounded-input px-3 flex items-center text-sm font-medium text-heading truncate whitespace-nowrap"
                        title={selectedProduct.warehouse ? `${selectedProduct.warehouse} - Aisle ${selectedProduct.aisle || 'N/A'}, Bin ${selectedProduct.bin || 'N/A'}` : 'Location Not Set'}
                      >
                        {selectedProduct.warehouse ? `${selectedProduct.warehouse} - Aisle ${selectedProduct.aisle || 'N/A'}, Bin ${selectedProduct.bin || 'N/A'}` : 'Location Not Set'}
                      </div>
                    </div>
                  </div>

                  {/* Stat Cards: 2-column grid, gap 12px, padding 12px, equal heights */}
                  <div className="grid grid-cols-2 gap-3 items-stretch">
                    <div className="border border-border-default rounded-card-sm p-3 bg-surface-raised flex flex-col justify-between">
                      <p className="text-xs font-medium text-muted mb-1">Avg. Monthly Usage</p>
                      <p className="text-lg font-semibold text-heading leading-tight">
                        {selectedProduct.avgMonthlyUsage == null ? '—' : `${selectedProduct.avgMonthlyUsage} Units`}
                      </p>
                    </div>
                    <div className="border border-border-default rounded-card-sm p-3 bg-surface-raised flex flex-col justify-between">
                      <p className="text-xs font-medium text-muted mb-1">Lead Time</p>
                      <p className="text-lg font-semibold text-heading leading-tight">
                        {selectedProduct.leadTimeDays == null ? '—' : `${selectedProduct.leadTimeDays} Days`}
                      </p>
                    </div>
                  </div>
                </div>
              ) : activeTab === 'suppliers' ? (
                <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-muted uppercase tracking-wider">Product Suppliers</p>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = newSupplierName.trim();
                      if (!name) return;
                      addSupplierMutation.mutate(name);
                    }}
                    className="flex gap-2"
                  >
                    <Input
                      type="text"
                      value={newSupplierName}
                      onChange={(e) => setNewSupplierName(e.target.value)}
                      placeholder="Add supplier name..."
                      disabled={!canWrite || addSupplierMutation.isPending}
                      className="flex-1 bg-surface text-sm"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!canWrite || !newSupplierName.trim() || addSupplierMutation.isPending}
                      className="px-3 py-2 text-xs font-semibold"
                    >
                      {addSupplierMutation.isPending ? 'Adding…' : 'Add'}
                    </Button>
                  </form>
                  {supplierError && (
                    <p className="text-xs text-danger">{supplierError}</p>
                  )}

                  {isSuppliersLoading ? (
                    <div className="flex h-32 items-center justify-center">
                      <Loader2 className="animate-spin text-muted" size={20} />
                    </div>
                  ) : isSuppliersError ? (
                    <p className="text-sm text-danger">Suppliers could not be loaded.</p>
                  ) : (suppliersData?.items ?? []).length === 0 ? (
                    <div className="flex h-32 items-center justify-center text-sm text-muted text-center">
                      No suppliers are linked to this product yet.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {suppliersData.items.map(supplier => (
                        <li
                          key={supplier.id}
                          className="flex items-center justify-between rounded-button border border-border-default bg-surface-muted px-4 py-3 text-sm font-semibold text-heading"
                        >
                          <span>{supplier.name}</span>
                          <button
                            type="button"
                            onClick={() => removeSupplierMutation.mutate(supplier.id)}
                            disabled={!canWrite || removeSupplierMutation.isPending}
                            title="Remove supplier from product"
                            className="text-xs font-medium text-danger hover:text-danger-hover disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : activeTab === 'orders' ? (
                <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-muted uppercase tracking-wider">Purchase Orders</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => { setPurchaseQuantity('1'); setPurchaseOrderError(''); setPurchaseOrderOpen(true); }}
                      disabled={!canWrite || Boolean(selectedProduct.archivedAt)}
                      className="h-7 px-2 text-xs font-semibold text-primary hover:text-primary-hover gap-1.5"
                    >
                      <ShoppingCart size={14} /> New Order
                    </Button>
                  </div>
                  {isOrdersLoading ? (
                    <div className="flex h-40 items-center justify-center">
                      <Loader2 className="animate-spin text-muted" size={20} />
                    </div>
                  ) : isOrdersError ? (
                    <p className="text-sm text-danger">Orders could not be loaded.</p>
                  ) : purchaseOrders.length === 0 ? (
                    <div className="flex h-40 items-center justify-center text-sm text-muted text-center">
                      No purchase orders recorded for this product.
                    </div>
                  ) : (
                    <div className="bg-surface-raised border border-border-default rounded-button shadow-card overflow-hidden">
                      <Table className="w-full text-left border-collapse">
                        <TableHeader className="bg-surface-muted/80 border-b border-border-default">
                          <TableRow className="hover:bg-transparent border-0">
                            <TableHead className="px-4 py-3 text-[10px] font-bold text-muted uppercase tracking-wider text-left rtl:text-right">Order</TableHead>
                            <TableHead className="px-4 py-3 text-[10px] font-bold text-muted uppercase tracking-wider text-left rtl:text-right">Date</TableHead>
                            <TableHead className="px-4 py-3 text-[10px] font-bold text-muted uppercase tracking-wider text-right rtl:text-left">Qty</TableHead>
                            <TableHead className="px-4 py-3 text-[10px] font-bold text-muted uppercase tracking-wider text-left rtl:text-right">Status</TableHead>
                            <TableHead className="px-4 py-3 text-[10px] font-bold text-muted uppercase tracking-wider text-right rtl:text-left">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-border-default">
                          {purchaseOrders.map((po) => {
                            const isDraft = po.status === 'DRAFT';
                            const isApproved = po.status === 'APPROVED';
                            const isReceived = po.status === 'RECEIVED';
                            return (
                              <TableRow key={po.id} className="hover:bg-surface-muted/50 transition-colors border-0">
                                <TableCell className="px-4 py-3 text-xs font-semibold text-heading">
                                  #{po.id.slice(-6).toUpperCase()}
                                </TableCell>
                                <TableCell className="px-4 py-3 text-xs text-muted">
                                  {formatDate(po.createdAt)}
                                </TableCell>
                                <TableCell className="px-4 py-3 text-xs font-semibold text-heading tabular-nums text-right rtl:text-left" title={po.quantity?.toLocaleString()}>
                                  {formatCompactNumber(po.quantity)}
                                </TableCell>
                                <TableCell className="px-4 py-3">
                                  <Badge
                                    variant="outline"
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      isReceived
                                        ? 'bg-success-light text-success-text border-success-border'
                                        : isApproved
                                        ? 'bg-blue-100 text-blue-700 border-blue-200'
                                        : 'bg-surface-strong text-body border-border-default'
                                    }`}
                                  >
                                    {po.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="px-4 py-3 text-right rtl:text-left">
                                  {isDraft && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      disabled={!canWrite || approveOrderMutation.isPending}
                                      onClick={() => approveOrderMutation.mutate(po.id)}
                                      className="h-auto p-0 text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50 mr-2"
                                      title="Approve order"
                                    >
                                      Approve
                                    </Button>
                                  )}
                                  {(isDraft || isApproved) && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      disabled={!canWrite || receiveOrderMutation.isPending}
                                      onClick={() => receiveOrderMutation.mutate(po.id)}
                                      className="h-auto p-0 text-xs font-semibold text-success-text hover:text-green-800 disabled:opacity-50"
                                      title="Receive items into stock"
                                    >
                                      Receive
                                    </Button>
                                  )}
                                  {isReceived && (
                                    <span className="text-xs text-muted">Done</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto p-5">
                  {/* History: real stock movements for this product */}
                  {isMovementsLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="animate-spin text-muted" size={20} />
                    </div>
                  ) : isMovementsError ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-danger">
                      <p role="alert">{movementsError?.message || 'Unable to load stock movement history.'}</p>
                      <Button type="button" variant="outline" size="sm" onClick={() => refetchMovements()} className="h-8 px-3">Retry</Button>
                    </div>
                  ) : movements.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted">
                      No stock movements recorded.
                    </div>
                  ) : (
                    <div className="bg-surface-raised border border-border-default rounded-button shadow-card overflow-hidden">
                      <p className="px-4 py-3 text-xs text-muted border-b border-border-default" title="Recorded stock movement quantities for this product; compares equal elapsed calendar dates in the workspace timezone">
                        This month: {movementSummary?.recordedThisMonth?.totalIn ?? 0} in / {movementSummary?.recordedThisMonth?.totalOut ?? 0} out
                        {' · Prior period: '}{movementSummary?.recordedThisMonthComparison?.totalIn ?? 0} in / {movementSummary?.recordedThisMonthComparison?.totalOut ?? 0} out
                      </p>
                      <Table className="w-full text-left border-collapse">
                        <TableHeader className="bg-surface-muted/80 border-b border-border-default">
                          <TableRow className="hover:bg-transparent border-0">
                            <TableHead className="px-4 py-3 text-[10px] font-bold text-muted uppercase tracking-wider text-left rtl:text-right">Date</TableHead>
                            <TableHead className="px-4 py-3 text-[10px] font-bold text-muted uppercase tracking-wider text-left rtl:text-right">Type</TableHead>
                            <TableHead className="px-4 py-3 text-[10px] font-bold text-muted uppercase tracking-wider text-right rtl:text-left">Qty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-border-subtle">
                          {movements.map(movement => {
                            const isIn = movement.type === 'IN';
                            return (
                              <TableRow key={movement.id} className="border-0">
                                <TableCell className="px-4 py-3 text-xs text-body-light">
                                  <div className="font-medium text-heading">{formatDate(movement.createdAt)}</div>
                                  {movement.note && <div className="text-caption truncate max-w-[180px]" title={movement.note}>{movement.note}</div>}
                                </TableCell>
                                <TableCell className="px-4 py-3">
                                  <Badge variant="outline" className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    isIn
                                      ? 'bg-success-light text-success-text border-success-border'
                                      : 'bg-danger-light text-danger border-danger-border'
                                  }`}>
                                    {isIn ? 'IN' : 'OUT'}
                                  </Badge>
                                </TableCell>
                                <TableCell className={`px-4 py-3 text-xs font-semibold tabular-nums text-right rtl:text-left ${isIn ? 'text-success-text' : 'text-danger'}`} title={Math.abs(movement.delta).toLocaleString()}>
                                  {isIn ? '+' : '−'}{formatCompactNumber(Math.abs(movement.delta))}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      <div className="flex items-center justify-between border-t border-border-default px-4 py-2 text-xs text-muted">
                        <span>Showing {(movementPage - 1) * (movementData?.pagination?.limit ?? 25) + 1}–{Math.min(movementPage * (movementData?.pagination?.limit ?? 25), movementData?.pagination?.total ?? 0)} of {movementData?.pagination?.total ?? 0} movements</span>
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="outline" size="sm" aria-label="Previous movement page" disabled={movementPage <= 1} onClick={() => setMovementPage(current => current - 1)} className="h-7 px-2 text-xs">Previous</Button>
                          <span>Page {movementPage} of {movementData?.pagination?.pages ?? 0}</span>
                          <Button type="button" variant="outline" size="sm" aria-label="Next movement page" disabled={movementPage >= (movementData?.pagination?.pages ?? 0)} onClick={() => setMovementPage(current => current + 1)} className="h-7 px-2 text-xs">Next</Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Actions Footer (Fixed at the bottom of the panel, always visible: padding 16px 20px, 1px top border, gap 8px) */}
              <div className="p-4 px-5 border-t border-border-default bg-surface-raised shrink-0 mt-auto flex flex-col gap-2">
                {/* Transient confirmation: shows the server's post-movement count until the
                    refetch has synced the list (at which point it equals the displayed stock). */}
                {freshStock != null && freshStock !== selectedProduct.stock && (
                  <div className="flex items-center justify-center gap-1.5 mb-1 text-xs font-semibold text-success-text">
                    <Check size={14} /> On hand: {freshStock} units
                  </div>
                )}
                {/* Row 1: Edit and Adjust Stock, a 2-column grid, equal width */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => openEditDialog(selectedProduct)}
                    disabled={!canWrite}
                    title={canWrite ? undefined : noRoleTitle}
                    className="h-9 gap-2 text-sm font-medium whitespace-nowrap shadow-card"
                  >
                    <Pencil size={15} /> Edit
                  </Button>
                  <Button
                    type="button"
                    onClick={openAdjustDialog}
                    disabled={!canWrite || Boolean(selectedProduct.archivedAt)}
                    title={selectedProduct.archivedAt ? 'Restore this product before adjusting stock' : canWrite ? undefined : noRoleTitle}
                    className="h-9 gap-2 text-sm font-semibold whitespace-nowrap"
                  >
                    <ArrowDownUp size={15} /> Adjust Stock
                  </Button>
                </div>
                {/* Row 2: Create Purchase Order, full width */}
                <Button
                  type="button"
                  onClick={() => { setPurchaseQuantity('1'); setPurchaseOrderError(''); setPurchaseOrderOpen(true); }}
                  disabled={!canWrite || Boolean(selectedProduct.archivedAt)}
                  title={selectedProduct.archivedAt ? 'Restore this product before creating an order' : canWrite ? undefined : noRoleTitle}
                  className="w-full h-9 gap-2 text-sm font-semibold whitespace-nowrap"
                >
                  <ShoppingCart size={15} /> Create Purchase Order
                </Button>
                {/* Row 3: Archive Product, full width */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setArchiveDialogOpen(true)}
                  disabled={!canWrite || archiveMutation.isPending}
                  title={canWrite ? undefined : noRoleTitle}
                  className="w-full h-9 text-sm font-medium whitespace-nowrap"
                >
                  {showArchived ? 'Restore Product' : 'Archive Product'}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted p-6">
              Select a product to view details.
            </div>
          )}
        </aside>

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
              <Input
                type="text"
                value={productForm.name}
                onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Product name"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-heading mb-1.5">SKU</label>
              <Input
                type="text"
                value={productForm.sku}
                onChange={(e) => setProductForm((f) => ({ ...f, sku: e.target.value }))}
                placeholder="e.g. WIDGET-001"
                className="w-full"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Price</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={productForm.price}
                  onChange={(e) => setProductForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="0.00"
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Min threshold</label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={productForm.minThreshold}
                  onChange={(e) => setProductForm((f) => ({ ...f, minThreshold: e.target.value }))}
                  placeholder="0"
                  className="w-full"
                />
              </div>
            </div>
            {productDialog.mode === 'create' && (
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">Initial stock</label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={productForm.stock}
                  onChange={(e) => setProductForm((f) => ({ ...f, stock: e.target.value }))}
                  placeholder="0"
                  className="w-full"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-heading mb-1.5">Warehouse</label>
              <Input
                type="text"
                value={productForm.warehouse}
                onChange={(e) => setProductForm((f) => ({ ...f, warehouse: e.target.value }))}
                placeholder="e.g. Main — Bay A (optional)"
                className="w-full"
              />
            </div>
            {productError && (
              <Alert variant="destructive" className="py-2 px-3 text-xs">
                <AlertDescription className="flex items-center gap-1.5">
                  <AlertTriangle size={14} /> {productError}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </FormDialog>

        <FormDialog open={purchaseOrderOpen} onClose={() => !purchaseOrderMutation.isPending && setPurchaseOrderOpen(false)} title="Create purchase order" subtitle={selectedProduct ? `Create a draft order for ${selectedProduct.name}.` : undefined} busy={purchaseOrderMutation.isPending} onConfirm={() => {
          const quantity = Number(purchaseQuantity);
          if (!Number.isSafeInteger(quantity) || quantity < 1) { setPurchaseOrderError('Quantity must be a whole number greater than 0.'); return; }
          setPurchaseOrderError('');
          purchaseOrderMutation.mutate();
        }} confirmLabel="Create draft order">
          <label className="block text-sm font-medium text-body">
            Quantity
            <Input type="number" min={1} step={1} value={purchaseQuantity} onChange={event => setPurchaseQuantity(event.target.value)} className="mt-1 w-full" />
          </label>
          {purchaseOrderError && (
            <Alert variant="destructive" className="mt-3 py-2 px-3 text-xs">
              <AlertDescription>{purchaseOrderError}</AlertDescription>
            </Alert>
          )}
        </FormDialog>
        <ConfirmDialog open={archiveDialogOpen} onClose={() => !archiveMutation.isPending && setArchiveDialogOpen(false)} onConfirm={() => archiveMutation.mutate()} title={showArchived ? 'Restore product?' : 'Archive product?'} description={showArchived ? `Restore ${selectedProduct?.name || 'this product'} to the active catalog?` : `Archive ${selectedProduct?.name || 'this product'}? Its stock history and purchase order records will be retained.`} confirmLabel={showArchived ? 'Restore product' : 'Archive product'} busy={archiveMutation.isPending} />
        {createdOrder && (
          <div role="status" className="fixed bottom-4 right-4 z-40 flex items-center gap-3 rounded-button border border-success-border bg-success-light px-4 py-3 text-sm text-success-text shadow-card">
            <span>Draft purchase order created for {createdOrder.quantity} × {createdOrder.productName}.</span>
            <button type="button" onClick={() => setCreatedOrder(null)} className="cursor-pointer text-success-text hover:opacity-80" aria-label="Dismiss notification">
              <X size={14} />
            </button>
          </div>
        )}

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
              <Input
                type="number"
                min={1}
                step={1}
                value={movementForm.qty}
                onChange={(e) => setMovementForm((f) => ({ ...f, qty: e.target.value }))}
                placeholder="0"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-heading mb-1.5">Note</label>
              <Input
                type="text"
                value={movementForm.note}
                onChange={(e) => setMovementForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="e.g. PO #4521 receipt (optional)"
                className="w-full"
              />
            </div>
            {movementError && (
              <Alert variant="destructive" className="py-2 px-3 text-xs">
                <AlertDescription className="flex items-center gap-1.5">
                  <AlertTriangle size={14} /> {movementError}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </FormDialog>
      </div>
    </div>
  );
}
