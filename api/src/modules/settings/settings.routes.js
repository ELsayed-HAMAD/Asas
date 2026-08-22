import { authenticate } from '../../middlewares/authenticate.js';
import { tenantResolver } from '../../middlewares/tenantResolver.js';
import * as settingsService from './settings.service.js';

export async function settingsRoutes(fastify, options) {
  const { prisma } = fastify;

  fastify.addHook('preHandler', authenticate);

  fastify.get('/general', async (request, reply) => {
    const tenantId = tenantResolver(request);
    const data = await settingsService.getGeneralSettings(prisma, tenantId);
    return { data };
  });
  
  fastify.put('/general', async (request, reply) => {
    const tenantId = tenantResolver(request);
    const data = await settingsService.updateGeneralSettings(prisma, tenantId, request.body);
    return { data };
  });

  fastify.get('/billing', async (request, reply) => {
    const tenantId = tenantResolver(request);
    const data = await settingsService.getBillingPlans(prisma, tenantId);
    return { data };
  });

  fastify.get('/integrations', async (request, reply) => {
    const tenantId = tenantResolver(request);
    const data = await settingsService.getIntegrations(prisma, tenantId);
    return { data };
  });

  fastify.get('/notifications', async (request, reply) => {
    const tenantId = tenantResolver(request);
    const data = await settingsService.getNotifications(prisma, tenantId);
    return { data };
  });
  
  fastify.get('/export', async (request, reply) => {
    const tenantId = tenantResolver(request);
    const data = await settingsService.getDataExport(prisma, tenantId);
    return { data };
  });
}
