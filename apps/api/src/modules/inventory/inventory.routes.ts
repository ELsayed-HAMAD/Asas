import {
  envelope,
  errorResponses,
  idParamSchema,
  noContentSchema,
  productListQuerySchema,
  productListResponseSchema,
  productSchema,
  productUpdateSchema,
  productWriteSchema,
  stockAlertListResponseSchema,
  stockLevelListResponseSchema,
  stockMovementListQuerySchema,
  stockMovementListResponseSchema,
  stockMovementRecordedSchema,
  stockMovementWriteSchema,
  warehouseListResponseSchema,
} from '@asas/contracts'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { requireAuthContext, requireRole } from '../../middlewares/rbac.js'
import { requirePermission } from '../../middlewares/permissions.js'
import { recordAuditLog } from '../../services/auditLog.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import * as inventoryController from './inventory.controller.js'

/**
 * Inventory — products, derived stock levels/alerts/warehouses, and stock movements.
 *
 * The RBAC split mirrors the other modules: reads go through `requireRole('MEMBER')`; every
 * write (product create/update/delete, and recording a stock movement) goes through the named
 * `inventory.write` permission. `tenantId` is read only from the resolved session. Each
 * successful mutation calls the SSE `ssePublish` helper so other open tabs invalidate their
 * inventory queries (Phase 7).
 *
 * `GET /products` returns `{ items, pagination, summary }` with SQL-aggregate KPIs. Stock
 * levels/alerts/warehouses are derived from the movement rows in SQL (unpaginated).
 */
export async function inventoryRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>()

  // ── Products ───────────────────────────────────────────────────────────────

  server.get(
    '/products',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        querystring: productListQuerySchema,
        response: { 200: envelope(productListResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await inventoryController.listProducts(request.server.prisma, tenantId, request.query)
      return { data: result }
    },
  )

  server.get(
    '/products/:id',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        params: idParamSchema,
        response: { 200: envelope(productSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const product = await inventoryController.getProduct(request.server.prisma, tenantId, request.params.id)
      return { data: product }
    },
  )

  server.post(
    '/products',
    {
      preHandler: requirePermission('inventory.write'),
      schema: {
        body: productWriteSchema,
        response: { 201: envelope(productSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const product = await inventoryController.createProduct(request.server.prisma, tenantId, request.body)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'inventory.product.create',
        targetType: 'Product',
        targetId: product.id,
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('inventory')])
      reply.code(201)
      return { data: product }
    },
  )

  server.patch(
    '/products/:id',
    {
      preHandler: requirePermission('inventory.write'),
      schema: {
        params: idParamSchema,
        body: productUpdateSchema,
        response: { 200: envelope(productSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const product = await inventoryController.updateProduct(
        request.server.prisma,
        tenantId,
        request.params.id,
        request.body,
      )
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'inventory.product.update',
        targetType: 'Product',
        targetId: product.id,
        metadata: { fields: Object.keys(request.body) },
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('inventory')])
      return { data: product }
    },
  )

  server.delete(
    '/products/:id',
    {
      preHandler: requirePermission('inventory.write'),
      schema: {
        params: idParamSchema,
        response: { 204: noContentSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      await inventoryController.deleteProduct(request.server.prisma, tenantId, request.params.id)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'inventory.product.delete',
        targetType: 'Product',
        targetId: request.params.id,
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('inventory')])
      reply.code(204)
    },
  )

  // ── Stock levels / alerts / warehouses (derived in SQL) ─────────────────────

  server.get(
    '/stock/levels',
    {
      preHandler: requireRole('MEMBER'),
      schema: { response: { 200: envelope(stockLevelListResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const items = await inventoryController.listStockLevels(request.server.prisma, tenantId)
      return { data: { items } }
    },
  )

  server.get(
    '/stock/alerts',
    {
      preHandler: requireRole('MEMBER'),
      schema: { response: { 200: envelope(stockAlertListResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const items = await inventoryController.listStockAlerts(request.server.prisma, tenantId)
      return { data: { items } }
    },
  )

  server.get(
    '/warehouses',
    {
      preHandler: requireRole('MEMBER'),
      schema: { response: { 200: envelope(warehouseListResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const items = await inventoryController.listWarehouses(request.server.prisma, tenantId)
      return { data: { items } }
    },
  )

  // ── Stock movements ────────────────────────────────────────────────────────

  server.get(
    '/stock/movements',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        querystring: stockMovementListQuerySchema,
        response: { 200: envelope(stockMovementListResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await inventoryController.listStockMovements(
        request.server.prisma,
        tenantId,
        request.query,
      )
      return { data: result }
    },
  )

  server.post(
    '/stock/movements',
    {
      preHandler: requirePermission('inventory.write'),
      schema: {
        body: stockMovementWriteSchema,
        response: { 201: envelope(stockMovementRecordedSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const movement = await inventoryController.recordStockMovement(
        request.server.prisma,
        tenantId,
        request.body,
      )
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'inventory.stock.record',
        targetType: 'StockMovement',
        targetId: movement.id,
        metadata: { productId: movement.productId, delta: movement.delta },
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('inventory')])
      reply.code(201)
      return { data: movement }
    },
  )
}
