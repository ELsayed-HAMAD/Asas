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
  attendanceClockResponseSchema,
  timesheetApprovalResponseSchema,
  timesheetBatchApprovalSchema,
  timesheetBatchApprovalResponseSchema,
  envelope,
  errorResponses,
  leaveRequestListResponseSchema,
  leaveRequestSchema,
  leaveRequestWriteSchema,
  idParamSchema,
} from '@asas/contracts'
import { requireAuthContext, requireRole } from '../../middlewares/rbac.js'
import { requirePermission } from '../../middlewares/permissions.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import * as attendanceService from './attendance.service.js'
import { AppError } from '../../utils/errors.js'
import { recordAuditLog } from '../../services/auditLog.js'

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
      const { tenantId, employeeId } = requireAuthContext(request)
      const data = await attendanceService.listAttendance(request.server.prisma, tenantId, employeeId)
      return { data }
    },
  )

  for (const [path, action] of [['/attendance/clock-in', 'IN'], ['/attendance/clock-out', 'OUT']] as const) {
    server.post(
      path,
      { preHandler: requireRole('MEMBER'), schema: { response: { 200: envelope(attendanceClockResponseSchema), ...errorResponses } } },
      async request => {
        const { tenantId, employeeId } = requireAuthContext(request)
        if (!employeeId) throw new AppError(400, 'Link this account to an employee record before clocking in')
        const result = await attendanceService.clockAttendance(request.server.prisma, tenantId, employeeId, action)
        request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
        return { data: result }
      },
    )
  }

  server.post(
    '/attendance/timesheets/:id/approve',
    {
      preHandler: requirePermission('employee.write'),
      schema: {
        params: idParamSchema,
        response: { 200: envelope(timesheetApprovalResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      const result = await attendanceService.approveTimesheet(request.server.prisma, tenantId, request.params.id)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'hr.timesheet.approve',
        targetType: 'Timesheet',
        targetId: request.params.id,
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      return { data: result }
    },
  )

  server.post('/attendance/timesheets/approve-valid', {
    preHandler: requirePermission('employee.write'),
    schema: {
      body: timesheetBatchApprovalSchema,
      response: { 200: envelope(timesheetBatchApprovalResponseSchema), ...errorResponses },
    },
  }, async request => {
    const { tenantId, userId } = requireAuthContext(request)
    const result = await attendanceService.approveValidTimesheets(request.server.prisma, tenantId, request.body.ids)
    for (const id of result.ids) {
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'hr.timesheet.approve',
        targetType: 'Timesheet',
        targetId: id,
        metadata: { batch: true },
      })
    }
    request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
    return { data: result }
  })

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
