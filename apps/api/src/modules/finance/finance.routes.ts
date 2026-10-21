import {
  customerListResponseSchema,
  customerSchema,
  customerUpdateSchema,
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
  selfExpenseWriteSchema,
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
  receivableBatchRemindSchema,
  receivableBatchRemindResponseSchema,
  receivableInvoiceSchema,
  receivableListQuerySchema,
  receivableListResponseSchema,
  receivableStatusUpdateSchema,
  receivableUpdateSchema,
  receivableWriteSchema,
  vendorListResponseSchema,
  vendorSchema,
  vendorUpdateSchema,
  vendorWriteSchema,
  bankStatementImportRequestSchema,
  bankStatementImportSchema,
  bankStatementImportListSchema,
  bankStatementMatchRequestSchema,
  idSchema,
} from '@asas/contracts'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { hasRequiredRole, requireAuthContext, requireRole } from '../../middlewares/rbac.js'
import { PERMISSIONS, requirePermission } from '../../middlewares/permissions.js'
import { recordAuditLog } from '../../services/auditLog.js'
import { notifyWorkspaceRoles } from '../../services/notifications.js'
import { mailer } from '../../services/mailer.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import { renderInvoicePdf } from '../../services/pdf.js'
import { AppError } from '../../utils/errors.js'
import * as financeController from './finance.controller.js'
import * as financeService from './finance.service.js'
import * as reconciliationService from './reconciliation.service.js'

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

  server.get('/bank-statements', {
    preHandler: requireRole('MEMBER'),
    schema: { response: { 200: envelope(bankStatementImportListSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    const batches = await request.server.prisma.bankStatementImport.findMany({
      where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true },
    })
    const items = await Promise.all(batches.map(batch => reconciliationService.getBankStatementImport(request.server.prisma, tenantId, batch.id)))
    return { data: { items } }
  })

  server.post('/bank-statements', {
    preHandler: requirePermission('finance.invoice.write'),
    schema: {
      body: bankStatementImportRequestSchema,
      response: { 201: envelope(bankStatementImportSchema), 200: envelope(bankStatementImportSchema), ...errorResponses },
    },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const imported = await reconciliationService.importBankStatement(request.server.prisma, tenantId, request.body, async (tx, id) => {
      await recordAuditLog(tx, {
        tenantId, actorId: userId, action: 'finance.bank_statement.import', targetType: 'BankStatementImport', targetId: id,
        metadata: { fileName: request.body.fileName, lineCount: request.body.rows.length, matchedCount: 0 },
      })
    })
    const batch = await reconciliationService.getBankStatementImport(request.server.prisma, tenantId, imported.id)
    if (imported.created) {
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      reply.code(201)
    } else {
      reply.code(200)
    }
    return { data: batch }
  })

  server.get('/bank-statements/:id', {
    preHandler: requireRole('MEMBER'),
    schema: { params: idParamSchema, response: { 200: envelope(bankStatementImportSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await reconciliationService.getBankStatementImport(request.server.prisma, tenantId, request.params.id) }
  })

  server.post('/bank-statements/:id/lines/:lineId/match', {
    preHandler: requirePermission('finance.invoice.write'),
    schema: { params: z.object({ id: idSchema, lineId: idSchema }), body: bankStatementMatchRequestSchema, response: { 200: envelope(z.object({ id: idSchema, journalLineId: idSchema, matchedAt: z.string() })), ...errorResponses } },
  }, async request => {
    const { tenantId, userId } = requireAuthContext(request)
    const result = await request.server.prisma.$transaction(async tx => {
      const batch = await tx.bankStatementImport.findFirst({ where: { id: request.params.id, tenantId }, select: { id: true } })
      if (!batch) throw new AppError(404, 'Bank statement import not found')
      const match = await reconciliationService.confirmBankStatementMatch(tx, tenantId, batch.id, request.params.lineId, request.body.journalLineId)
      await recordAuditLog(tx, { tenantId, actorId: userId, action: 'finance.bank_statement.match', targetType: 'BankStatementLine', targetId: match.id, metadata: { journalLineId: match.journalLineId, importId: batch.id } })
      return match
    }, { isolationLevel: 'Serializable' })
    request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
    return { data: result }
  })

  server.delete('/bank-statements/:id/lines/:lineId/match', {
    preHandler: requirePermission('finance.invoice.write'),
    schema: { params: z.object({ id: idSchema, lineId: idSchema }), response: { 204: noContentSchema, ...errorResponses } },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    await request.server.prisma.$transaction(async tx => {
      const batch = await tx.bankStatementImport.findFirst({ where: { id: request.params.id, tenantId }, select: { id: true } })
      if (!batch) throw new AppError(404, 'Bank statement import not found')
      await reconciliationService.undoBankStatementMatch(tx, tenantId, batch.id, request.params.lineId)
      await recordAuditLog(tx, { tenantId, actorId: userId, action: 'finance.bank_statement.unmatch', targetType: 'BankStatementLine', targetId: request.params.lineId, metadata: { importId: batch.id } })
    })
    request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
    return reply.code(204).send()
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

  server.patch(
    '/vendors/:id',
    {
      preHandler: requirePermission('finance.partner.write'),
      schema: {
        params: idParamSchema,
        body: vendorUpdateSchema,
        response: { 200: envelope(vendorSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      const vendor = await request.server.prisma.$transaction(async tx => {
        const vendor = await financeController.updateVendor(tx, tenantId, request.params.id, request.body)
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.vendor.update',
          targetType: 'Vendor',
          targetId: vendor.id,
        })
        return vendor
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      return { data: vendor }
    },
  )

  server.delete(
    '/vendors/:id',
    {
      preHandler: requirePermission('finance.partner.delete'),
      schema: {
        params: idParamSchema,
        response: { 204: noContentSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      await request.server.prisma.$transaction(async tx => {
        await financeController.deleteVendor(tx, tenantId, request.params.id)
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.partner.delete',
          targetType: 'Vendor',
          targetId: request.params.id,
        })
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      reply.code(204)
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
        await notifyWorkspaceRoles(tx, {
          tenantId,
          roles: ['OWNER', 'ADMIN'],
          excludeUserId: userId,
          title: 'New payable invoice',
          message: `A payable invoice${invoice.invoiceNumber ? ` ${invoice.invoiceNumber}` : ''} was created and is ready for review.`,
          type: 'INFO',
          link: '/dashboard/finance/accounts-payable',
          module: 'finance',
          eventType: 'invoice.created',
        })
        return invoice
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance'), moduleKeyPrefix('notifications')])
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
      const { tenantId, userId, role } = requireAuthContext(request)
      if (request.body.status === 'APPROVED' && !hasRequiredRole(role, PERMISSIONS['finance.invoice.approve'])) {
        throw new AppError(403, 'Approving payable invoices requires the ADMIN role')
      }
      if (request.body.status === 'PAID' && !hasRequiredRole(role, PERMISSIONS['finance.invoice.pay'])) {
        throw new AppError(403, 'Paying payable invoices requires the ADMIN role')
      }
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
    preHandler: requirePermission('finance.invoice.pay'),
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
    preHandler: requirePermission('finance.invoice.void'),
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

  server.patch(
    '/customers/:id',
    {
      preHandler: requirePermission('finance.partner.write'),
      schema: {
        params: idParamSchema,
        body: customerUpdateSchema,
        response: { 200: envelope(customerSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      const customer = await request.server.prisma.$transaction(async tx => {
        const customer = await financeController.updateCustomer(tx, tenantId, request.params.id, request.body)
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.customer.update',
          targetType: 'Customer',
          targetId: customer.id,
        })
        return customer
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      return { data: customer }
    },
  )

  server.delete(
    '/customers/:id',
    {
      preHandler: requirePermission('finance.partner.delete'),
      schema: {
        params: idParamSchema,
        response: { 204: noContentSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      await request.server.prisma.$transaction(async tx => {
        await financeController.deleteCustomer(tx, tenantId, request.params.id)
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.partner.delete',
          targetType: 'Customer',
          targetId: request.params.id,
        })
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      reply.code(204)
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

  server.post(
    '/receivables/batch-remind',
    {
      preHandler: requirePermission('finance.invoice.write'),
      schema: {
        body: receivableBatchRemindSchema,
        response: { 200: envelope(receivableBatchRemindResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      const user = await request.server.prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
      const result = await request.server.prisma.$transaction(async tx => {
        const res = await financeService.sendBatchRemindersInTransaction(
          tx,
          tenantId,
          user?.name ?? 'Finance Team',
          request.body.customerIds,
        )
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.receivable.batch_remind',
          targetType: 'Customer',
          metadata: {
            customerIds: res.customerIds,
            count: res.remindedCount,
          },
        })
        return res
      })
      for (const reminder of result.notifications) {
        const invoiceLines = reminder.invoices.map(invoice =>
          `- ${invoice.number || 'Invoice'}: ${invoice.amount} ${invoice.currency}${invoice.dueDate ? ` (due ${invoice.dueDate.slice(0, 10)})` : ''}`,
        ).join('\n')
        try {
          await mailer.enqueue({
            to: reminder.to,
            subject: 'Payment reminder',
            text: `Hello ${reminder.customerName},\n\nOur records show these outstanding invoices:\n${invoiceLines}\n\nPlease contact us if you have already made payment.`,
          })
        } catch (error) {
          request.log.error({ err: error, customerId: reminder.customerId }, 'Could not queue receivables reminder email')
        }
      }
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      return { data: { remindedCount: result.remindedCount, customerIds: result.customerIds } }
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
        await notifyWorkspaceRoles(tx, {
          tenantId,
          roles: ['OWNER', 'ADMIN'],
          excludeUserId: userId,
          title: 'New receivable invoice',
          message: `A customer invoice${invoice.number ? ` ${invoice.number}` : ''} was created.`,
          type: 'INFO',
          link: '/dashboard/finance/accounts-receivable',
          module: 'finance',
          eventType: 'invoice.created',
        })
        return invoice
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance'), moduleKeyPrefix('notifications')])
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
    preHandler: requirePermission('finance.invoice.void'),
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
      const { tenantId, role, employeeId } = requireAuthContext(request)
      const query = { ...request.query }
      if (!hasRequiredRole(role, PERMISSIONS['finance.read'])) {
        query.employeeId = employeeId ?? 'none'
      }
      const result = await financeController.listExpenses(request.server.prisma, tenantId, query)
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
    async (request, reply) => {
      const { tenantId, role, employeeId } = requireAuthContext(request)
      const expense = await financeController.getExpense(request.server.prisma, tenantId, request.params.id)
      if (!hasRequiredRole(role, PERMISSIONS['finance.read'])) {
        if (!employeeId || expense.employeeId !== employeeId) {
          reply.code(403)
          return { error: { message: 'You may only view your own expenses' } }
        }
      }
      return { data: expense }
    },
  )

  server.post(
    '/expenses/self',
    {
      preHandler: requirePermission('finance.expense.self'),
      schema: {
        body: selfExpenseWriteSchema,
        response: { 201: envelope(expenseSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId, employeeId } = requireAuthContext(request)
      if (!employeeId) {
        throw new AppError(409, 'Link this account to an employee record before submitting expenses')
      }
      const expense = await request.server.prisma.$transaction(async tx => {
        const expense = await financeController.createExpense(tx, tenantId, { ...request.body, employeeId }, userId)
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'finance.expense.create',
          targetType: 'Expense',
          targetId: expense.id,
          metadata: { selfService: true, amount: expense.amount },
        })
        return expense
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('finance')])
      reply.code(201)
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
      const { tenantId, userId, role } = requireAuthContext(request)
      if (request.body.status === 'APPROVED' && !hasRequiredRole(role, PERMISSIONS['finance.expense.approve'])) {
        throw new AppError(403, 'Approving expenses requires the ADMIN role')
      }
      if (request.body.status === 'REIMBURSED' && !hasRequiredRole(role, PERMISSIONS['finance.expense.reimburse'])) {
        throw new AppError(403, 'Reimbursing expenses requires the ADMIN role')
      }
      if (request.body.status === 'REJECTED' && !hasRequiredRole(role, PERMISSIONS['finance.expense.approve'])) {
        throw new AppError(403, 'Rejecting expenses requires the ADMIN role')
      }
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
      preHandler: requirePermission('finance.expense.void'),
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
      preHandler: requirePermission('finance.expense.void'),
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
