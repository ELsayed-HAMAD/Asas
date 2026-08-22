import { authenticate } from '../../middlewares/authenticate.js'
import { tenantResolver } from '../../middlewares/tenantResolver.js'
import { success } from '../../utils/response.js'
import * as financeService from './finance.service.js'
import {
  vendorWriteSchema,
  payableInvoiceWriteSchema,
  customerWriteSchema,
  receivableInvoiceWriteSchema,
  expenseWriteSchema
} from './finance.schema.js'

export async function financeRoutes(app) {
  app.addHook('preHandler', authenticate)

  app.get('/overview', async (request, reply) => {
    const tenantId = tenantResolver(request)
    return success(reply, await financeService.getOverview(app.prisma, tenantId))
  })

  app.get('/payables', async (request, reply) => {
    const tenantId = tenantResolver(request)
    return success(reply, await financeService.listPayables(app.prisma, tenantId))
  })

  app.get('/receivables', async (request, reply) => {
    const tenantId = tenantResolver(request)
    return success(reply, await financeService.listReceivables(app.prisma, tenantId))
  })

  app.get('/expenses', async (request, reply) => {
    const tenantId = tenantResolver(request)
    return success(reply, await financeService.listExpenses(app.prisma, tenantId))
  })
}
