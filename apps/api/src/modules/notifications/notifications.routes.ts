import {
  envelope,
  errorResponses,
  idParamSchema,
  notificationMarkReadSchema,
  notificationsListResponseSchema,
  notificationUsageSchema,
} from '@asas/contracts'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { requireAuthContext, requireRole } from '../../middlewares/rbac.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import {
  deleteNotification,
  getUserNotificationUsage,
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notifications.js'

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.get(
    '/stats',
    {
      preHandler: requireRole('MEMBER'),
      schema: { response: { 200: envelope(notificationUsageSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      return { data: await getUserNotificationUsage(request.server.prisma, tenantId, userId) }
    },
  )

  server.get(
    '/',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        response: {
          200: envelope(notificationsListResponseSchema),
          ...errorResponses,
        },
      },
    },
    async (request) => {
      const { tenantId, userId } = requireAuthContext(request)
      const data = await listUserNotifications(request.server.prisma, tenantId, userId)
      return { data }
    },
  )

  server.patch(
    '/:id/read',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        params: idParamSchema,
        body: notificationMarkReadSchema.optional(),
        response: {
          200: envelope(z.object({ success: z.boolean() })),
          ...errorResponses,
        },
      },
    },
    async (request) => {
      const { tenantId, userId } = requireAuthContext(request)
      const read = request.body?.read ?? true
      await markNotificationRead(request.server.prisma, tenantId, userId, request.params.id, read)
      request.server.ssePublish(tenantId, [moduleKeyPrefix('notifications')])
      return { data: { success: true } }
    },
  )

  server.post(
    '/mark-all-read',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        response: {
          200: envelope(z.object({ success: z.boolean() })),
          ...errorResponses,
        },
      },
    },
    async (request) => {
      const { tenantId, userId } = requireAuthContext(request)
      await markAllNotificationsRead(request.server.prisma, tenantId, userId)
      request.server.ssePublish(tenantId, [moduleKeyPrefix('notifications')])
      return { data: { success: true } }
    },
  )

  server.delete(
    '/:id',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        params: idParamSchema,
        response: {
          200: envelope(z.object({ success: z.boolean() })),
          ...errorResponses,
        },
      },
    },
    async (request) => {
      const { tenantId, userId } = requireAuthContext(request)
      await deleteNotification(request.server.prisma, tenantId, userId, request.params.id)
      request.server.ssePublish(tenantId, [moduleKeyPrefix('notifications')])
      return { data: { success: true } }
    },
  )
}

