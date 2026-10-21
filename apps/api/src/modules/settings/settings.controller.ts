import type { Prisma, PrismaClient } from '@prisma/client'
import type {
  GeneralSettings,
  GeneralSettingsUpdateInput,
  Integration,
  IntegrationsListResponse,
  IntegrationUpdateInput,
  IntegrationWriteInput,
  WebhookLog,
  WebhookLogsResponse,
  NotificationSettings,
  NotificationSettingsUpdateInput,
  BillingSettings,
  ExchangeRate,
  ExchangeRateListQuery,
  ExchangeRateListResponse,
  ExchangeRateWriteInput,
  GdprAnonymizeRequest,
  GdprAnonymizeResponse,
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
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  input: GeneralSettingsUpdateInput,
): Promise<GeneralSettings> {
  return settingsService.updateTenantSettings(prisma, tenantId, input)
}

export function listExchangeRates(prisma: PrismaClient, tenantId: string, query: ExchangeRateListQuery): Promise<ExchangeRateListResponse> {
  return settingsService.listExchangeRates(prisma, tenantId, query)
}

export function createExchangeRate(prisma: PrismaClient | Prisma.TransactionClient, tenantId: string, actorId: string, input: ExchangeRateWriteInput): Promise<ExchangeRate> {
  return settingsService.createExchangeRate(prisma, tenantId, actorId, input)
}

export function getNotifications(prisma: PrismaClient, tenantId: string): Promise<NotificationSettings> {
  return settingsService.getNotificationSettings(prisma, tenantId)
}

export function updateNotifications(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  input: NotificationSettingsUpdateInput,
): Promise<NotificationSettings> {
  return settingsService.updateNotificationSettings(prisma, tenantId, input)
}

export function getIntegrations(prisma: PrismaClient, tenantId: string): Promise<IntegrationsListResponse> {
  return settingsService.getIntegrationSettings(prisma, tenantId)
}

export function getIntegrationWebhookLogs(prisma: PrismaClient, tenantId: string, integrationId: string): Promise<WebhookLogsResponse> {
  return settingsService.getIntegrationWebhookLogs(prisma, tenantId, integrationId)
}

export function createIntegration(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  input: IntegrationWriteInput,
): Promise<Integration> {
  return settingsService.createIntegration(prisma, tenantId, input)
}

export function updateIntegration(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  id: string,
  input: IntegrationUpdateInput,
): Promise<Integration> {
  return settingsService.updateIntegration(prisma, tenantId, id, input)
}

export function testIntegration(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
): Promise<{ success: boolean; log: WebhookLog }> {
  return settingsService.testIntegration(prisma, tenantId, id)
}

export function getBilling(prisma: PrismaClient, tenantId: string, measuredStorageUsedGb: number | null = null): Promise<BillingSettings> {
  return settingsService.getBillingSettings(prisma, tenantId, measuredStorageUsedGb)
}

export function deleteWorkspace(prisma: PrismaClient, tenantId: string, userId: string): Promise<{ success: boolean }> {
  return settingsService.deleteWorkspace(prisma, tenantId, userId)
}

export function anonymizeEntity(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  input: GdprAnonymizeRequest,
): Promise<GdprAnonymizeResponse> {
  return settingsService.anonymizeEntity(prisma, tenantId, input)
}

export type {
  GeneralSettings,
  Integration,
  IntegrationsListResponse,
  NotificationSettings,
  BillingSettings,
}
