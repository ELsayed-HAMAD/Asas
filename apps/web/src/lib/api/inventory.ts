import type {
  Product,
  ProductListQuery,
  ProductListResponse,
  ProductUpdateInput,
  ProductWriteInput,
  StockAlertListResponse,
  StockLevelListResponse,
  StockMovementListQuery,
  StockMovementListResponse,
  StockMovementRecorded,
  StockMovementWriteInput,
  WarehouseListResponse,
} from '@asas/contracts'
import { http } from './http.js'

/**
 * Typed client for `/api/v1/inventory/*`. `GET /inventory/products` returns the
 * `{ items, pagination, summary }` envelope; stock levels/alerts/warehouses are derived
 * in SQL (unpaginated `{ items }`); the only way stock on hand changes is
 * `recordStockMovement`.
 */
export const inventoryApi = {
  // ── Products ─────────────────────────────────────────────────────────────────
  listProducts: (query: Partial<ProductListQuery> = {}) =>
    http.get<ProductListResponse>('/inventory/products', { query }),

  getProduct: (id: string) => http.get<Product>(`/inventory/products/${id}`),

  createProduct: (input: ProductWriteInput) =>
    http.post<Product>('/inventory/products', { body: input }),

  updateProduct: (id: string, input: ProductUpdateInput) =>
    http.patch<Product>(`/inventory/products/${id}`, { body: input }),

  deleteProduct: (id: string) => http.delete<void>(`/inventory/products/${id}`),

  // ── Derived views (computed in SQL) ─────────────────────────────────────────
  listStockLevels: () => http.get<StockLevelListResponse>('/inventory/stock/levels'),

  listStockAlerts: () => http.get<StockAlertListResponse>('/inventory/stock/alerts'),

  listWarehouses: () => http.get<WarehouseListResponse>('/inventory/warehouses'),

  // ── Stock movements ──────────────────────────────────────────────────────────
  listStockMovements: (query: Partial<StockMovementListQuery> = {}) =>
    http.get<StockMovementListResponse>('/inventory/stock/movements', { query }),

  recordStockMovement: (input: StockMovementWriteInput) =>
    http.post<StockMovementRecorded>('/inventory/stock/movements', { body: input }),
}
