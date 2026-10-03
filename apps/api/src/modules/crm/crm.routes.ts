import {
  dealListQuerySchema,
  dealListResponseSchema,
  dealSchema,
  dealUpdateSchema,
  dealWriteSchema,
  envelope,
  errorResponses,
  forecastResponseSchema,
  idParamSchema,
  overviewResponseSchema,
  salesPerformanceResponseSchema,
  agendaListResponseSchema,
  agendaItemSchema,
  agendaItemWriteSchema,
  agendaItemUpdateSchema,
} from '@asas/contracts'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { requireAuthContext, requireRole } from '../../middlewares/rbac.js'
import { requirePermission } from '../../middlewares/permissions.js'
import { recordAuditLog } from '../../services/auditLog.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import * as crmController from './crm.controller.js'

/**
 * CRM — deals, pipeline overview, forecast, and sales performance.
 *
 * The RBAC split mirrors HR/Finance/Projects: reads go through `requireRole('MEMBER')`; every
 * write goes through the named `deal.write` permission (ADMIN by the map in
 * `middlewares/permissions.ts`). `tenantId` is read only from the resolved session. Each
 * successful deal mutation calls the SSE `ssePublish` helper so other open tabs invalidate
 * their CRM queries (Phase 7).
 *
 * The deal list returns `{ items, pagination, summary }`; the overview/forecast/performance
 * endpoints return server-computed SQL aggregates, never client-side sums.
 */
export async function crmRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>()

  // ── Overview (funnel + pipeline KPIs) ──────────────────────────────────────

  server.get(
    '/overview',
    {
      preHandler: requireRole('MEMBER'),
      schema: { response: { 200: envelope(overviewResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await crmController.getOverview(request.server.prisma, tenantId)
      return { data: result }
    },
  )

  // ── Forecast ───────────────────────────────────────────────────────────────

  server.get(
    '/forecast',
    {
      preHandler: requireRole('MEMBER'),
      schema: { response: { 200: envelope(forecastResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await crmController.getForecast(request.server.prisma, tenantId)
      return { data: result }
    },
  )

  // ── Sales performance ──────────────────────────────────────────────────────

  server.get(
    '/sales-performance',
    {
      preHandler: requireRole('MEMBER'),
      schema: { response: { 200: envelope(salesPerformanceResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await crmController.getSalesPerformance(request.server.prisma, tenantId)
      return { data: result }
    },
  )

  // ── Deals ──────────────────────────────────────────────────────────────────

  server.get(
    '/deals',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        querystring: dealListQuerySchema,
        response: { 200: envelope(dealListResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await crmController.listDeals(request.server.prisma, tenantId, request.query)
      return { data: result }
    },
  )

  server.get('/agenda', {
    preHandler: requireRole('MEMBER'),
    schema: { response: { 200: envelope(agendaListResponseSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await crmController.listAgenda(request.server.prisma, tenantId) }
  })

  server.post('/agenda', {
    preHandler: requirePermission('deal.write'),
    schema: { body: agendaItemWriteSchema, response: { 201: envelope(agendaItemSchema), ...errorResponses } },
  }, async (request, reply) => {
    const { tenantId } = requireAuthContext(request)
    reply.code(201)
    return { data: await crmController.createAgenda(request.server.prisma, tenantId, request.body) }
  })

  server.patch('/agenda/:id', {
    preHandler: requirePermission('deal.write'),
    schema: { params: idParamSchema, body: agendaItemUpdateSchema, response: { 200: envelope(agendaItemSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await crmController.updateAgenda(request.server.prisma, tenantId, request.params.id, request.body) }
  })

  server.get(
    '/deals/:id',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        params: idParamSchema,
        response: { 200: envelope(dealSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const deal = await crmController.getDeal(request.server.prisma, tenantId, request.params.id)
      return { data: deal }
    },
  )

  server.post(
    '/deals',
    {
      preHandler: requirePermission('deal.write'),
      schema: {
        body: dealWriteSchema,
        response: { 201: envelope(dealSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const deal = await crmController.createDeal(request.server.prisma, tenantId, request.body)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'crm.deal.create',
        targetType: 'Deal',
        targetId: deal.id,
        metadata: { amount: deal.value },
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('crm')])
      reply.code(201)
      return { data: deal }
    },
  )

  server.patch(
    '/deals/:id',
    {
      preHandler: requirePermission('deal.write'),
      schema: {
        params: idParamSchema,
        body: dealUpdateSchema,
        response: { 200: envelope(dealSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const deal = await crmController.updateDeal(
        request.server.prisma,
        tenantId,
        request.params.id,
        request.body,
      )
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'crm.deal.update',
        targetType: 'Deal',
        targetId: deal.id,
        metadata: { fields: Object.keys(request.body) },
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('crm')])
      return { data: deal }
    },
  )
}
