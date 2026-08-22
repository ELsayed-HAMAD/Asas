import { authenticate } from '../../middlewares/authenticate.js';
import { tenantResolver } from '../../middlewares/tenantResolver.js';
import * as supportService from './support.service.js';

export async function supportRoutes(fastify, options) {
  const { prisma } = fastify;

  fastify.addHook('preHandler', authenticate);

  fastify.get('/tickets', async (request, reply) => {
    const tenantId = tenantResolver(request);
    const data = await supportService.getTickets(prisma, tenantId);
    return { data };
  });
}
