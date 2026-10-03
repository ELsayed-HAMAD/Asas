import {
  departmentListResponseSchema,
  departmentSchema,
  departmentWriteSchema,
  employeeListQuerySchema,
  employeeListResponseSchema,
  employeeSchema,
  employeeUpdateSchema,
  employeeWriteSchema,
  envelope,
  errorResponses,
  idParamSchema,
  noContentSchema,
} from '@asas/contracts'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { hasRequiredRole, requireAuthContext, requireRole } from '../../middlewares/rbac.js'
import { requirePermission } from '../../middlewares/permissions.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import { recordAuditLog } from '../../services/auditLog.js'
import * as departmentsService from './departments.service.js'
import * as employeesService from './employees.service.js'

/**
 * HR employees + departments \u2014 the reference slice for the rebuild (see the plan's Phase 2).
 * Every route goes through either `requireRole` (read access, any tenant member) or
 * `requirePermission` (writes; see middlewares/permissions.ts for who can do what), and reads
 * `tenantId` only from the resolved session \u2014 never from a request parameter \u2014 so there is no
 * way to address another tenant's rows.
 *
 * Each successful write mutation also calls the SSE `ssePublish` helper with the `hr` key
 * prefix, so every other open tab in the tenant invalidates its employee/department queries
 * without polling (Phase 7). The payroll surface (runs, approvals, payslips) lives in
 * `payroll.routes.ts` and candidates + CV uploads in `candidates.routes.ts`.
 */
export async function hrRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.get(
    '/departments',
    {
      preHandler: requireRole('MEMBER'),
      schema: { response: { 200: envelope(departmentListResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const items = await departmentsService.listDepartments(request.server.prisma, tenantId)
      return { data: { items } }
    },
  )

  server.post(
    '/departments',
    {
      preHandler: requirePermission('department.write'),
      schema: {
        body: departmentWriteSchema,
        response: { 201: envelope(departmentSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId } = requireAuthContext(request)
      const department = await departmentsService.createDepartment(request.server.prisma, tenantId, request.body)
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      reply.code(201)
      return { data: department }
    },
  )

  server.get(
    '/employees',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        querystring: employeeListQuerySchema,
        response: { 200: envelope(employeeListResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId, role } = requireAuthContext(request)
      const canReadSalary = hasRequiredRole(role, 'ADMIN')
      const result = await employeesService.listEmployees(request.server.prisma, tenantId, request.query, canReadSalary)
      return { data: result }
    },
  )

  server.get(
    '/employees/:id',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        params: idParamSchema,
        response: { 200: envelope(employeeSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId, role } = requireAuthContext(request)
      const canReadSalary = hasRequiredRole(role, 'ADMIN')
      const employee = await employeesService.getEmployee(request.server.prisma, tenantId, request.params.id, canReadSalary)
      return { data: employee }
    },
  )

  server.post(
    '/employees',
    {
      preHandler: requirePermission('employee.write'),
      schema: {
        body: employeeWriteSchema,
        response: { 201: envelope(employeeSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, role } = requireAuthContext(request)
      const canReadSalary = hasRequiredRole(role, 'ADMIN')
      const employee = await employeesService.createEmployee(request.server.prisma, tenantId, request.body, canReadSalary)
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      reply.code(201)
      return { data: employee }
    },
  )

  server.patch(
    '/employees/:id',
    {
      preHandler: requirePermission('employee.write'),
      schema: {
        params: idParamSchema,
        body: employeeUpdateSchema,
        response: { 200: envelope(employeeSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId, role } = requireAuthContext(request)
      const canReadSalary = hasRequiredRole(role, 'ADMIN')
      const employee = await employeesService.updateEmployee(
        request.server.prisma,
        tenantId,
        request.params.id,
        request.body,
        canReadSalary,
      )
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      return { data: employee }
    },
  )

  server.delete(
    '/employees/:id',
    {
      preHandler: requirePermission('employee.delete'),
      schema: {
        params: idParamSchema,
        response: { 204: noContentSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      await employeesService.deleteEmployee(request.server.prisma, tenantId, request.params.id)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'employee.delete',
        targetType: 'Employee',
        targetId: request.params.id,
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      reply.code(204)
    },
  )
}
