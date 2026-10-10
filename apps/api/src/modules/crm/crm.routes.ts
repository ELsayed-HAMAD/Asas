import {
  dealListQuerySchema,
  dealListResponseSchema,
  dealActivityListQuerySchema,
  dealActivityListResponseSchema,
  dealActivitySchema,
  dealActivityWriteSchema,
  dealSchema,
  dealUpdateSchema,
  dealWriteSchema,
  envelope,
  errorResponses,
  forecastResponseSchema,
  forecastQuerySchema,
  idParamSchema,
  overviewResponseSchema,
  salesPerformanceResponseSchema,
  agendaListResponseSchema,
  agendaItemSchema,
  agendaItemWriteSchema,
  agendaItemUpdateSchema,
  salesQuotaSchema,
  salesQuotaUpdateSchema,
  salesQuotaWriteSchema,
  noContentSchema,
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
      schema: { querystring: forecastQuerySchema, response: { 200: envelope(forecastResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await crmController.getForecast(request.server.prisma, tenantId, request.query.year)
      return { data: result }
    },
  )

  // ── Sales performance ──────────────────────────────────────────────────────

  server.get(
    '/sales-performance',
    {
      preHandler: requireRole('MEMBER'),
      schema: { querystring: forecastQuerySchema, response: { 200: envelope(salesPerformanceResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await crmController.getSalesPerformance(request.server.prisma, tenantId, request.query.year)
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

  server.post('/quotas', {
    preHandler: requirePermission('deal.write'),
    schema: { body: salesQuotaWriteSchema, response: { 201: envelope(salesQuotaSchema), ...errorResponses } },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const quota = await request.server.prisma.$transaction(async tx => {
      const created = await crmController.createSalesQuota(tx, tenantId, request.body)
      await recordAuditLog(tx, {
        tenantId, actorId: userId, action: 'crm.quota.create', targetType: 'SalesQuota', targetId: created.id,
        metadata: { repName: created.repName, period: created.period, quota: created.quota },
      })
      return created
    })
    request.server.ssePublish(tenantId, [moduleKeyPrefix('crm')])
    reply.code(201)
    return { data: quota }
  })

  server.patch('/quotas/:id', {
    preHandler: requirePermission('deal.write'),
    schema: { params: idParamSchema, body: salesQuotaUpdateSchema, response: { 200: envelope(salesQuotaSchema), ...errorResponses } },
  }, async request => {
    const { tenantId, userId } = requireAuthContext(request)
    const quota = await request.server.prisma.$transaction(async tx => {
      const updated = await crmController.updateSalesQuota(tx, tenantId, request.params.id, request.body)
      await recordAuditLog(tx, {
        tenantId, actorId: userId, action: 'crm.quota.update', targetType: 'SalesQuota', targetId: updated.id,
        metadata: { fields: Object.keys(request.body), repName: updated.repName, period: updated.period, quota: updated.quota },
      })
      return updated
    })
    request.server.ssePublish(tenantId, [moduleKeyPrefix('crm')])
    return { data: quota }
  })

  server.delete('/quotas/:id', {
    preHandler: requirePermission('deal.write'),
    schema: { params: idParamSchema, response: { 204: noContentSchema, ...errorResponses } },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    await request.server.prisma.$transaction(async tx => {
      const quota = await crmController.deleteSalesQuota(tx, tenantId, request.params.id)
      await recordAuditLog(tx, {
        tenantId, actorId: userId, action: 'crm.quota.delete', targetType: 'SalesQuota', targetId: quota.id,
        metadata: { repName: quota.repName, period: quota.period, quota: quota.quota },
      })
    })
    request.server.ssePublish(tenantId, [moduleKeyPrefix('crm')])
    return reply.code(204).send()
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

  server.get('/deals/:id/activities', {
    preHandler: requireRole('MEMBER'),
    schema: {
      params: idParamSchema,
      querystring: dealActivityListQuerySchema,
      response: { 200: envelope(dealActivityListResponseSchema), ...errorResponses },
    },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    const result = await crmController.listDealActivities(request.server.prisma, tenantId, request.params.id, request.query)
    return { data: result }
  })

  server.post('/deals/:id/activities', {
    preHandler: requirePermission('deal.write'),
    schema: {
      params: idParamSchema,
      body: dealActivityWriteSchema,
      response: { 201: envelope(dealActivitySchema), ...errorResponses },
    },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const activity = await request.server.prisma.$transaction(async tx => {
      const created = await crmController.createDealActivity(tx, tenantId, request.params.id, userId, request.body)
      await recordAuditLog(tx, {
        tenantId,
        actorId: userId,
        action: 'crm.deal.activity.create',
        targetType: 'DealActivity',
        targetId: created.id,
        metadata: { dealId: created.dealId, type: created.type, title: created.title },
      })
      return created
    })
    request.server.ssePublish(tenantId, [moduleKeyPrefix('crm')])
    reply.code(201)
    return { data: activity }
  })

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
      const deal = await request.server.prisma.$transaction(async tx => {
        const deal = await crmController.createDeal(tx, tenantId, request.body, userId)
        await recordAuditLog(tx, {
          tenantId, actorId: userId, action: 'crm.deal.create',
          targetType: 'Deal', targetId: deal.id,
          metadata: { amount: deal.value, stage: deal.stage, closedAt: deal.closedAt },
        })
        return deal
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
      const deal = await request.server.prisma.$transaction(async tx => {
        const deal = await crmController.updateDeal(tx, tenantId, request.params.id, request.body, userId)
        await recordAuditLog(tx, {
          tenantId, actorId: userId, action: 'crm.deal.update',
          targetType: 'Deal', targetId: deal.id,
          metadata: { fields: Object.keys(request.body), stage: deal.stage, closedAt: deal.closedAt },
        })
        return deal
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('crm')])
      return { data: deal }
    },
  )
}
