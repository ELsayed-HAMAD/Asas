/**
 * Inventory controller — the HTTP-boundary layer between the Fastify routes and the
 * `inventory.service`. The routes (`inventory.routes.ts`) own the declarative bits (guards,
 * schema, response codes, auth-context extraction); the controller owns the request→service
 * mapping. Mirrors the Finance/CRM/Projects split.
 *
 * The controller never reads `tenantId` from a request parameter — the route resolves it from
 * the session and passes it in, so a caller cannot address another tenant's rows.
 */
import type { PrismaClient } from '@prisma/client'
import type {
  Product,
  ProductListQuery,
  ProductArchiveInput,
  ProductSupplier,
  ProductUpdateInput,
  ProductWriteInput,
  PurchaseOrder,
  PurchaseOrderListQuery,
  PurchaseOrderWriteInput,
  StockAlert,
  StockLevel,
  StockMovementListQuery,
  StockMovementRecorded,
  StockMovementWriteInput,
  Warehouse,
} from '@asas/contracts'
import * as service from './inventory.service.js'

export type { ProductListResult, StockMovementListResult } from './inventory.service.js'

export function listProductSuppliers(prisma: PrismaClient, tenantId: string, productId: string): Promise<ProductSupplier[]> {
  return service.listProductSuppliers(prisma, tenantId, productId)
}

export function addProductSupplier(prisma: PrismaClient, tenantId: string, productId: string, name: string): Promise<ProductSupplier[]> {
  return service.addProductSupplier(prisma, tenantId, productId, name)
}

export function removeProductSupplier(prisma: PrismaClient, tenantId: string, productId: string, supplierId: string): Promise<ProductSupplier[]> {
  return service.removeProductSupplier(prisma, tenantId, productId, supplierId)
}

export function createPurchaseOrder(prisma: PrismaClient, tenantId: string, input: PurchaseOrderWriteInput): Promise<PurchaseOrder> {
  return service.createPurchaseOrder(prisma, tenantId, input)
}

export function listPurchaseOrders(prisma: PrismaClient, tenantId: string, query?: PurchaseOrderListQuery): Promise<PurchaseOrder[]> {
  return service.listPurchaseOrders(prisma, tenantId, query)
}

export function approvePurchaseOrder(prisma: PrismaClient, tenantId: string, id: string): Promise<PurchaseOrder> {
  return service.approvePurchaseOrder(prisma, tenantId, id)
}

export function receivePurchaseOrder(prisma: PrismaClient, tenantId: string, id: string): Promise<PurchaseOrder> {
  return service.receivePurchaseOrder(prisma, tenantId, id)
}

export function cancelPurchaseOrder(prisma: PrismaClient, tenantId: string, id: string): Promise<PurchaseOrder> {
  return service.cancelPurchaseOrder(prisma, tenantId, id)
}

// ── Products ─────────────────────────────────────────────────────────────────────

export function listProducts(
  prisma: PrismaClient,
  tenantId: string,
  query: ProductListQuery,
): ReturnType<typeof service.listProducts> {
  return service.listProducts(prisma, tenantId, query)
}

export function getProduct(prisma: PrismaClient, tenantId: string, id: string): Promise<Product> {
  return service.getProduct(prisma, tenantId, id)
}

export function setProductArchived(prisma: PrismaClient, tenantId: string, id: string, input: ProductArchiveInput): Promise<Product> {
  return service.setProductArchived(prisma, tenantId, id, input)
}

export function createProduct(
  prisma: PrismaClient,
  tenantId: string,
  input: ProductWriteInput,
): Promise<Product> {
  return service.createProduct(prisma, tenantId, input)
}

export function updateProduct(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: ProductUpdateInput,
): Promise<Product> {
  return service.updateProduct(prisma, tenantId, id, input)
}

export function deleteProduct(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  return service.deleteProduct(prisma, tenantId, id)
}

// ── Stock levels & alerts (unpaginated, derived in SQL) ───────────────────────────

export function listStockLevels(prisma: PrismaClient, tenantId: string): Promise<StockLevel[]> {
  return service.listStockLevels(prisma, tenantId)
}

export function listStockAlerts(prisma: PrismaClient, tenantId: string): Promise<StockAlert[]> {
  return service.listStockAlerts(prisma, tenantId)
}

export function listWarehouses(prisma: PrismaClient, tenantId: string): Promise<Warehouse[]> {
  return service.listWarehouses(prisma, tenantId)
}

// ── Stock movements ──────────────────────────────────────────────────────────────

export function listStockMovements(
  prisma: PrismaClient,
  tenantId: string,
  query: StockMovementListQuery,
): ReturnType<typeof service.listStockMovements> {
  return service.listStockMovements(prisma, tenantId, query)
}

export function recordStockMovement(
  prisma: PrismaClient,
  tenantId: string,
  input: StockMovementWriteInput,
): Promise<StockMovementRecorded> {
  return service.recordStockMovement(prisma, tenantId, input)
}
