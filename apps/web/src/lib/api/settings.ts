import type {
  GeneralSettings,
  GeneralSettingsUpdateInput,
  Integration,
  IntegrationsListResponse,
  IntegrationUpdateInput,
  IntegrationWriteInput,
  NotificationSettings,
  NotificationSettingsUpdateInput,
} from '@asas/contracts'
import { http } from './http.js'

export const settingsApi = {
  // ── General ───────────────────────────────────────────────────────────────
  getGeneral: () => http.get<GeneralSettings>('/settings/general'),

  updateGeneral: (input: GeneralSettingsUpdateInput) =>
    http.patch<GeneralSettings>('/settings/general', { body: input }),

  // ── Notifications ─────────────────────────────────────────────────────────
  getNotifications: () => http.get<NotificationSettings>('/settings/notifications'),

  updateNotifications: (input: NotificationSettingsUpdateInput) =>
    http.patch<NotificationSettings>('/settings/notifications', { body: input }),

  // ── Integrations ──────────────────────────────────────────────────────────
  getIntegrations: () => http.get<IntegrationsListResponse>('/settings/integrations'),

  createIntegration: (input: IntegrationWriteInput) => http.post<Integration>('/settings/integrations', { body: input }),

  updateIntegration: (id: string, input: IntegrationUpdateInput) =>
    http.patch<Integration>(`/settings/integrations/${id}`, { body: input }),
}
