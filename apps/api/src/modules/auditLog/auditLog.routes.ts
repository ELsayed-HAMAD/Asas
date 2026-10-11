import {
  auditLogListResponseSchema,
  auditLogQuerySchema,
  envelope,
  errorResponses,
} from '@asas/contracts'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { requireAuthContext } from '../../middlewares/rbac.js'
import { requirePermission } from '../../middlewares/permissions.js'

export async function auditLogRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.get(
    '/',
    {
      preHandler: requirePermission('auditLog.read'),
      schema: {
        querystring: auditLogQuerySchema,
        response: { 200: envelope(auditLogListResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const { page = 1, limit = 20, targetType, targetId } = request.query

      const where = {
        tenantId,
        ...(targetType ? { targetType } : {}),
        ...(targetId ? { targetId } : {}),
      }

      const skip = (page - 1) * limit
      const [logs, total] = await Promise.all([
        request.server.prisma.auditLog.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            actor: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        }),
        request.server.prisma.auditLog.count({ where }),
      ])

      const pages = Math.ceil(total / limit) || 1

      return {
        data: {
          items: logs.map(l => ({
            id: l.id,
            action: l.action,
            targetType: l.targetType,
            targetId: l.targetId,
            metadata: l.metadata,
            createdAt: l.createdAt.toISOString(),
            actorName: l.actor?.name ?? l.actor?.email ?? 'System',
            actor: l.actor
              ? {
                  id: l.actor.id,
                  name: l.actor.name,
                  email: l.actor.email,
                }
              : null,
          })),
          pagination: {
            page,
            limit,
            total,
            pages,
            hasMore: page < pages,
          },
        },
      }
    },
  )
}


