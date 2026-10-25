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
  testIntegrationResponseSchema,
  webhookLogsResponseSchema,
  notificationSettingsSchema,
  notificationSettingsUpdateSchema,
  billingSettingsSchema,
  exchangeRateListQuerySchema,
  exchangeRateListResponseSchema,
  exchangeRateSchema,
  exchangeRateWriteSchema,
  workspaceDeleteResponseSchema,
  gdprAnonymizeRequestSchema,
  gdprAnonymizeResponseSchema,
  dataRetentionCleanupRequestSchema,
  dataRetentionCleanupResponseSchema,
} from '@asas/contracts'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { requireAuthContext, requireRole } from '../../middlewares/rbac.js'
import { requirePermission } from '../../middlewares/permissions.js'
import { recordAuditLog } from '../../services/auditLog.js'
import { getTenantStorageBytes } from '../../services/objectStorage.js'
import { ensureAutomaticBackupsUnavailable } from './settings.service.js'
import { executeDataRetentionCleanup } from '../../services/dataRetention.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import { AppError } from '../../utils/errors.js'
import { randomUUID } from 'node:crypto'
import { tenantLogoKey } from '../../services/objectStorage.js'
import { withStorageCapacity } from '../../services/entitlements.js'
import { z } from 'zod'
import * as settingsController from './settings.controller.js'

const MAX_LOGO_BYTES = 2 * 1024 * 1024
function isSafeLogoSvg(bytes: Buffer): boolean {
  const source = bytes.toString('utf8').replace(/^\uFEFF/, '').trim()
  const document = source.replace(/^(?:<\?xml\s+[^?]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*/i, '')
  return /^<svg(?:\s|>)/i.test(document)
    && !/<\s*(?:script|foreignObject|iframe|object|embed)\b/i.test(source)
    && !/<!DOCTYPE|<!ENTITY|<\?(?!xml\b)/i.test(source)
    && !/\bon[a-z]+\s*=|\b(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|javascript:|data:)/i.test(source)
    && !/\burl\s*\(\s*(?:https?:|\/\/|javascript:|data:)/i.test(source)
}

const LOGO_TYPES = {
  'image/png': { extension: 'png', signature: (bytes: Buffer) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/jpeg': { extension: 'jpg', signature: (bytes: Buffer) => bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
  'image/webp': { extension: 'webp', signature: (bytes: Buffer) => bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP' },
  'image/svg+xml': { extension: 'svg', signature: isSafeLogoSvg },
} as const

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

  server.put('/general/logo', {
    preHandler: requirePermission('settings.general.update'),
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { response: { 200: envelope(generalSettingsSchema), ...errorResponses } },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() as keyof typeof LOGO_TYPES | undefined
    const type = contentType ? LOGO_TYPES[contentType] : undefined
    const bytes = request.body
    if (!contentType || !type || !Buffer.isBuffer(bytes) || bytes.length === 0) throw new AppError(400, 'Choose a PNG, JPEG, WebP, or SVG logo image')
    if (bytes.length > MAX_LOGO_BYTES) throw new AppError(413, 'Logo image exceeds the 2 MB limit')
    if (!type.signature(bytes)) throw new AppError(400, 'The file contents do not match the selected image type')

    const logoId = randomUUID()
    const key = tenantLogoKey(tenantId, logoId, type.extension)
    const storage = request.server.objectStorage
    const logoUrl = new URL(`/api/v1/settings/general/logo/${logoId}.${type.extension}`, process.env.BETTER_AUTH_URL || 'http://127.0.0.1:4000').toString()
    try {
      const settings = await withStorageCapacity(
        request.server.prisma,
        storage,
        tenantId,
        bytes.length,
        async tx => {
          await storage.put(key, bytes, contentType)
          const updated = await settingsController.updateGeneral(tx, tenantId, { logoUrl })
          await recordAuditLog(tx, {
            tenantId,
            actorId: userId,
            action: 'settings.general.logo.upload',
            targetType: 'Tenant',
            targetId: tenantId,
            metadata: { contentType, sizeBytes: bytes.length },
          })
          return updated
        },
      )
      request.server.ssePublish(tenantId, [moduleKeyPrefix('settings')])
      return { data: settings }
    } catch (error) {
      await storage.delete(key).catch(deleteError => request.log.warn({ tenantId, err: deleteError }, 'Could not clean up an uncommitted workspace logo upload'))
      throw error
    }
  })

  server.get('/general/logo/:file', {
    preHandler: requireRole('MEMBER'),
    schema: { params: z.object({ file: z.string().regex(/^[0-9a-f-]{36}\.(?:png|jpg|webp|svg)$/i) }) },
  }, async (request, reply) => {
    const { tenantId } = requireAuthContext(request)
    const match = /^([0-9a-f-]{36})\.(png|jpg|webp|svg)$/i.exec(request.params.file)
    if (!match) throw new AppError(404, 'Workspace logo not found')
    const extension = match[2] as 'png' | 'jpg' | 'webp' | 'svg'
    const contentType = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' }[extension]
    const bytes = await request.server.objectStorage.get(tenantLogoKey(tenantId, match[1]!, extension))
    if (!bytes) throw new AppError(404, 'Workspace logo not found')
    reply.type(contentType).header('cache-control', 'private, max-age=300').header('x-content-type-options', 'nosniff')
    if (extension === 'svg') reply.header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
    return reply.send(bytes)
  })

  server.get('/exchange-rates', {
    preHandler: requireRole('MEMBER'),
    schema: { querystring: exchangeRateListQuerySchema, response: { 200: envelope(exchangeRateListResponseSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await settingsController.listExchangeRates(request.server.prisma, tenantId, request.query) }
  })

  server.post('/exchange-rates', {
    preHandler: requirePermission('settings.general.update'),
    schema: { body: exchangeRateWriteSchema, response: { 201: envelope(exchangeRateSchema), ...errorResponses } },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const rate = await request.server.prisma.$transaction(async tx => {
      const created = await settingsController.createExchangeRate(tx, tenantId, userId, request.body)
      await recordAuditLog(tx, {
        tenantId, actorId: userId, action: 'settings.exchange_rate.create', targetType: 'ExchangeRate', targetId: created.id,
        metadata: { currency: created.currency, baseCurrency: created.baseCurrency, rateToBase: created.rateToBase, effectiveAt: created.effectiveAt, reference: created.reference },
      })
      return created
    })
    request.server.ssePublish(tenantId, [moduleKeyPrefix('settings')])
    reply.code(201)
    return { data: rate }
  })

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
      const settings = await request.server.prisma.$transaction(async tx => {
        const settings = await settingsController.updateGeneral(tx, tenantId, request.body)
        await recordAuditLog(tx, {
          tenantId, actorId: userId, action: 'settings.general.update',
          targetType: 'Tenant', targetId: tenantId,
          metadata: { fields: Object.keys(request.body), currency: settings.currency, currencyLockedAt: settings.currencyLockedAt },
        })
        return settings
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('settings')])
      return { data: settings }
    },
  )

  server.delete(
    '/workspace',
    {
      preHandler: requirePermission('organization.delete'),
      schema: {
        response: { 200: envelope(workspaceDeleteResponseSchema), ...errorResponses },
      },
    },
    async (request) => {
      const { tenantId, userId } = requireAuthContext(request)
      const result = await settingsController.deleteWorkspace(request.server.prisma, tenantId, userId, request.server.stripeBilling)
      request.log.info({ tenantId, userId, action: 'organization.delete' }, 'Workspace deleted')
      return { data: result }
    },
  )

  // ── Billing and backups ──────────────────────────────────────────────────

  server.get('/billing', {
    preHandler: requireRole('MEMBER'),
    schema: { response: { 200: envelope(billingSettingsSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    let storageUsedGb: number | null = null
    try {
      storageUsedGb = await getTenantStorageBytes(request.server.objectStorage, tenantId) / 1_000_000_000
    } catch (error) {
      request.log.warn({ tenantId, err: error }, 'Could not measure workspace object storage usage')
    }
    return { data: await settingsController.getBilling(request.server.prisma, tenantId, storageUsedGb) }
  })

  server.get('/backups', {
    preHandler: requireRole('MEMBER'),
    schema: { description: 'Automated backups are not configured for this deployment.', response: { ...errorResponses } },
  }, async () => {
    return ensureAutomaticBackupsUnavailable()
  })

  server.post('/backups', {
    preHandler: requirePermission('settings.billing.write'),
    schema: { description: 'Automated backups are not configured for this deployment.', response: { ...errorResponses } },
  }, async () => {
    return ensureAutomaticBackupsUnavailable()
  })

  server.patch('/backups/:id', {
    preHandler: requirePermission('settings.billing.write'),
    schema: { description: 'Automated backups are not configured for this deployment.', params: idParamSchema, response: { ...errorResponses } },
  }, async () => {
    return ensureAutomaticBackupsUnavailable()
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
      const settings = await request.server.prisma.$transaction(async tx => {
        const updated = await settingsController.updateNotifications(tx, tenantId, request.body)
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'settings.notifications.update',
          targetType: 'Tenant',
          targetId: tenantId,
          metadata: { fields: Object.keys(request.body) },
        })
        return updated
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
      const integration = await request.server.prisma.$transaction(async tx => {
        const created = await settingsController.createIntegration(tx, tenantId, request.body)
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'settings.integration.create',
          targetType: 'Integration',
          targetId: created.id,
        })
        return created
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
      const integration = await request.server.prisma.$transaction(async tx => {
        const updated = await settingsController.updateIntegration(tx, tenantId, request.params.id, request.body)
        await recordAuditLog(tx, {
        tenantId,
        actorId: userId,
        action: 'settings.integration.update',
        targetType: 'Integration',
        targetId: updated.id,
        metadata: {
          fields: Object.keys(request.body),
          // The credential *value* itself is never audited — only that it changed.
          credentialChanged: request.body.credential !== undefined,
        },
        })
        return updated
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('settings')])
      return { data: integration }
    },
  )

  server.post(
    '/integrations/:id/test',
    {
      preHandler: requirePermission('settings.integration.write'),
      schema: {
        params: idParamSchema,
        response: {
          200: envelope(testIntegrationResponseSchema),
          ...errorResponses,
        },
      },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      const integration = await request.server.prisma.integration.findFirst({
        where: { id: request.params.id, tenantId },
        select: { id: true },
      })
      if (!integration) throw new AppError(404, 'Integration not found')

      // Persist the actor's probe attempt before performing an external network side effect.
      // If the audit store is unavailable, do not send the endpoint a request.
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'settings.integration.test',
        targetType: 'Integration',
        targetId: integration.id,
        metadata: { event: 'ping', status: 'REQUESTED' },
      })
      const result = await settingsController.testIntegration(
        request.server.prisma,
        tenantId,
        request.params.id,
      )
      request.server.ssePublish(tenantId, [moduleKeyPrefix('settings')])
      return { data: result }
    },
  )

  server.post(
    '/compliance/anonymize',
    {
      preHandler: requirePermission('compliance.gdpr.anonymize'),
      schema: {
        body: gdprAnonymizeRequestSchema,
        response: {
          200: envelope(gdprAnonymizeResponseSchema),
          ...errorResponses,
        },
      },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      const result = await request.server.prisma.$transaction(async tx => {
        const anonymized = await settingsController.anonymizeEntity(tx, tenantId, request.body)
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'compliance.gdpr.anonymize',
          targetType: request.body.targetType,
          targetId: request.body.targetId,
          metadata: { reason: request.body.reason },
        })
        return anonymized
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr'), moduleKeyPrefix('settings')])
      return { data: result }
    },
  )

  server.post(
    '/compliance/cleanup',
    {
      preHandler: requirePermission('compliance.dataRetention.cleanup'),
      schema: {
        body: dataRetentionCleanupRequestSchema,
        response: {
          200: envelope(dataRetentionCleanupResponseSchema),
          ...errorResponses,
        },
      },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      const result = await request.server.prisma.$transaction(async tx => {
        const cleanup = await executeDataRetentionCleanup(tx, tenantId, request.body, request.server.objectStorage)
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'compliance.dataRetention.cleanup',
          targetType: 'DataRetention',
          metadata: {
            retentionDays: request.body.retentionDays,
            purgedCounts: cleanup.purgedCounts,
          },
        })
        return cleanup
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('settings')])
      return { data: result }
    },
  )
}
