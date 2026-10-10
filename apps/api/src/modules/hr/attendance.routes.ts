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
  attendanceQuerySchema,
  attendanceClockResponseSchema,
  attendanceExceptionSchema,
  attendancePunchCorrectionSchema,
  attendancePunchCorrectionResponseSchema,
  timesheetApprovalResponseSchema,
  timesheetBatchApprovalSchema,
  timesheetBatchApprovalResponseSchema,
  envelope,
  errorResponses,
  leaveRequestListResponseSchema,
  leaveRequestSchema,
  leaveRequestWriteSchema,
  selfLeaveRequestWriteSchema,
  leaveBalanceQuerySchema,
  leaveBalanceResponseSchema,
  leavePolicyListResponseSchema,
  leavePolicyTypeParamSchema,
  leavePolicyWriteSchema,
  leavePolicySchema,
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
        querystring: attendanceQuerySchema,
        response: { 200: envelope(attendanceResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId, employeeId, role } = requireAuthContext(request)
      const isWorkspaceAdmin = role === 'OWNER' || role === 'ADMIN'
      if (!isWorkspaceAdmin && !employeeId) throw new AppError(409, 'Link this account to an employee record to view attendance')
      const data = await attendanceService.listAttendance(
        request.server.prisma, tenantId, employeeId, request.query.rangeDays as 7 | 30 | 90, isWorkspaceAdmin,
      )
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
      const result = await request.server.prisma.$transaction(async tx => {
        const approval = await attendanceService.approveTimesheetsInTransaction(tx, tenantId, [request.params.id])
        await recordAuditLog(tx, {
          tenantId, actorId: userId, action: 'hr.timesheet.approve', targetType: 'Timesheet', targetId: request.params.id,
        })
        return { id: request.params.id, approvedAt: approval.approvedAt }
      }, { isolationLevel: 'Serializable' })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      return { data: result }
    },
  )

  server.patch(
    '/attendance/timesheet-days/:id/correct',
    {
      preHandler: requirePermission('employee.write'),
      schema: {
        params: idParamSchema,
        body: attendancePunchCorrectionSchema,
        response: { 200: envelope(attendancePunchCorrectionResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      const correction = await request.server.prisma.$transaction(async tx => {
        const result = await attendanceService.correctAttendancePunchInTransaction(tx, tenantId, request.params.id, request.body)
        await recordAuditLog(tx, {
          tenantId, actorId: userId, action: 'hr.attendance.punch.correct', targetType: 'TimesheetDay', targetId: request.params.id,
          metadata: { before: result.previous, after: result.correction },
        })
        return result.correction
      }, { isolationLevel: 'Serializable' })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      return { data: correction }
    },
  )

  server.post(
    '/attendance/exceptions/:id/resolve',
    {
      preHandler: requirePermission('employee.write'),
      schema: {
        params: idParamSchema,
        response: { 200: envelope(attendanceExceptionSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      const result = await request.server.prisma.$transaction(async tx => {
        const exception = await attendanceService.resolveAttendanceExceptionInTransaction(tx, tenantId, request.params.id)
        await recordAuditLog(tx, {
          tenantId, actorId: userId, action: 'hr.attendance.exception.resolve', targetType: 'AttendanceException', targetId: request.params.id,
        })
        return exception
      }, { isolationLevel: 'Serializable' })
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
    const result = await request.server.prisma.$transaction(async tx => {
      const approval = await attendanceService.approveTimesheetsInTransaction(tx, tenantId, request.body.ids)
      for (const id of approval.ids) {
        await recordAuditLog(tx, {
          tenantId, actorId: userId, action: 'hr.timesheet.approve', targetType: 'Timesheet', targetId: id,
          metadata: { batch: true },
        })
      }
      return approval
    }, { isolationLevel: 'Serializable' })
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
      const { tenantId, employeeId, role } = requireAuthContext(request)
      const isWorkspaceAdmin = role === 'OWNER' || role === 'ADMIN'
      if (!isWorkspaceAdmin && !employeeId) throw new AppError(409, 'Link this account to an employee record to view leave requests')
      const data = await attendanceService.listLeaveRequests(request.server.prisma, tenantId, isWorkspaceAdmin ? undefined : employeeId!)
      return { data }
    },
  )

  server.get('/leave-balances', {
    preHandler: requireRole('MEMBER'),
    schema: { querystring: leaveBalanceQuerySchema, response: { 200: envelope(leaveBalanceResponseSchema), ...errorResponses } },
  }, async request => {
    const { tenantId, employeeId, role } = requireAuthContext(request)
    const isWorkspaceAdmin = role === 'OWNER' || role === 'ADMIN'
    if (!isWorkspaceAdmin && !employeeId) throw new AppError(409, 'Link this account to an employee record to view leave balances')
    const result = await attendanceService.getLeaveBalances(request.server.prisma, tenantId, request.query, isWorkspaceAdmin ? undefined : employeeId!)
    return { data: result }
  })

  server.get('/leave-policies', {
    preHandler: requireRole('MEMBER'),
    schema: { response: { 200: envelope(leavePolicyListResponseSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    const result = await attendanceService.listLeavePolicies(request.server.prisma, tenantId)
    return { data: result }
  })

  server.put('/leave-policies/:type', {
    preHandler: requirePermission('employee.write'),
    schema: {
      params: leavePolicyTypeParamSchema,
      body: leavePolicyWriteSchema,
      response: { 200: envelope(leavePolicySchema), ...errorResponses },
    },
  }, async request => {
    const { tenantId, userId } = requireAuthContext(request)
    const policy = await request.server.prisma.$transaction(async tx => {
      const updated = await attendanceService.upsertLeavePolicy(tx, tenantId, request.params.type, request.body)
      await recordAuditLog(tx, {
        tenantId, actorId: userId, action: 'hr.leave.policy.update', targetType: 'LeavePolicy', targetId: request.params.type,
        metadata: { annualAllowanceDays: request.body.annualAllowanceDays, weekdaysOnly: request.body.weekdaysOnly },
      })
      return updated
    }, { isolationLevel: 'Serializable' })
    request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
    return { data: policy }
  })

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
      const { tenantId, userId } = requireAuthContext(request)
      const leaveRequest = await request.server.prisma.$transaction(async tx => {
        const created = await attendanceService.createLeaveRequestInTransaction(tx, tenantId, request.body.employeeId, request.body)
        await recordAuditLog(tx, {
          tenantId, actorId: userId, action: 'hr.leave.request.create', targetType: 'LeaveRequest', targetId: created.id,
        })
        return created
      }, { isolationLevel: 'Serializable' })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      reply.code(201)
      return { data: leaveRequest }
    },
  )

  server.post(
    '/leave-requests/self',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        body: selfLeaveRequestWriteSchema,
        response: { 201: envelope(leaveRequestSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId, employeeId } = requireAuthContext(request)
      if (!employeeId) throw new AppError(409, 'Link this account to an employee record before requesting time off')
      const leaveRequest = await request.server.prisma.$transaction(async tx => {
        const created = await attendanceService.createLeaveRequestInTransaction(tx, tenantId, employeeId, request.body)
        await recordAuditLog(tx, {
          tenantId, actorId: userId, action: 'hr.leave.request.create', targetType: 'LeaveRequest', targetId: created.id,
          metadata: { selfService: true },
        })
        return created
      }, { isolationLevel: 'Serializable' })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      reply.code(201)
      return { data: leaveRequest }
    },
  )

  for (const decision of ['APPROVED', 'REJECTED'] as const) {
    const action = decision === 'APPROVED' ? 'approve' : 'reject'
    server.post(
      `/leave-requests/:id/${action}`,
      {
        preHandler: requirePermission('employee.write'),
        schema: {
          params: idParamSchema,
          response: { 200: envelope(leaveRequestSchema), ...errorResponses },
        },
      },
      async request => {
        const { tenantId, userId } = requireAuthContext(request)
        const leaveRequest = await request.server.prisma.$transaction(async tx => {
          const updated = await attendanceService.decideLeaveRequestInTransaction(tx, tenantId, request.params.id, decision)
          await recordAuditLog(tx, {
            tenantId, actorId: userId, action: `hr.leave.request.${action}`, targetType: 'LeaveRequest', targetId: request.params.id,
          })
          return updated
        }, { isolationLevel: 'Serializable' })
        request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
        return { data: leaveRequest }
      },
    )
  }
}
