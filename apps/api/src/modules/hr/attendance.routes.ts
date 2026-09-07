/**
 * HR attendance + leave-request routes.
 *
 * Reads are open to any tenant member (`requireRole('MEMBER')`). Creating a leave request is
 * a write to employee records, gated on `employee.write` (ADMIN+). Each successful write calls
 * `ssePublish` with the `hr` key prefix so every open tab invalidates its attendance queries.
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import {
  attendanceResponseSchema,
  envelope,
  errorResponses,
  leaveRequestListResponseSchema,
  leaveRequestSchema,
  leaveRequestWriteSchema,
} from '@asas/contracts'
import { requireAuthContext, requireRole } from '../../middlewares/rbac.js'
import { requirePermission } from '../../middlewares/permissions.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import * as attendanceService from './attendance.service.js'

export async function attendanceRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.get(
    '/attendance',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        response: { 200: envelope(attendanceResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const data = await attendanceService.listAttendance(request.server.prisma, tenantId)
      return { data }
    },
  )

  server.get(
    '/leave-requests',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        response: { 200: envelope(leaveRequestListResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const data = await attendanceService.listLeaveRequests(request.server.prisma, tenantId)
      return { data }
    },
  )

  server.post(
    '/leave-requests',
    {
      preHandler: requirePermission('employee.write'),
      schema: {
        body: leaveRequestWriteSchema,
        response: { 201: envelope(leaveRequestSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId } = requireAuthContext(request)
      const leaveRequest = await attendanceService.createLeaveRequest(
        request.server.prisma,
        tenantId,
        request.body,
      )
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      reply.code(201)
      return { data: leaveRequest }
    },
  )
}
