import { http } from './http';

/**
 * Audit Log API client.
 * Provides access to the append-only tenant audit trail.
 */
export const auditLogApi = {
  /**
   * List recent audit logs for the tenant.
   * @param {Object} [params]
   * @param {number} [params.limit=20]
   * @param {string} [params.targetType]
   */
  listAuditLogs: (params = {}) => http.get('/audit-logs', { query: params }),
};

