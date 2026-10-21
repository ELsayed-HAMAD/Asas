import {
  envelope,
  errorResponses,
  idParamSchema,
  notificationMarkReadSchema,
  notificationsListResponseSchema,
} from '@asas/contracts'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { requireAuthContext } from '../../middlewares/rbac.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import {
  deleteNotification,
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notifications.js'

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.get(
    '/',
    {
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

