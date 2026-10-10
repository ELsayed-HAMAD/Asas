/**
 * CRM controller — the HTTP-boundary layer between the Fastify routes and the `crm.service`.
 * The routes (`crm.routes.ts`) own the declarative bits (guards, schema, response codes,
 * auth-context extraction); the controller owns the request→service mapping. Mirrors the
 * Finance/Projects split.
 *
 * The controller never reads `tenantId` from a request parameter — the route resolves it from
 * the session and passes it in, so a caller cannot address another tenant's rows.
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import type {
  CrmForecast,
  CrmOverview,
  CrmSalesPerformance,
  Deal,
  DealActivityListQuery,
  DealActivityWriteInput,
  DealListQuery,
  DealUpdateInput,
  DealWriteInput,
  AgendaItem,
  AgendaItemUpdateInput,
  AgendaItemWriteInput,
  SalesQuotaRow,
  SalesQuotaUpdateInput,
  SalesQuotaWriteInput,
} from '@asas/contracts'
import * as service from './crm.service.js'

export type { DealListResult } from './crm.service.js'

// ── Reads ─────────────────────────────────────────────────────────────────────────

export function listDeals(
  prisma: PrismaClient,
  tenantId: string,
  query: DealListQuery,
): ReturnType<typeof service.listDeals> {
  return service.listDeals(prisma, tenantId, query)
}

export function getDeal(prisma: PrismaClient, tenantId: string, id: string): Promise<Deal> {
  return service.getDeal(prisma, tenantId, id)
}

export function listDealActivities(prisma: PrismaClient, tenantId: string, dealId: string, query: DealActivityListQuery) {
  return service.listDealActivities(prisma, tenantId, dealId, query)
}

// ── Analytics (SQL aggregates, never client-side) ─────────────────────────────────

export function getOverview(prisma: PrismaClient, tenantId: string): Promise<CrmOverview> {
  return service.getOverview(prisma, tenantId)
}

export function getForecast(prisma: PrismaClient, tenantId: string, year?: string): Promise<CrmForecast> {
  return service.getForecast(prisma, tenantId, year)
}

export function getSalesPerformance(
  prisma: PrismaClient,
  tenantId: string,
  year?: string,
): Promise<CrmSalesPerformance> {
  return service.getSalesPerformance(prisma, tenantId, year)
}

// ── Writes ────────────────────────────────────────────────────────────────────────

export function createSalesQuota(prisma: PrismaClient | Prisma.TransactionClient, tenantId: string, input: SalesQuotaWriteInput): Promise<SalesQuotaRow> {
  return service.createSalesQuota(prisma, tenantId, input)
}

export function updateSalesQuota(prisma: PrismaClient | Prisma.TransactionClient, tenantId: string, id: string, input: SalesQuotaUpdateInput): Promise<SalesQuotaRow> {
  return service.updateSalesQuota(prisma, tenantId, id, input)
}

export function deleteSalesQuota(prisma: PrismaClient | Prisma.TransactionClient, tenantId: string, id: string): Promise<SalesQuotaRow> {
  return service.deleteSalesQuota(prisma, tenantId, id)
}

export function createDeal(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  input: DealWriteInput,
  actorId?: string,
): Promise<Deal> {
  return service.createDeal(prisma, tenantId, input, actorId)
}

export function updateDeal(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  id: string,
  input: DealUpdateInput,
  actorId?: string,
): Promise<Deal> {
  return service.updateDeal(prisma, tenantId, id, input, actorId)
}

export function createDealActivity(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  dealId: string,
  actorId: string,
  input: DealActivityWriteInput,
) {
  return service.createDealActivity(prisma, tenantId, dealId, actorId, input)
}

export function listAgenda(prisma: PrismaClient, tenantId: string): Promise<{ items: AgendaItem[] }> {
  return service.listAgendaItems(prisma, tenantId)
}

export function createAgenda(prisma: PrismaClient, tenantId: string, input: AgendaItemWriteInput): Promise<AgendaItem> {
  return service.createAgendaItem(prisma, tenantId, input)
}

export function updateAgenda(prisma: PrismaClient, tenantId: string, id: string, input: AgendaItemUpdateInput): Promise<AgendaItem> {
  return service.updateAgendaItem(prisma, tenantId, id, input)
}
