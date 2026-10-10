import { envelope, errorResponses } from '@asas/contracts'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { requireAuthContext } from '../../middlewares/rbac.js'
import { requirePermission } from '../../middlewares/permissions.js'

const auditLogItemSchema = z.object({
  id: z.string(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  metadata: z.string().nullable(),
  createdAt: z.string(),
  actor: z
    .object({
      id: z.string(),
      name: z.string().nullable(),
      email: z.string(),
    })
    .nullable(),
})

const auditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  targetType: z.string().optional(),
})

export async function auditLogRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.get(
    '/',
    {
      preHandler: requirePermission('auditLog.read'),
      schema: {
        querystring: auditLogQuerySchema,
        response: { 200: envelope(z.array(auditLogItemSchema)), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const { limit, targetType } = request.query

      const logs = await request.server.prisma.auditLog.findMany({
        where: {
          tenantId,
          ...(targetType ? { targetType } : {}),
        },
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
      })

      return {
        data: logs.map(l => ({
          id: l.id,
          action: l.action,
          targetType: l.targetType,
          targetId: l.targetId,
          metadata: l.metadata,
          createdAt: l.createdAt.toISOString(),
          actor: l.actor
            ? {
                id: l.actor.id,
                name: l.actor.name,
                email: l.actor.email,
              }
            : null,
        })),
      }
    },
  )
}

