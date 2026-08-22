import { authenticate } from '../../middlewares/authenticate.js';
import { tenantResolver } from '../../middlewares/tenantResolver.js';
import * as dashboardService from './dashboard.service.js';

export async function dashboardRoutes(fastify, options) {
  const { prisma } = fastify;
  
  fastify.addHook('preHandler', authenticate);

  fastify.get('/overview', async (request, reply) => {
    const tenantId = tenantResolver(request);
    const data = await dashboardService.getOverview(prisma, tenantId);
    return { data };
  });
}
