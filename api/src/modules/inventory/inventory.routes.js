import { authenticate } from '../../middlewares/authenticate.js';
import { tenantResolver } from '../../middlewares/tenantResolver.js';
import { productSchema, updateProductSchema } from './inventory.schema.js';
import * as inventoryService from './inventory.service.js';

export async function inventoryRoutes(fastify, options) {
  const { prisma } = fastify;

  fastify.addHook('preHandler', authenticate);

  fastify.get('/products', async (request, reply) => {
    const tenantId = tenantResolver(request);
    const products = await inventoryService.listProducts(prisma, tenantId);
    return { data: products };
  });

  fastify.get('/products/:id', async (request, reply) => {
    const tenantId = tenantResolver(request);
    const { id } = request.params;
    const product = await inventoryService.getProduct(prisma, tenantId, id);
    if (!product) return reply.code(404).send({ error: 'Product not found' });
    return { data: product };
  });

  fastify.post('/products', async (request, reply) => {
    const tenantId = tenantResolver(request);
    const input = productSchema.parse(request.body);
    const product = await inventoryService.createProduct(prisma, tenantId, input);
    return { data: product };
  });

  fastify.put('/products/:id', async (request, reply) => {
    const tenantId = tenantResolver(request);
    const { id } = request.params;
    const input = updateProductSchema.parse(request.body);
    const product = await inventoryService.updateProduct(prisma, tenantId, id, input);
    return { data: product };
  });

  fastify.delete('/products/:id', async (request, reply) => {
    const tenantId = tenantResolver(request);
    const { id } = request.params;
    await inventoryService.deleteProduct(prisma, tenantId, id);
    return { data: { success: true } };
  });
}
