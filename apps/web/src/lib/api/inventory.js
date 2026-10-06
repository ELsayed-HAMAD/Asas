import { http } from './http'

/**
 * Inventory API client — thin wrapper over lib/api/http.js.
 *
 * Reads:
 *   - listProducts        GET /inventory/products        (paginated, with SQL summary)
 *   - getProduct          GET /inventory/products/:id
 *   - listStockMovements  GET /inventory/stock/movements (paginated, with totalIn/totalOut)
 *   - listStockAlerts     GET /inventory/stock/alerts    (unpaginated collection)
 *   - listWarehouses      GET /inventory/warehouses      (unpaginated collection)
 *
 * Writes:
 *   - createProduct       POST   /inventory/products     (stock = opening quantity)
 *   - updateProduct       PATCH  /inventory/products/:id (stock is NOT part of the patch)
 *   - deleteProduct       DELETE /inventory/products/:id (204)
 *   - recordStockMovement POST   /inventory/stock/movements
 *
 * `http` already unwraps the `{ data }` envelope, so these functions resolve directly to the
 * inner payload (`{ items, pagination, summary }` for lists, the entity for detail/mutations).
 */
export const inventoryApi = {
  listProducts: ({ page = 1, limit = 25, search, status, archived = false } = {}) =>
    http.get('/inventory/products', { query: { page, limit, search, status, archived } }),

  getProduct: (id) => http.get(`/inventory/products/${id}`),
  listProductSuppliers: (id) => http.get(`/inventory/products/${id}/suppliers`),
  createPurchaseOrder: (body) => http.post('/inventory/purchase-orders', { body }),

  listStockMovements: ({ page = 1, limit = 25, productId, warehouse, type } = {}) =>
    http.get('/inventory/stock/movements', { query: { page, limit, productId, warehouse, type } }),

  listStockAlerts: () => http.get('/inventory/stock/alerts'),

  listWarehouses: () => http.get('/inventory/warehouses'),

  createProduct: (body) => http.post('/inventory/products', { body }),
  updateProduct: (id, patch) => http.patch(`/inventory/products/${id}`, { body: patch }),
  setProductArchived: (id, archived) => http.patch(`/inventory/products/${id}/archive`, { body: { archived } }),
  deleteProduct: (id) => http.delete(`/inventory/products/${id}`),
  recordStockMovement: (body) => http.post('/inventory/stock/movements', { body }),
}
