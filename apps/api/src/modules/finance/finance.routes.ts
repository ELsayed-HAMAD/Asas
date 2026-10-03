import {
  customerListResponseSchema,
  customerSchema,
  customerWriteSchema,
  envelope,
  errorResponses,
  expenseListQuerySchema,
  expenseListResponseSchema,
  expenseSchema,
  expenseStatusUpdateSchema,
  expenseUpdateSchema,
  expenseWriteSchema,
  financeOverviewResponseSchema,
  idParamSchema,
  noContentSchema,
  payableInvoiceSchema,
  payableListQuerySchema,
  payableListResponseSchema,
  payableStatusUpdateSchema,
  payableUpdateSchema,
  payableWriteSchema,
  receivableInvoiceSchema,
  receivableListQuerySchema,
  receivableListResponseSchema,
  receivableStatusUpdateSchema,
  receivableUpdateSchema,
  receivableWriteSchema,
  vendorListResponseSchema,
  vendorSchema,
  vendorWriteSchema,
} from '@asas/contracts'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { requireAuthContext, requireRole } from '../../middlewares/rbac.js'
import { requirePermission } from '../../middlewares/permissions.js'
import { recordAuditLog } from '../../services/auditLog.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import { renderInvoicePdf } from '../../services/pdf.js'
import * as financeController from './finance.controller.js'
import * as financeService from './finance.service.js'

/**
 * Finance — accounts payable, accounts receivable, and expenses.
 *
 * The RBAC split mirrors HR/Projects: reads go through `requireRole('MEMBER')`; every write goes
 * through a named `requirePermission` (ADMIN by the map in `middlewares/permissions.ts`).
 * `tenantId` is read only from the resolved session. Each successful write mutation calls the
 * SSE `ssePublish` helper so other open tabs invalidate their finance queries (Phase 7).
 *
 * The list endpoints return `{ items, pagination, summary }` where the `summary` KPIs are SQL
 * aggregates over the whole tenant set, computed in the service — never client-side.
 */
export async function financeRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>()

  // ── Overview (the KPI row) ──────────────────────────────────────────────────

  server.get(
    '/overview',
    {
      preHandler: requireRole('MEMBER'),
      schema: { response: { 200: envelope(financeOverviewResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await financeController.getOverview(request.server.prisma, tenantId)
      return { data: result }
    },
  )

  // ── Vendors ─────────────────────────────────────────────────────────────────

  server.get(
    '/vendors',
    {
      preHandler: requireRole('MEMBER'),
      schema: { response: { 200: envelope(vendorListResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const items = await financeController.listVendors(request.server.prisma, tenantId)
      return { data: { items } }
    },
  )

  server.get(
    '/vendors/:id',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        params: idParamSchema,
        response: { 200: envelope(vendorSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const vendor = await financeController.getVendor(request.server.prisma, tenantId, request.params.id)
      return { data: vendor }
    },
  )

  server.post(
    '/vendors',
    {
      preHandler: requirePermission('finance.partner.write'),
      schema: {
        body: vendorWriteSchema,
        response: { 201: envelope(vendorSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const vendor = await financeController.createVendor(request.server.prisma, tenantId, request.body)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'finance.vendor.create',
        targetType: 'Vendor',
        targetId: vendor.id,
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      reply.code(201)
      return { data: vendor }
    },
  )

  // ── Payables (accounts payable) ─────────────────────────────────────────────

  server.get(
    '/payables',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        querystring: payableListQuerySchema,
        response: { 200: envelope(payableListResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await financeController.listPayables(request.server.prisma, tenantId, request.query)
      return { data: result }
    },
  )

  server.get(
    '/payables/:id',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        params: idParamSchema,
        response: { 200: envelope(payableInvoiceSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const invoice = await financeController.getPayable(request.server.prisma, tenantId, request.params.id)
      return { data: invoice }
    },
  )

  server.post(
    '/payables',
    {
      preHandler: requirePermission('finance.invoice.write'),
      schema: {
        body: payableWriteSchema,
        response: { 201: envelope(payableInvoiceSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const invoice = await financeController.createPayable(request.server.prisma, tenantId, request.body)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'finance.payable.create',
        targetType: 'PayableInvoice',
        targetId: invoice.id,
        metadata: { amount: invoice.amount },
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      reply.code(201)
      return { data: invoice }
    },
  )

  server.patch(
    '/payables/:id',
    {
      preHandler: requirePermission('finance.invoice.write'),
      schema: {
        params: idParamSchema,
        body: payableUpdateSchema,
        response: { 200: envelope(payableInvoiceSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const invoice = await financeController.updatePayable(
        request.server.prisma,
        tenantId,
        request.params.id,
        request.body,
      )
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'finance.payable.update',
        targetType: 'PayableInvoice',
        targetId: invoice.id,
        metadata: { fields: Object.keys(request.body) },
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      return { data: invoice }
    },
  )

  server.post(
    '/payables/:id/status',
    {
      preHandler: requirePermission('finance.invoice.write'),
      schema: {
        params: idParamSchema,
        body: payableStatusUpdateSchema,
        response: { 200: envelope(payableInvoiceSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const invoice = await financeController.updatePayableStatus(
        request.server.prisma,
        tenantId,
        request.params.id,
        request.body.status,
      )
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'finance.payable.status',
        targetType: 'PayableInvoice',
        targetId: invoice.id,
        metadata: { status: invoice.status },
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      return { data: invoice }
    },
  )

  server.delete(
    '/payables/:id',
    {
      preHandler: requirePermission('finance.invoice.write'),
      schema: {
        params: idParamSchema,
        response: { 204: noContentSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      await financeController.deletePayable(request.server.prisma, tenantId, request.params.id)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'finance.payable.delete',
        targetType: 'PayableInvoice',
        targetId: request.params.id,
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      reply.code(204)
    },
  )

  // ── Customers ───────────────────────────────────────────────────────────────

  server.get(
    '/customers',
    {
      preHandler: requireRole('MEMBER'),
      schema: { response: { 200: envelope(customerListResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const items = await financeController.listCustomers(request.server.prisma, tenantId)
      return { data: { items } }
    },
  )

  server.post(
    '/customers',
    {
      preHandler: requirePermission('finance.partner.write'),
      schema: {
        body: customerWriteSchema,
        response: { 201: envelope(customerSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const customer = await financeController.createCustomer(request.server.prisma, tenantId, request.body)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'finance.customer.create',
        targetType: 'Customer',
        targetId: customer.id,
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      reply.code(201)
      return { data: customer }
    },
  )

  // ── Receivables (accounts receivable) ───────────────────────────────────────

  server.get(
    '/receivables',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        querystring: receivableListQuerySchema,
        response: { 200: envelope(receivableListResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await financeController.listReceivables(request.server.prisma, tenantId, request.query)
      return { data: result }
    },
  )

  server.get(
    '/receivables/:id',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        params: idParamSchema,
        response: { 200: envelope(receivableInvoiceSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const invoice = await financeController.getReceivable(request.server.prisma, tenantId, request.params.id)
      return { data: invoice }
    },
  )

  server.post(
    '/receivables',
    {
      preHandler: requirePermission('finance.invoice.write'),
      schema: {
        body: receivableWriteSchema,
        response: { 201: envelope(receivableInvoiceSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const invoice = await financeController.createReceivable(request.server.prisma, tenantId, request.body)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'finance.receivable.create',
        targetType: 'ReceivableInvoice',
        targetId: invoice.id,
        metadata: { amount: invoice.amount },
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      reply.code(201)
      return { data: invoice }
    },
  )

  server.patch(
    '/receivables/:id',
    {
      preHandler: requirePermission('finance.invoice.write'),
      schema: {
        params: idParamSchema,
        body: receivableUpdateSchema,
        response: { 200: envelope(receivableInvoiceSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const invoice = await financeController.updateReceivable(
        request.server.prisma,
        tenantId,
        request.params.id,
        request.body,
      )
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'finance.receivable.update',
        targetType: 'ReceivableInvoice',
        targetId: invoice.id,
        metadata: { fields: Object.keys(request.body) },
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      return { data: invoice }
    },
  )

  server.post(
    '/receivables/:id/status',
    {
      preHandler: requirePermission('finance.invoice.write'),
      schema: {
        params: idParamSchema,
        body: receivableStatusUpdateSchema,
        response: { 200: envelope(receivableInvoiceSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const invoice = await financeController.updateReceivableStatus(
        request.server.prisma,
        tenantId,
        request.params.id,
        request.body.status,
      )
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'finance.receivable.status',
        targetType: 'ReceivableInvoice',
        targetId: invoice.id,
        metadata: { status: invoice.status },
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      return { data: invoice }
    },
  )

  server.delete(
    '/receivables/:id',
    {
      preHandler: requirePermission('finance.invoice.write'),
      schema: {
        params: idParamSchema,
        response: { 204: noContentSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      await financeController.deleteReceivable(request.server.prisma, tenantId, request.params.id)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'finance.receivable.delete',
        targetType: 'ReceivableInvoice',
        targetId: request.params.id,
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      reply.code(204)
    },
  )

  // ── Expenses ────────────────────────────────────────────────────────────────

  server.get(
    '/expenses',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        querystring: expenseListQuerySchema,
        response: { 200: envelope(expenseListResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await financeController.listExpenses(request.server.prisma, tenantId, request.query)
      return { data: result }
    },
  )

  server.get(
    '/expenses/:id',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        params: idParamSchema,
        response: { 200: envelope(expenseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const expense = await financeController.getExpense(request.server.prisma, tenantId, request.params.id)
      return { data: expense }
    },
  )

  server.post(
    '/expenses',
    {
      preHandler: requirePermission('finance.expense.write'),
      schema: {
        body: expenseWriteSchema,
        response: { 201: envelope(expenseSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const expense = await financeController.createExpense(request.server.prisma, tenantId, request.body)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'finance.expense.create',
        targetType: 'Expense',
        targetId: expense.id,
        metadata: { amount: expense.amount },
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      reply.code(201)
      return { data: expense }
    },
  )

  server.patch(
    '/expenses/:id',
    {
      preHandler: requirePermission('finance.expense.write'),
      schema: {
        params: idParamSchema,
        body: expenseUpdateSchema,
        response: { 200: envelope(expenseSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const expense = await financeController.updateExpense(
        request.server.prisma,
        tenantId,
        request.params.id,
        request.body,
      )
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'finance.expense.update',
        targetType: 'Expense',
        targetId: expense.id,
        metadata: { fields: Object.keys(request.body) },
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      return { data: expense }
    },
  )

  server.post(
    '/expenses/:id/status',
    {
      preHandler: requirePermission('finance.expense.write'),
      schema: {
        params: idParamSchema,
        body: expenseStatusUpdateSchema,
        response: { 200: envelope(expenseSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const expense = await financeController.updateExpenseStatus(
        request.server.prisma,
        tenantId,
        request.params.id,
        request.body.status,
      )
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'finance.expense.status',
        targetType: 'Expense',
        targetId: expense.id,
        metadata: { status: expense.status },
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      return { data: expense }
    },
  )

  server.delete(
    '/expenses/:id',
    {
      preHandler: requirePermission('finance.expense.write'),
      schema: {
        params: idParamSchema,
        response: { 204: noContentSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      await financeController.deleteExpense(request.server.prisma, tenantId, request.params.id)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'finance.expense.delete',
        targetType: 'Expense',
        targetId: request.params.id,
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      reply.code(204)
    },
  )

  /**
   * Download a payables invoice as a PDF. Deterministic like the payslip: `getInvoiceDoc`
   * builds the document purely from the stored invoice (its own `amount` is the total, not a
   * re-sum of the line items), and `renderInvoicePdf` draws it with no timestamps or embedded
   * fonts — the same data always renders the same bytes. Any tenant member may read it (a
   * view of a payable they can already see). No `schema.response`: the body is binary.
   */
  server.get(
    '/payables/:id/pdf',
    {
      preHandler: requireRole('MEMBER'),
      schema: { params: idParamSchema, ...({} as object) },
    },
    async (request, reply) => {
      const { tenantId } = requireAuthContext(request)
      const doc = await financeService.getInvoiceDoc(request.server.prisma, tenantId, request.params.id)
      const buffer = await renderInvoicePdf(doc)
      reply
        .code(200)
        .header('content-type', 'application/pdf')
        .header('content-disposition', `inline; filename="invoice-${request.params.id}.pdf"`)
        .header('content-length', buffer.length)
      return reply.send(buffer)
    },
  )
}
