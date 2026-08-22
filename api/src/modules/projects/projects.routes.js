import { authenticate } from '../../middlewares/authenticate.js';
import { tenantResolver } from '../../middlewares/tenantResolver.js';
import * as projectsService from './projects.service.js';

export async function projectsRoutes(fastify, options) {
  const { prisma } = fastify;

  fastify.addHook('preHandler', authenticate);

  fastify.get('/portfolio', async (request, reply) => {
    const tenantId = tenantResolver(request);
    const data = await projectsService.getPortfolio(prisma, tenantId);
    return { data };
  });

  fastify.get('/sprints', async (request, reply) => {
    const tenantId = tenantResolver(request);
    const data = await projectsService.getSprints(prisma, tenantId);
    return { data };
  });

  fastify.get('/roadmap', async (request, reply) => {
    const tenantId = tenantResolver(request);
    const data = await projectsService.getRoadmap(prisma, tenantId);
    return { data };
  });
}
