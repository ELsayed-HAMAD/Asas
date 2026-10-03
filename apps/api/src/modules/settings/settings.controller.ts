import type { PrismaClient } from '@prisma/client'
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
import * as settingsService from './settings.service.js'

/**
 * Settings controller — the thin request-mapping layer between `settings.routes.ts` (which owns
 * auth, validation, and the response envelope) and `settings.service.ts` (which owns the data).
 *
 * Named exports so a route imports `* as settingsController` and reads as "map the request, hand
 * it to the controller, wrap the result" — every service call in the module is reachable from
 * exactly one place.
 */

export function getGeneral(prisma: PrismaClient, tenantId: string): Promise<GeneralSettings> {
  return settingsService.getTenantSettings(prisma, tenantId)
}

export function updateGeneral(
  prisma: PrismaClient,
  tenantId: string,
  input: GeneralSettingsUpdateInput,
): Promise<GeneralSettings> {
  return settingsService.updateTenantSettings(prisma, tenantId, input)
}

export function getNotifications(prisma: PrismaClient, tenantId: string): Promise<NotificationSettings> {
  return settingsService.getNotificationSettings(prisma, tenantId)
}

export function updateNotifications(
  prisma: PrismaClient,
  tenantId: string,
  input: NotificationSettingsUpdateInput,
): Promise<NotificationSettings> {
  return settingsService.updateNotificationSettings(prisma, tenantId, input)
}

export function getIntegrations(prisma: PrismaClient, tenantId: string): Promise<IntegrationsListResponse> {
  return settingsService.getIntegrationSettings(prisma, tenantId)
}

export function createIntegration(
  prisma: PrismaClient,
  tenantId: string,
  input: IntegrationWriteInput,
): Promise<Integration> {
  return settingsService.createIntegration(prisma, tenantId, input)
}

export function updateIntegration(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: IntegrationUpdateInput,
): Promise<Integration> {
  return settingsService.updateIntegration(prisma, tenantId, id, input)
}

export type {
  GeneralSettings,
  Integration,
  IntegrationsListResponse,
  NotificationSettings,
}
