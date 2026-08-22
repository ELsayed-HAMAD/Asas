import { authenticate } from '../../middlewares/authenticate.js'
import { tenantResolver } from '../../middlewares/tenantResolver.js'
import { success } from '../../utils/response.js'
import { importEmployeesSchema } from './onboarding.schema.js'
import * as onboardingService from './onboarding.service.js'

export async function onboardingRoutes(app) {
  app.addHook('preHandler', authenticate)

  app.get('/status', async (request, reply) => {
    const tenantId = tenantResolver(request)
    return success(reply, await onboardingService.getStatus(app.prisma, tenantId))
  })

  app.post('/empty', async (request, reply) => {
    const tenantId = tenantResolver(request)
    return success(reply, await onboardingService.markEmpty(app.prisma, tenantId))
  })

  app.post('/sample', async (request, reply) => {
    const tenantId = tenantResolver(request)
    return success(reply, await onboardingService.applySample(app.prisma, tenantId), 201)
  })

  app.post('/import', async (request, reply) => {
    const tenantId = tenantResolver(request)
    const body = importEmployeesSchema.parse(request.body)
    return success(reply, await onboardingService.importEmployees(app.prisma, tenantId, body), 201)
  })
}
