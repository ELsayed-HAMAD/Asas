import {
  envelope,
  errorResponses,
  generalSettingsSchema,
  generalSettingsUpdateSchema,
  idParamSchema,
  integrationSchema,
  integrationsListResponseSchema,
  integrationUpdateSchema,
  integrationWriteSchema,
  webhookLogsResponseSchema,
  notificationSettingsSchema,
  notificationSettingsUpdateSchema,
  billingSettingsSchema,
  backupSchedulesResponseSchema,
  backupScheduleSchema,
  backupScheduleWriteSchema,
  backupScheduleUpdateSchema,
} from '@asas/contracts'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { requireAuthContext, requireRole } from '../../middlewares/rbac.js'
import { requirePermission } from '../../middlewares/permissions.js'
import { recordAuditLog } from '../../services/auditLog.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import * as settingsController from './settings.controller.js'

/**
 * Settings — the tenant's general profile, notification preferences, and integrations.
 *
 * The RBAC split mirrors HR: reads go through `requireRole('MEMBER')` (any tenant member can see
 * the workspace's own settings), while every write goes through `requirePermission` and is
 * ADMIN-only by the map in `middlewares/permissions.ts`. `tenantId` is read only from the
 * resolved session, never from a parameter, and every privileged mutation is audit-logged inside
 * the handler (the handler knows the target and the outcome; the preHandler does not).
 */
export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>()

  // ── General ───────────────────────────────────────────────────────────────

  server.get(
    '/general',
    {
      preHandler: requireRole('MEMBER'),
      schema: { response: { 200: envelope(generalSettingsSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const settings = await settingsController.getGeneral(request.server.prisma, tenantId)
      return { data: settings }
    },
  )

  server.patch(
    '/general',
    {
      preHandler: requirePermission('settings.general.update'),
      schema: {
        body: generalSettingsUpdateSchema,
        response: { 200: envelope(generalSettingsSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      const settings = await settingsController.updateGeneral(request.server.prisma, tenantId, request.body)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'settings.general.update',
        targetType: 'Tenant',
        targetId: tenantId,
        metadata: { fields: Object.keys(request.body) },
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('settings')])
      return { data: settings }
    },
  )

  // ── Billing and backups ──────────────────────────────────────────────────

  server.get('/billing', {
    preHandler: requireRole('MEMBER'),
    schema: { response: { 200: envelope(billingSettingsSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await settingsController.getBilling(request.server.prisma, tenantId) }
  })

  server.get('/backups', {
    preHandler: requireRole('MEMBER'),
    schema: { response: { 200: envelope(backupSchedulesResponseSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await settingsController.listBackups(request.server.prisma, tenantId) }
  })

  server.post('/backups', {
    preHandler: requirePermission('settings.billing.write'),
    schema: { body: backupScheduleWriteSchema, response: { 201: envelope(backupScheduleSchema), ...errorResponses } },
  }, async (request, reply) => {
    const { tenantId } = requireAuthContext(request)
    reply.code(201)
    return { data: await settingsController.createBackup(request.server.prisma, tenantId, request.body) }
  })

  server.patch('/backups/:id', {
    preHandler: requirePermission('settings.billing.write'),
    schema: { params: idParamSchema, body: backupScheduleUpdateSchema, response: { 200: envelope(backupScheduleSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await settingsController.updateBackup(request.server.prisma, tenantId, request.params.id, request.body) }
  })

  // ── Notifications ─────────────────────────────────────────────────────────

  server.get(
    '/notifications',
    {
      preHandler: requireRole('MEMBER'),
      schema: { response: { 200: envelope(notificationSettingsSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const settings = await settingsController.getNotifications(request.server.prisma, tenantId)
      return { data: settings }
    },
  )

  server.patch(
    '/notifications',
    {
      preHandler: requirePermission('settings.notifications.update'),
      schema: {
        body: notificationSettingsUpdateSchema,
        response: { 200: envelope(notificationSettingsSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      const settings = await settingsController.updateNotifications(request.server.prisma, tenantId, request.body)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'settings.notifications.update',
        targetType: 'Tenant',
        targetId: tenantId,
        metadata: { fields: Object.keys(request.body) },
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('settings')])
      return { data: settings }
    },
  )

  // ── Integrations ──────────────────────────────────────────────────────────

  server.get(
    '/integrations',
    {
      preHandler: requireRole('MEMBER'),
      schema: { response: { 200: envelope(integrationsListResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await settingsController.getIntegrations(request.server.prisma, tenantId)
      return { data: result }
    },
  )

  server.get('/integrations/:id/webhook-logs', {
    preHandler: requireRole('MEMBER'),
    schema: {
      params: idParamSchema,
      response: { 200: envelope(webhookLogsResponseSchema), ...errorResponses },
    },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await settingsController.getIntegrationWebhookLogs(request.server.prisma, tenantId, request.params.id) }
  })

  server.post(
    '/integrations',
    {
      preHandler: requirePermission('settings.integration.write'),
      schema: {
        body: integrationWriteSchema,
        response: { 201: envelope(integrationSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const integration = await settingsController.createIntegration(request.server.prisma, tenantId, request.body)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'settings.integration.create',
        targetType: 'Integration',
        targetId: integration.id,
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('settings')])
      reply.code(201)
      return { data: integration }
    },
  )

  server.patch(
    '/integrations/:id',
    {
      preHandler: requirePermission('settings.integration.write'),
      schema: {
        params: idParamSchema,
        body: integrationUpdateSchema,
        response: { 200: envelope(integrationSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      const integration = await settingsController.updateIntegration(
        request.server.prisma,
        tenantId,
        request.params.id,
        request.body,
      )
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'settings.integration.update',
        targetType: 'Integration',
        targetId: integration.id,
        metadata: {
          fields: Object.keys(request.body),
          // The credential *value* itself is never audited — only that it changed.
          credentialChanged: request.body.credential !== undefined,
        },
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('settings')])
      return { data: integration }
    },
  )
}
