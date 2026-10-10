import {
  customerListResponseSchema,
  customerSchema,
  customerWriteSchema,
  collectionActivityListResponseSchema,
  collectionActivitySchema,
  collectionActivityWriteSchema,
  envelope,
  errorResponses,
  expenseListQuerySchema,
  expenseListResponseSchema,
  expenseSchema,
  expenseStatusUpdateSchema,
  expenseUpdateSchema,
  expenseWriteSchema,
  financeOverviewResponseSchema,
  financeOverviewQuerySchema,
  journalEntrySchema,
  journalListQuerySchema,
  journalListResponseSchema,
  openingBalanceWriteSchema,
  trialBalanceQuerySchema,
  trialBalanceResponseSchema,
  financeVoidSchema,
  idParamSchema,
  noContentSchema,
  payableInvoiceSchema,
  payableDetailSchema,
  payableListQuerySchema,
  payableListResponseSchema,
  payableStatusUpdateSchema,
  payableUpdateSchema,
  payableWriteSchema,
  payableBatchPaymentSchema,
  payableChangeRequestSchema,
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
import { z } from 'zod'
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
      schema: { querystring: financeOverviewQuerySchema, response: { 200: envelope(financeOverviewResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await financeController.getOverview(request.server.prisma, tenantId, request.query)
      return { data: result }
    },
  )

  server.get('/journals', {
    preHandler: requireRole('MEMBER'),
    schema: {
      querystring: journalListQuerySchema,
      response: { 200: envelope(journalListResponseSchema), ...errorResponses },
    },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    const result = await financeController.listJournals(request.server.prisma, tenantId, request.query)
    return { data: { ...result, summary: null } }
  })

  server.get('/trial-balance', {
    preHandler: requireRole('MEMBER'),
    schema: {
      querystring: trialBalanceQuerySchema,
      response: { 200: envelope(trialBalanceResponseSchema), ...errorResponses },
    },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await financeController.getTrialBalance(request.server.prisma, tenantId, request.query.asOf) }
  })

  server.post('/opening-balances', {
    preHandler: requirePermission('finance.invoice.write'),
    schema: {
      body: openingBalanceWriteSchema,
      response: { 201: envelope(journalEntrySchema), ...errorResponses },
    },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const entry = await request.server.prisma.$transaction(async tx => {
      const journal = await financeController.postOpeningBalance(tx, tenantId, userId, request.body)
      await recordAuditLog(tx, {
        tenantId, actorId: userId, action: 'finance.opening_balance.post',
        targetType: 'JournalEntry', targetId: journal.id,
        metadata: { asOf: request.body.asOf, lineCount: request.body.lines.length, currency: journal.amount.currency },
      })
      return journal
    }, { isolationLevel: 'Serializable' })
    request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
    reply.code(201)
    return { data: entry }
  })

  server.get('/journals/:id', {
    preHandler: requireRole('MEMBER'),
    schema: {
      params: idParamSchema,
      response: { 200: envelope(journalEntrySchema), ...errorResponses },
    },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    const entry = await financeController.getJournal(request.server.prisma, tenantId, request.params.id)
    return { data: entry }
  })

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
      const vendor = await request.server.prisma.$transaction(async tx => {
        const vendor = await financeController.createVendor(tx, tenantId, request.body)
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.vendor.create',
          targetType: 'Vendor',
          targetId: vendor.id,
        })
        return vendor
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
        response: { 200: envelope(payableDetailSchema), ...errorResponses },
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
      const invoice = await request.server.prisma.$transaction(async tx => {
        const invoice = await financeController.createPayable(tx, tenantId, request.body, userId)
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.payable.create',
          targetType: 'PayableInvoice',
          targetId: invoice.id,
          metadata: { amount: invoice.amount },
        })
        return invoice
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
      const invoice = await request.server.prisma.$transaction(async tx => {
        const invoice = await financeController.updatePayable(
          tx,
          tenantId,
          request.params.id,
          request.body,
        )
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.payable.update',
          targetType: 'PayableInvoice',
          targetId: invoice.id,
          metadata: { fields: Object.keys(request.body) },
        })
        return invoice
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
      const invoice = await request.server.prisma.$transaction(async tx => {
        const invoice = await financeController.updatePayableStatus(
          tx,
          tenantId,
          request.params.id,
          request.body.status,
          userId,
        )
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.payable.status',
          targetType: 'PayableInvoice',
          targetId: invoice.id,
          metadata: { status: invoice.status },
        })
        return invoice
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      return { data: invoice }
    },
  )

  server.post('/payables/:id/request-changes', {
    preHandler: requirePermission('finance.invoice.write'),
    schema: {
      params: idParamSchema,
      body: payableChangeRequestSchema,
      response: { 200: envelope(payableInvoiceSchema), ...errorResponses },
    },
  }, async request => {
    const { tenantId, userId } = requireAuthContext(request)
    const invoice = await request.server.prisma.$transaction(async tx => {
      const invoice = await financeController.requestPayableChanges(tx, tenantId, request.params.id, userId)
      await recordAuditLog(tx, {
        tenantId,
        actorId: userId,
        action: 'finance.payable.request_changes',
        targetType: 'PayableInvoice',
        targetId: invoice.id,
        metadata: { status: invoice.status, reason: request.body.reason },
      })
      return invoice
    })
    request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
    return { data: invoice }
  })

  server.post('/payables/batch-payment', {
    preHandler: requirePermission('finance.invoice.write'),
    schema: {
      body: payableBatchPaymentSchema,
      response: { 200: envelope(z.array(payableInvoiceSchema)), ...errorResponses },
    },
  }, async request => {
    const { tenantId, userId } = requireAuthContext(request)
    const invoices = await request.server.prisma.$transaction(async tx => {
      const invoices = await financeController.payApprovedPayables(tx, tenantId, request.body, userId)
      for (const invoice of invoices) {
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.payable.batch_paid',
          targetType: 'PayableInvoice',
          targetId: invoice.id,
          metadata: { status: invoice.status },
        })
      }
      return invoices
    }, { isolationLevel: 'Serializable' })
    request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
    return { data: invoices }
  })

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
      await request.server.prisma.$transaction(async tx => {
        await financeController.deletePayable(tx, tenantId, request.params.id, userId)
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.payable.delete',
          targetType: 'PayableInvoice',
          targetId: request.params.id,
        })
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      reply.code(204)
    },
  )

  server.post('/payables/:id/void', {
    preHandler: requirePermission('finance.invoice.write'),
    schema: {
      params: idParamSchema,
      body: financeVoidSchema,
      response: { 200: envelope(payableInvoiceSchema), ...errorResponses },
    },
  }, async request => {
    const { tenantId, userId } = requireAuthContext(request)
    const invoice = await request.server.prisma.$transaction(async tx => {
      const invoice = await financeService.voidPayable(tx, tenantId, request.params.id, request.body.reason, userId)
      await recordAuditLog(tx, {
        tenantId, actorId: userId, action: 'finance.payable.void',
        targetType: 'PayableInvoice', targetId: invoice.id,
        metadata: { status: invoice.status, reason: request.body.reason },
      })
      return invoice
    })
    request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
    return { data: invoice }
  })

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
      const customer = await request.server.prisma.$transaction(async tx => {
        const customer = await financeController.createCustomer(tx, tenantId, request.body)
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.customer.create',
          targetType: 'Customer',
          targetId: customer.id,
        })
        return customer
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      reply.code(201)
      return { data: customer }
    },
  )

  server.get(
    '/customers/:id/activities',
    {
      preHandler: requireRole('MEMBER'),
      schema: { params: idParamSchema, response: { 200: envelope(collectionActivityListResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const items = await financeController.listCollectionActivities(request.server.prisma, tenantId, request.params.id)
      return { data: { items } }
    },
  )

  server.post(
    '/customers/:id/activities',
    {
      preHandler: requirePermission('finance.invoice.write'),
      schema: { params: idParamSchema, body: collectionActivityWriteSchema, response: { 201: envelope(collectionActivitySchema), ...errorResponses } },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const user = await request.server.prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
      const activity = await request.server.prisma.$transaction(async tx => {
        const activity = await financeController.createCollectionActivity(tx, tenantId, request.params.id, user?.name ?? 'Workspace member', request.body)
        await recordAuditLog(tx, { tenantId, actorId: userId, action: 'finance.collection_activity.create', targetType: 'Customer', targetId: request.params.id })
        return activity
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      reply.code(201)
      return { data: activity }
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
      const invoice = await request.server.prisma.$transaction(async tx => {
        const invoice = await financeController.createReceivable(tx, tenantId, request.body, userId)
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.receivable.create',
          targetType: 'ReceivableInvoice',
          targetId: invoice.id,
          metadata: { amount: invoice.amount },
        })
        return invoice
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
      const invoice = await request.server.prisma.$transaction(async tx => {
        const invoice = await financeController.updateReceivable(
          tx,
          tenantId,
          request.params.id,
          request.body,
          userId,
        )
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.receivable.update',
          targetType: 'ReceivableInvoice',
          targetId: invoice.id,
          metadata: { fields: Object.keys(request.body) },
        })
        return invoice
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
      const invoice = await request.server.prisma.$transaction(async tx => {
        const invoice = await financeController.updateReceivableStatus(
          tx,
          tenantId,
          request.params.id,
          request.body.status,
          userId,
        )
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.receivable.status',
          targetType: 'ReceivableInvoice',
          targetId: invoice.id,
          metadata: { status: invoice.status },
        })
        return invoice
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
      await request.server.prisma.$transaction(async tx => {
        await financeController.deleteReceivable(tx, tenantId, request.params.id, userId)
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.receivable.delete',
          targetType: 'ReceivableInvoice',
          targetId: request.params.id,
        })
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      reply.code(204)
    },
  )

  server.post('/receivables/:id/void', {
    preHandler: requirePermission('finance.invoice.write'),
    schema: {
      params: idParamSchema,
      body: financeVoidSchema,
      response: { 200: envelope(receivableInvoiceSchema), ...errorResponses },
    },
  }, async request => {
    const { tenantId, userId } = requireAuthContext(request)
    const invoice = await request.server.prisma.$transaction(async tx => {
      const invoice = await financeService.voidReceivable(tx, tenantId, request.params.id, request.body.reason, userId)
      await recordAuditLog(tx, {
        tenantId, actorId: userId, action: 'finance.receivable.void',
        targetType: 'ReceivableInvoice', targetId: invoice.id,
        metadata: { status: invoice.status, reason: request.body.reason },
      })
      return invoice
    })
    request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
    return { data: invoice }
  })

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
      const expense = await request.server.prisma.$transaction(async tx => {
        const expense = await financeController.createExpense(tx, tenantId, request.body, userId)
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.expense.create',
          targetType: 'Expense',
          targetId: expense.id,
          metadata: { amount: expense.amount },
        })
        return expense
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
      const expense = await request.server.prisma.$transaction(async tx => {
        const expense = await financeController.updateExpense(
          tx,
          tenantId,
          request.params.id,
          request.body,
        )
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.expense.update',
          targetType: 'Expense',
          targetId: expense.id,
          metadata: { fields: Object.keys(request.body) },
        })
        return expense
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
      const expense = await request.server.prisma.$transaction(async tx => {
        const expense = await financeController.updateExpenseStatus(
          tx,
          tenantId,
          request.params.id,
          request.body.status,
          userId,
        )
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.expense.status',
          targetType: 'Expense',
          targetId: expense.id,
          metadata: { status: expense.status },
        })
        return expense
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      return { data: expense }
    },
  )

  server.post(
    '/expenses/:id/void',
    {
      preHandler: requirePermission('finance.expense.write'),
      schema: {
        params: idParamSchema,
        body: financeVoidSchema,
        response: { 200: envelope(expenseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      const expense = await request.server.prisma.$transaction(async tx => {
        const expense = await financeController.voidExpense(tx, tenantId, request.params.id, request.body.reason, userId)
        await recordAuditLog(tx, {
          tenantId, actorId: userId, action: 'finance.expense.void', targetType: 'Expense', targetId: expense.id,
          metadata: { status: expense.status, voidedAt: expense.voidedAt, reason: expense.voidReason },
        })
        return expense
      }, { maxWait: 5000 })
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
      await request.server.prisma.$transaction(async tx => {
        await financeController.deleteExpense(tx, tenantId, request.params.id)
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.expense.delete',
          targetType: 'Expense',
          targetId: request.params.id,
        })
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
