import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import {
  envelope,
  errorResponses,
  idSchema,
  idParamSchema,
  payrollLineAdjustSchema,
  payrollRunCreateSchema,
  payrollRunListQuerySchema,
  payrollRunListResponseSchema,
  payrollRunSchema,
} from '@asas/contracts'
import { requireAuthContext, requireRole } from '../../middlewares/rbac.js'
import { requirePermission } from '../../middlewares/permissions.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import { recordAuditLog } from '../../services/auditLog.js'
import { renderPayslipPdf } from '../../services/pdf.js'
import * as payrollService from './payroll.service.js'

/**
 * HR payroll — runs, line adjustments, approval, and payslips (the plan's Phase 2 surface).
 *
 * Reads are open to any tenant member (`requireRole('MEMBER')`); every write gates on a named
 * permission — `employee.write` to price a run, `payroll.line.adjust` to change a line, and
 * `payroll.approve` to approve — so the "who can do this" decision lives in
 * `middlewares/permissions.ts`, not in the handler. `tenantId` is read only from the resolved
 * session, so a run can never be priced against another tenant's employees.
 *
 * Each successful write calls `ssePublish` with the `hr` prefix so every other open tab in the
 * tenant invalidates its payroll queries without polling. Approvals and line adjustments are
 * the plan's "attribution enough for the audit log" actions, so the handler records the actor
 * there — the service deliberately does not take a user id.
 */
export async function payrollRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.get(
    '/payroll/runs',
    {
      preHandler: requireRole('MEMBER'),
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
      preHandler: requireRole('MEMBER'),
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
      preHandler: requirePermission('employee.write'),
      schema: {
        body: payrollRunCreateSchema,
        response: { 201: envelope(payrollRunSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId } = requireAuthContext(request)
      const run = await payrollService.createPayrollRun(request.server.prisma, tenantId, request.body)
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      reply.code(201)
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
      const run = await payrollService.approvePayrollRun(request.server.prisma, tenantId, request.params.id)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'payroll.approve',
        targetType: 'PayrollRun',
        targetId: request.params.id,
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      return { data: run }
    },
  )

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
      const run = await payrollService.adjustPayrollLine(request.server.prisma, tenantId, id, lineId, request.body)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'payroll.line.adjust',
        targetType: 'PayrollLine',
        targetId: lineId,
        metadata: { payrollRunId: id },
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
   * Any tenant member may read a payslip (it is a view of the run they can already see);
   * salary visibility is the run's concern, not the PDF's — the payslip is the record of what
   * was paid, and reads are open to the tenant just like the run detail. No `schema.response`:
   * the body is binary, so a JSON schema would route it through the serializer.
   */
  server.get(
    '/payroll/runs/:id/payslips/:lineId',
    {
      preHandler: requireRole('MEMBER'),
      schema: { params: z.object({ id: idSchema, lineId: idSchema }), ...({} as object) },
    },
    async (request, reply) => {
      const { tenantId } = requireAuthContext(request)
      const { id: runId, lineId } = request.params
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
