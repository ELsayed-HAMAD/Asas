import { http } from '../api/http'

/**
 * Settings API client — thin one-function-per-endpoint wrapper over `lib/api/http.js` for the
 * `/api/v1/settings` surface (general settings, notifications, integrations, billing, and backups). The general-settings page
 * (`SettingsGeneral`) talks to `/settings/general` directly via `http`, matching the phase-1
 * convention; only the settings *module* builder's endpoints are gathered here.
 *
 * Envelope unwrapping and the httpOnly session cookie are handled by `http`, so these return the
 * decoded `data` payload directly (e.g. `getNotifications()` resolves to `{ modules, quietHours,
 * quietHoursDefaulted }`).
 *
 * Billing records are tenant-scoped and read or updated through this same settings API.
 */
export const settingsApi = {
  listDataMigrationProjects: () => http.get('/settings/data-migrations'),
  createDataMigrationProject: (body) => http.post('/settings/data-migrations', { body }),
  updateDataMigrationProject: (id, body) => http.patch(`/settings/data-migrations/${id}`, { body }),
  previewFinanceMigrationReconciliation: (id) => http.get(`/settings/data-migrations/${id}/finance/reconciliation`),
  cutoverFinanceMigration: (id) => http.post(`/settings/data-migrations/${id}/finance/cutover`, { body: { acknowledge: 'I_CONFIRM_FINANCE_CUTOVER' } }),
  listFinanceMigrationStageRecords: (id, entity, page = 1, limit = 50) => http.get(`/settings/data-migrations/${id}/finance/staged-records?${new URLSearchParams({ entity, page: String(page), limit: String(limit) })}`),
  validateCrmCompanyMigration: (id, companies) => http.post(`/settings/data-migrations/${id}/crm/companies/validate`, { body: { companies } }),
  importCrmCompanyMigration: (id, companies) => http.post(`/settings/data-migrations/${id}/crm/companies/import`, { body: { companies } }),
  validateCrmDealMigration: (id, deals) => http.post(`/settings/data-migrations/${id}/crm/deals/validate`, { body: { deals } }),
  importCrmDealMigration: (id, deals) => http.post(`/settings/data-migrations/${id}/crm/deals/import`, { body: { deals } }),
  validateInventoryProductMigration: (id, products) => http.post(`/settings/data-migrations/${id}/inventory/products/validate`, { body: { products } }),
  importInventoryProductMigration: (id, products) => http.post(`/settings/data-migrations/${id}/inventory/products/import`, { body: { products } }),
  validateInventoryOpeningStockMigration: (id, stock) => http.post(`/settings/data-migrations/${id}/inventory/opening-stock/validate`, { body: { stock } }),
  importInventoryOpeningStockMigration: (id, stock) => http.post(`/settings/data-migrations/${id}/inventory/opening-stock/import`, { body: { stock } }),
  validateInventorySupplierMigration: (id, suppliers) => http.post(`/settings/data-migrations/${id}/inventory/suppliers/validate`, { body: { suppliers } }),
  importInventorySupplierMigration: (id, suppliers) => http.post(`/settings/data-migrations/${id}/inventory/suppliers/import`, { body: { suppliers } }),
  validateInventoryProductSupplierMigration: (id, links) => http.post(`/settings/data-migrations/${id}/inventory/product-suppliers/validate`, { body: { links } }),
  importInventoryProductSupplierMigration: (id, links) => http.post(`/settings/data-migrations/${id}/inventory/product-suppliers/import`, { body: { links } }),
  validateFinanceCounterpartyMigration: (id, kind, records) => http.post(`/settings/data-migrations/${id}/finance/${kind}/validate`, { body: { [kind]: records } }),
  importFinanceCounterpartyMigration: (id, kind, records) => http.post(`/settings/data-migrations/${id}/finance/${kind}/import`, { body: { [kind]: records } }),
  validateFinanceMigrationStage: (id, kind, body) => http.post(`/settings/data-migrations/${id}/finance/${kind}/validate`, { body }),
  stageFinanceMigrationBatch: (id, kind, body) => http.post(`/settings/data-migrations/${id}/finance/${kind}/stage`, { body }),
  validateProjectPortfolioMigration: (id, projects) => http.post(`/settings/data-migrations/${id}/projects/portfolio/validate`, { body: { projects } }),
  importProjectPortfolioMigration: (id, projects) => http.post(`/settings/data-migrations/${id}/projects/portfolio/import`, { body: { projects } }),
  listExchangeRates: (query = {}) => http.get(`/settings/exchange-rates${query.page || query.limit || query.currency ? `?${new URLSearchParams(query)}` : ''}`),
  createExchangeRate: (body) => http.post('/settings/exchange-rates', { body }),
  getBilling: () => http.get('/settings/billing'),
  getBillingPlans: () => http.get('/billing/plans'),
  createBillingCheckout: (priceId) => http.post('/billing/checkout', { body: { priceId } }),
  createBillingPortal: () => http.post('/billing/portal'),
  /** GET /settings/notifications → { modules, quietHours, quietHoursDefaulted }. */
  getNotifications: () => http.get('/settings/notifications'),
  getNotificationUsage: () => http.get('/notifications/stats'),

  /**
   * PATCH /settings/notifications — partial update. Accepts `{ modules }`, `{ quietHours }`, or
   * both; the server validates that at least one setting is present.
   */
  updateNotifications: (patch) => http.patch('/settings/notifications', { body: patch }),

  /** GET /settings/integrations → { items: Integration[], summary: { connectedCount, total } }. */
  getIntegrations: () => http.get('/settings/integrations'),
  getIntegrationWebhookLogs: (id) => http.get(`/settings/integrations/${id}/webhook-logs`),

  /**
   * POST /settings/integrations — create one. `body.credential` carries the custom HTTPS endpoint
   * URL, encrypted at rest and returned only as a masked preview.
   */
  createIntegration: (body) => http.post('/settings/integrations', { body }),

  /**
   * PATCH /settings/integrations/:id — update one. `patch.credential.value` sets/replaces the
   * endpoint URL, `patch.credential.clear: true` clears it (the two are mutually exclusive), and
   * omitting `credential` leaves the stored endpoint untouched.
   */
  updateIntegration: (id, patch) => http.patch(`/settings/integrations/${id}`, { body: patch }),
  testIntegration: (id) => http.post(`/settings/integrations/${id}/test`),

  /** DELETE /settings/workspace — permanently deletes the active tenant (OWNER only). */
  deleteWorkspace: () => http.delete('/settings/workspace'),
}
