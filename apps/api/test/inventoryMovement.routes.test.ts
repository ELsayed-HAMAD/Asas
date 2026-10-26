import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'
import { inventoryRoutes } from '../src/modules/inventory/inventory.routes.js'

const productId = 'c987654321098765432109876'
const movementId = 'c123456789012345678901234'
const requestKey = 'cc35b4e1-07ec-4656-a3d3-8b4e71c67251'

async function setup() {
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.decorate('auth', {
    api: {
      getSession: async () => ({
        session: { activeOrganizationId: 'tenant_1' },
        user: { id: 'user_1', email: 'admin@example.com' },
      }),
    },
  } as unknown as Auth)

  let stock = 10
  let movement: Record<string, unknown> | null = null
  const audit = vi.fn(async () => ({ id: 'audit_1' }))
  const tx = {
    product: {
      updateMany: vi.fn(async ({ data }: { data: { stock: { increment: number } } }) => {
        stock += data.stock.increment
        return { count: 1 }
      }),
      findUniqueOrThrow: vi.fn(async () => ({ stock })),
    },
    stockMovement: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        movement = {
          id: movementId,
          ...data,
          createdAt: new Date('2026-10-26T08:00:00.000Z'),
          product: { name: 'Widget', warehouse: 'Main' },
        }
        return movement
      }),
    },
    auditLog: { create: audit },
  }
  const prisma = {
    member: { findUnique: async () => ({ role: 'ADMIN', employeeId: null }) },
    product: { findFirst: async () => ({ id: productId, stock }) },
    inventoryValuationConfig: { findUnique: async () => null },
    stockMovement: {
      findFirst: async ({ where }: { where: { requestKey?: string } }) => movement && movement.requestKey === where.requestKey
        ? { ...movement, product: { name: 'Widget', warehouse: 'Main', stock } }
        : null,
    },
    $transaction: async (work: (client: unknown) => Promise<unknown>) => work(tx),
  } as unknown as PrismaClient

  app.decorate('prisma', prisma)
  const publish = vi.fn()
  app.decorate('ssePublish', publish)
  await app.register(inventoryRoutes)
  return { app, tx, publish, audit }
}

describe('POST /stock/movements', () => {
  it('returns 201 for a new manual movement and 200 for an unchanged retry without a second write', async () => {
    const { app, tx, publish, audit } = await setup()
    const payload = { productId, delta: 2, note: 'PO-2026-081', requestKey }

    const first = await app.inject({ method: 'POST', url: '/stock/movements', payload })
    expect(first.statusCode).toBe(201)
    expect(first.json().data).toMatchObject({
      id: movementId,
      productId,
      delta: 2,
      newStock: 12,
      creationReplayed: false,
    })

    const retry = await app.inject({ method: 'POST', url: '/stock/movements', payload })
    expect(retry.statusCode).toBe(200)
    expect(retry.json().data).toMatchObject({
      id: movementId,
      delta: 2,
      newStock: 12,
      creationReplayed: true,
    })

    expect(tx.product.updateMany).toHaveBeenCalledTimes(1)
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1)
    expect(audit).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledTimes(1)
  })

  it('rejects a missing request key and a reused key with changed values', async () => {
    const { app, tx } = await setup()
    const missing = await app.inject({
      method: 'POST',
      url: '/stock/movements',
      payload: { productId, delta: 1 },
    })
    expect(missing.statusCode).toBe(400)

    const payload = { productId, delta: 2, requestKey }
    expect((await app.inject({ method: 'POST', url: '/stock/movements', payload })).statusCode).toBe(201)

    const changed = await app.inject({
      method: 'POST',
      url: '/stock/movements',
      payload: { ...payload, delta: 3 },
    })
    expect(changed.statusCode).toBe(409)
    expect(changed.json().error.message).toBe('This request key was already used for a different stock movement')
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1)
  })
})
