import { authenticate } from '../../middlewares/authenticate.js'
import { tenantResolver } from '../../middlewares/tenantResolver.js'
import { success } from '../../utils/response.js'
import {
  candidateStageSchema,
  candidateWriteSchema,
  departmentWriteSchema,
  employeeWriteSchema,
  leaveWriteSchema,
  payrollLinePatchSchema,
} from './hr.schema.js'
import * as hrService from './hr.service.js'

export async function hrRoutes(app) {
  app.addHook('preHandler', authenticate)

  app.get('/departments', async (request, reply) => {
    const tenantId = tenantResolver(request)
    return success(reply, { items: await hrService.listDepartments(app.prisma, tenantId) })
  })

  app.post('/departments', async (request, reply) => {
    const tenantId = tenantResolver(request)
    const input = departmentWriteSchema.parse(request.body)
    return success(reply, await hrService.createDepartment(app.prisma, tenantId, input), 201)
  })

  app.get('/employees', async (request, reply) => {
    const tenantId = tenantResolver(request)
    return success(reply, await hrService.listEmployees(app.prisma, tenantId, request.query))
  })

  app.get('/employees/:id', async (request, reply) => {
    const tenantId = tenantResolver(request)
    return success(reply, await hrService.getEmployee(app.prisma, tenantId, request.params.id))
  })

  app.post('/employees', async (request, reply) => {
    const tenantId = tenantResolver(request)
    const input = employeeWriteSchema.parse(request.body)
    return success(reply, await hrService.createEmployee(app.prisma, tenantId, input), 201)
  })

  app.patch('/employees/:id', async (request, reply) => {
    const tenantId = tenantResolver(request)
    const input = employeeWriteSchema.partial().parse(request.body)
    return success(reply, await hrService.updateEmployee(app.prisma, tenantId, request.params.id, input))
  })

  app.delete('/employees/:id', async (request, reply) => {
    const tenantId = tenantResolver(request)
    await hrService.deleteEmployee(app.prisma, tenantId, request.params.id)
    return reply.code(204).send()
  })

  app.get('/payroll/runs', async (request, reply) => {
    const tenantId = tenantResolver(request)
    return success(reply, { items: await hrService.listPayrollRuns(app.prisma, tenantId) })
  })

  app.post('/payroll/runs/:id/approve', async (request, reply) => {
    const tenantId = tenantResolver(request)
    return success(reply, await hrService.approvePayrollRun(app.prisma, tenantId, request.params.id))
  })

  app.patch('/payroll/lines/:id', async (request, reply) => {
    const tenantId = tenantResolver(request)
    const input = payrollLinePatchSchema.parse(request.body)
    return success(reply, await hrService.patchPayrollLine(app.prisma, tenantId, request.params.id, input))
  })

  app.get('/attendance', async (request, reply) => {
    const tenantId = tenantResolver(request)
    return success(reply, await hrService.listAttendance(app.prisma, tenantId))
  })

  app.post('/leave-requests', async (request, reply) => {
    const tenantId = tenantResolver(request)
    const input = leaveWriteSchema.parse(request.body)
    return success(reply, await hrService.createLeaveRequest(app.prisma, tenantId, input), 201)
  })

  app.get('/candidates', async (request, reply) => {
    const tenantId = tenantResolver(request)
    return success(reply, await hrService.listCandidates(app.prisma, tenantId, request.query))
  })

  app.post('/candidates', async (request, reply) => {
    const tenantId = tenantResolver(request)
    const input = candidateWriteSchema.parse(request.body)
    return success(reply, await hrService.createCandidate(app.prisma, tenantId, input), 201)
  })

  app.patch('/candidates/:id/stage', async (request, reply) => {
    const tenantId = tenantResolver(request)
    const input = candidateStageSchema.parse(request.body)
    return success(reply, await hrService.updateCandidateStage(app.prisma, tenantId, request.params.id, input))
  })
}
