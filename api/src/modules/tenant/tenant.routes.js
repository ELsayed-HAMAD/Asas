import { authenticate } from '../../middlewares/authenticate.js'
import { tenantResolver } from '../../middlewares/tenantResolver.js'
import { success } from '../../utils/response.js'
export async function tenantRoutes(app) {
  app.get('/current', { preHandler: authenticate }, async (request, reply) => {
    const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantResolver(request) } })
    return success(reply, tenant)
  })
}
