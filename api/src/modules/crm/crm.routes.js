import { authenticate } from '../../middlewares/authenticate.js'
import { tenantResolver } from '../../middlewares/tenantResolver.js'
import { success } from '../../utils/response.js'
import * as crmService from './crm.service.js'

export async function crmRoutes(app) {
  app.addHook('preHandler', authenticate)

  app.get('/overview', async (request, reply) => {
    const tenantId = tenantResolver(request)
    return success(reply, await crmService.getOverview(app.prisma, tenantId))
  })

  app.get('/deals', async (request, reply) => {
    const tenantId = tenantResolver(request)
    return success(reply, await crmService.listDeals(app.prisma, tenantId))
  })

  app.get('/forecast', async (request, reply) => {
    const tenantId = tenantResolver(request)
    return success(reply, await crmService.getForecast(app.prisma, tenantId))
  })

  app.get('/sales-performance', async (request, reply) => {
    const tenantId = tenantResolver(request)
    return success(reply, await crmService.getSalesPerformance(app.prisma, tenantId))
  })
}
