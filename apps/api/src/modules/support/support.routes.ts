import {
  envelope,
  errorResponses,
  idParamSchema,
  supportTicketListResponseSchema,
  supportTicketSchema,
  supportTicketUpdateSchema,
  supportTicketWriteSchema,
} from '@asas/contracts'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { requireAuthContext, requireRole } from '../../middlewares/rbac.js'
import { requirePermission } from '../../middlewares/permissions.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import { AppError } from '../../utils/errors.js'

function mapTicket(row: {
  id: string
  subject: string
  channel: string | null
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
  createdAt: Date
  resolvedAt: Date | null
}) {
  return {
    id: row.id,
    subject: row.subject,
    channel: row.channel,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  }
}

export async function supportRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.get(
    '/tickets',
    {
      preHandler: requireRole('MEMBER'),
      schema: { response: { 200: envelope(supportTicketListResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const rows = await request.server.prisma.supportTicket.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      })
      return { data: { items: rows.map(mapTicket) } }
    },
  )

  server.post(
    '/tickets',
    {
      preHandler: requirePermission('support.ticket.write'),
      schema: { body: supportTicketWriteSchema, response: { 201: envelope(supportTicketSchema), ...errorResponses } },
    },
    async (request, reply) => {
      const { tenantId } = requireAuthContext(request)
      const row = await request.server.prisma.supportTicket.create({
        data: { tenantId, subject: request.body.subject, channel: request.body.channel ?? null },
      })
      reply.code(201)
      request.server.ssePublish(tenantId, [moduleKeyPrefix('support')])
      return { data: mapTicket(row) }
    },
  )

  server.patch(
    '/tickets/:id',
    {
      preHandler: requirePermission('support.ticket.write'),
      schema: {
        params: idParamSchema,
        body: supportTicketUpdateSchema,
        response: { 200: envelope(supportTicketSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const existing = await request.server.prisma.supportTicket.findFirst({
        where: { id: request.params.id, tenantId },
      })
      if (!existing) throw new AppError(404, 'Support ticket not found')
      const row = await request.server.prisma.supportTicket.update({
        where: { id: existing.id },
        data: {
          status: request.body.status,
          resolvedAt: ['RESOLVED', 'CLOSED'].includes(request.body.status) ? new Date() : null,
        },
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('support')])
      return { data: mapTicket(row) }
    },
  )
}
