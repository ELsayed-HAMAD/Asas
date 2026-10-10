import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import {
  envelope,
  errorResponses,
  financeVoidSchema,
  idSchema,
  idParamSchema,
  payrollLineAdjustSchema,
  payrollRunCreateSchema,
  payrollRunListQuerySchema,
  payrollRunListResponseSchema,
  payrollRunSchema,
} from '@asas/contracts'
import { hasRequiredRole, requireAuthContext, requireRole } from '../../middlewares/rbac.js'
import { PERMISSIONS, requirePermission } from '../../middlewares/permissions.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import { recordAuditLog } from '../../services/auditLog.js'
import { renderPayslipPdf } from '../../services/pdf.js'
import * as payrollService from './payroll.service.js'

/**
 * HR payroll — runs, line adjustments, approval, and payslips (the plan's Phase 2 surface).
 *
 * Run reads expose salaries, so they gate on `payroll.read`; a MEMBER may only download their
 * own payslip. Every write gates on a named permission — `payroll.run.create` to price a run,
 * `payroll.line.adjust` to change a line, and `payroll.approve` to approve — so the "who can
 * do this" decision lives in
 * `middlewares/permissions.ts`, not in the handler. `tenantId` is read only from the resolved
 * session, so a run can never be priced against another tenant's employees.
 *
 * Each successful write calls `ssePublish` with the `hr` prefix so every other open tab in the
 * tenant invalidates its payroll queries without polling. Creation, approval and adjustment
 * commit their audit records and response reads with the business mutation, before publishing.
 */
export async function payrollRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.get(
    '/payroll/runs',
    {
      // The summary carries tenant-wide gross/net totals — salary data, not just run metadata.
      preHandler: requirePermission('payroll.read'),
      schema: {
        querystring: payrollRunListQuerySchema,
        response: { 200: envelope(payrollRunListResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await payrollService.listPayrollRuns(request.server.prisma, tenantId, request.query)
      return { data: result }
    },
  )

  server.get(
    '/payroll/runs/:id',
    {
      preHandler: requirePermission('payroll.read'),
      schema: {
        params: idParamSchema,
        response: { 200: envelope(payrollRunSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const run = await payrollService.getPayrollRun(request.server.prisma, tenantId, request.params.id)
      return { data: run }
    },
  )

  server.post(
    '/payroll/runs',
    {
      preHandler: requirePermission('payroll.run.create'),
      schema: {
        body: payrollRunCreateSchema,
        response: { 200: envelope(payrollRunSchema), 201: envelope(payrollRunSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const run = await request.server.prisma.$transaction(async tx => {
        const run = await payrollService.createPayrollRun(tx, tenantId, request.body)
        if (!run.creationReplayed) await recordAuditLog(tx, {
          tenantId, actorId: userId, action: 'payroll.run.create',
          targetType: 'PayrollRun', targetId: run.id,
          metadata: { employeeCount: run.lines.length, periodStart: run.periodStart, periodEnd: run.periodEnd, payFrequency: run.payFrequency, periodsPerYear: run.periodsPerYear, salaryBasis: run.salaryBasis, prorationMethod: run.prorationMethod, currency: run.currency },
        })
        return run
      }, { maxWait: 5000 })
      if (!run.creationReplayed) request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      reply.code(run.creationReplayed ? 200 : 201)
      return { data: run }
    },
  )

  server.post(
    '/payroll/runs/:id/approve',
    {
      preHandler: requirePermission('payroll.approve'),
      schema: {
        params: idParamSchema,
        response: { 200: envelope(payrollRunSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const run = await request.server.prisma.$transaction(async tx => {
        const run = await payrollService.approvePayrollRun(tx, tenantId, request.params.id)
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'payroll.approve',
          targetType: 'PayrollRun',
          targetId: request.params.id,
        })
        return run
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      return { data: run }
    },
  )

  server.post('/payroll/runs/:id/pay', {
    preHandler: requirePermission('payroll.pay'),
    schema: {
      params: idParamSchema,
      response: { 200: envelope(payrollRunSchema), ...errorResponses },
    },
  }, async request => {
    const { tenantId, userId } = requireAuthContext(request)
    const run = await request.server.prisma.$transaction(async tx => {
      const run = await payrollService.payPayrollRun(tx, tenantId, request.params.id, userId)
      await recordAuditLog(tx, {
        tenantId, actorId: userId, action: 'payroll.pay', targetType: 'PayrollRun', targetId: run.id,
        metadata: { status: run.status, paidAt: run.paidAt, currency: run.currency, net: run.totals.net },
      })
      return run
    }, { maxWait: 5000 })
    request.server.ssePublish(tenantId, [moduleKeyPrefix('hr'), moduleKeyPrefix('finance')])
    return { data: run }
  })

  server.post('/payroll/runs/:id/void', {
    preHandler: requirePermission('payroll.pay'),
    schema: {
      params: idParamSchema,
      body: financeVoidSchema,
      response: { 200: envelope(payrollRunSchema), ...errorResponses },
    },
  }, async request => {
    const { tenantId, userId } = requireAuthContext(request)
    const run = await request.server.prisma.$transaction(async tx => {
      const run = await payrollService.voidPayrollRun(tx, tenantId, request.params.id, request.body.reason, userId)
      await recordAuditLog(tx, {
        tenantId, actorId: userId, action: 'payroll.void', targetType: 'PayrollRun', targetId: run.id,
        metadata: { status: run.status, voidedAt: run.voidedAt, voidReason: run.voidReason },
      })
      return run
    }, { maxWait: 5000 })
    request.server.ssePublish(tenantId, [moduleKeyPrefix('hr'), moduleKeyPrefix('finance')])
    return { data: run }
  })

  server.patch(
    '/payroll/runs/:id/lines/:lineId',
    {
      preHandler: requirePermission('payroll.line.adjust'),
      schema: {
        params: z.object({ id: idSchema, lineId: idSchema }),
        body: payrollLineAdjustSchema,
        response: { 200: envelope(payrollRunSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const { id, lineId } = request.params
      const run = await request.server.prisma.$transaction(async tx => {
        const run = await payrollService.adjustPayrollLine(tx, tenantId, id, lineId, request.body)
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'payroll.line.adjust',
          targetType: 'PayrollLine',
          targetId: lineId,
          metadata: { payrollRunId: id },
        })
        return run
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      return { data: run }
    },
  )

  /**
   * Download one line's payslip as a PDF. Deterministic by construction: `getPayslipDoc`
   * assembles the document purely from the stored run/line, and `renderPayslipPdf` draws it
   * with no timestamps, random ids, or embedded fonts — so the same line always renders the
   * same bytes, and a re-fetch is byte-identical (the E2E's matching invariant).
   *
   * A payslip is salary data: holders of `payroll.read` (ADMIN+) may read any line, while a
   * MEMBER may read only the line whose `employeeId` is their own linked employee — anything
   * else (including a line that does not exist) is a 403, so a MEMBER cannot probe for other
   * lines. No `schema.response`: the body is binary, so a JSON schema would route it through
   * the serializer.
   */
  server.get(
    '/payroll/runs/:id/payslips/:lineId',
    {
      preHandler: requireRole('MEMBER'),
      schema: { params: z.object({ id: idSchema, lineId: idSchema }), ...({} as object) },
    },
    async (request, reply) => {
      const { tenantId, role, employeeId } = requireAuthContext(request)
      const { id: runId, lineId } = request.params
      if (!hasRequiredRole(role, PERMISSIONS['payroll.read'])) {
        const line = await request.server.prisma.payrollLine.findFirst({
          where: { id: lineId, payrollRunId: runId, tenantId },
          select: { employeeId: true },
        })
        if (!employeeId || !line || line.employeeId !== employeeId) {
          reply.code(403)
          return { error: { message: 'You may only download your own payslip' } }
        }
      }
      const doc = await payrollService.getPayslipDoc(request.server.prisma, tenantId, runId, lineId)
      const buffer = await renderPayslipPdf(doc)
      reply
        .code(200)
        .header('content-type', 'application/pdf')
        .header('content-disposition', `inline; filename="payslip-${lineId}.pdf"`)
        .header('content-length', buffer.length)
      return reply.send(buffer)
    },
  )
}
