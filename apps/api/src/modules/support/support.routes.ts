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
import { recordAuditLog } from '../../services/auditLog.js'
import { mailer } from '../../services/mailer.js'
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
      const { tenantId, userId } = requireAuthContext(request)
      const row = await request.server.prisma.$transaction(async tx => {
        const ticket = await tx.supportTicket.create({
          data: { tenantId, subject: request.body.subject, channel: request.body.channel ?? 'dashboard' },
        })
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'support.ticket.create',
          targetType: 'SupportTicket',
          targetId: ticket.id,
          metadata: { subject: ticket.subject, channel: ticket.channel },
        })
        return ticket
      })

      // Dispatch notification if tenant has a supportEmail configured
      try {
        const tenant = await request.server.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { supportEmail: true, name: true },
        })
        if (tenant?.supportEmail) {
          void mailer.enqueue({
            to: tenant.supportEmail,
            subject: `[Support Ticket] ${row.subject}`,
            text: `A new support ticket was created in workspace "${tenant.name}".\n\nTicket ID: ${row.id}\nSubject: ${row.subject}\nChannel: ${row.channel || 'dashboard'}\nDate: ${row.createdAt.toISOString()}`,
          }).catch((err: unknown) => {
            request.log.warn({ err }, 'Failed to dispatch support ticket notification')
          })
        }
      } catch (err: unknown) {
        request.log.warn({ err }, 'Failed to lookup tenant support email')
      }

      reply.code(201)
      request.server.ssePublish(tenantId, [moduleKeyPrefix('support')])
      return { data: mapTicket(row) }
    },
  )

  server.patch(
    '/tickets/:id',
    {
      preHandler: requirePermission('support.ticket.manage'),
      schema: {
        params: idParamSchema,
        body: supportTicketUpdateSchema,
        response: { 200: envelope(supportTicketSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      const row = await request.server.prisma.$transaction(async tx => {
        const existing = await tx.supportTicket.findFirst({
          where: { id: request.params.id, tenantId },
        })
        if (!existing) throw new AppError(404, 'Support ticket not found')
        const updated = await tx.supportTicket.update({
          where: { id: existing.id },
          data: {
            status: request.body.status,
            resolvedAt: ['RESOLVED', 'CLOSED'].includes(request.body.status) ? new Date() : null,
          },
        })
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'support.ticket.update',
          targetType: 'SupportTicket',
          targetId: updated.id,
          metadata: { previousStatus: existing.status, newStatus: updated.status },
        })
        return updated
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('support')])
      return { data: mapTicket(row) }
    },
  )
}
