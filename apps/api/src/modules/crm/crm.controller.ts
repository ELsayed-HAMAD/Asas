/**
 * CRM controller — the HTTP-boundary layer between the Fastify routes and the `crm.service`.
 * The routes (`crm.routes.ts`) own the declarative bits (guards, schema, response codes,
 * auth-context extraction); the controller owns the request→service mapping. Mirrors the
 * Finance/Projects split.
 *
 * The controller never reads `tenantId` from a request parameter — the route resolves it from
 * the session and passes it in, so a caller cannot address another tenant's rows.
 */
import type { PrismaClient } from '@prisma/client'
import type {
  CrmForecast,
  CrmOverview,
  CrmSalesPerformance,
  Deal,
  DealListQuery,
  DealUpdateInput,
  DealWriteInput,
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

// ── Analytics (SQL aggregates, never client-side) ─────────────────────────────────

export function getOverview(prisma: PrismaClient, tenantId: string): Promise<CrmOverview> {
  return service.getOverview(prisma, tenantId)
}

export function getForecast(prisma: PrismaClient, tenantId: string): Promise<CrmForecast> {
  return service.getForecast(prisma, tenantId)
}

export function getSalesPerformance(
  prisma: PrismaClient,
  tenantId: string,
): Promise<CrmSalesPerformance> {
  return service.getSalesPerformance(prisma, tenantId)
}

// ── Writes ────────────────────────────────────────────────────────────────────────

export function createDeal(
  prisma: PrismaClient,
  tenantId: string,
  input: DealWriteInput,
): Promise<Deal> {
  return service.createDeal(prisma, tenantId, input)
}

export function updateDeal(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: DealUpdateInput,
): Promise<Deal> {
  return service.updateDeal(prisma, tenantId, id, input)
}
