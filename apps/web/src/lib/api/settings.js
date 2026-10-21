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
  listExchangeRates: (query = {}) => http.get(`/settings/exchange-rates${query.page || query.limit || query.currency ? `?${new URLSearchParams(query)}` : ''}`),
  createExchangeRate: (body) => http.post('/settings/exchange-rates', { body }),
  getBilling: () => http.get('/settings/billing'),
  getBillingPlans: () => http.get('/billing/plans'),
  createBillingCheckout: (priceId) => http.post('/billing/checkout', { body: { priceId } }),
  createBillingPortal: () => http.post('/billing/portal'),
  /** GET /settings/notifications → { modules, quietHours, quietHoursDefaulted }. */
  getNotifications: () => http.get('/settings/notifications'),

  /**
   * PATCH /settings/notifications — partial update. Accepts `{ modules }`, `{ quietHours }`, or
   * both; the server validates that at least one setting is present.
   */
  updateNotifications: (patch) => http.patch('/settings/notifications', { body: patch }),

  /** GET /settings/integrations → { items: Integration[], summary: { connectedCount, total } }. */
  getIntegrations: () => http.get('/settings/integrations'),
  getIntegrationWebhookLogs: (id) => http.get(`/settings/integrations/${id}/webhook-logs`),

  /**
   * POST /settings/integrations — create one. `body.credential` (the raw secret) is the single
   * place a credential may be sent; it is masked on read and never returned afterward.
   */
  createIntegration: (body) => http.post('/settings/integrations', { body }),

  /**
   * PATCH /settings/integrations/:id — update one. `patch.credential.value` sets/replaces the
   * secret, `patch.credential.clear: true` deletes it (the two are mutually exclusive), and
   * omitting `credential` leaves the stored secret untouched.
   */
  updateIntegration: (id, patch) => http.patch(`/settings/integrations/${id}`, { body: patch }),
  testIntegration: (id) => http.post(`/settings/integrations/${id}/test`),

  /** DELETE /settings/workspace — permanently deletes the active tenant (OWNER only). */
  deleteWorkspace: () => http.delete('/settings/workspace'),
}
