import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'
import { onboardingRoutes } from '../src/modules/onboarding/onboarding.routes.js'

async function setup(options: { auditFails?: boolean } = {}) {
  let onboardingStatus = 'PENDING'
  const auditLog = { create: options.auditFails ? vi.fn().mockRejectedValue(new Error('audit unavailable')) : vi.fn().mockResolvedValue({}) }
  const tx = {
    tenant: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (onboardingStatus !== where.onboardingStatus) return { count: 0 }
        onboardingStatus = data.onboardingStatus
        return { count: 1 }
      }),
      findUnique: vi.fn(async () => ({ id: 'tenant_1', onboardingStatus, name: 'Acme Ltd.' })),
    },
    auditLog,
  }
  const prisma = {
    member: { findUnique: vi.fn().mockResolvedValue({ role: 'OWNER', employeeId: null }) },
    tenant: { findUnique: vi.fn(async () => ({ id: 'tenant_1', onboardingStatus, name: 'Acme Ltd.' })) },
    employee: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
      const previousStatus = onboardingStatus
      try {
        return await callback(tx)
      } catch (error) {
        onboardingStatus = previousStatus
        throw error
      }
    }),
  } as unknown as PrismaClient

  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.decorate('auth', {
    api: { getSession: async () => ({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1', email: 'owner@example.com' } }) },
  } as unknown as Auth)
  app.decorate('prisma', prisma)
  app.decorate('ssePublish', vi.fn())
  await app.register(onboardingRoutes)
  return { app, prisma, tx, auditLog, getStatus: () => onboardingStatus }
}

describe('POST /empty', () => {
  it('records the state change and audit atomically and returns success on a retry', async () => {
    const { app, prisma, tx, auditLog, getStatus } = await setup()

    const first = await app.inject({ method: 'POST', url: '/empty' })
    const second = await app.inject({ method: 'POST', url: '/empty' })

    expect(first.statusCode).toBe(200)
    expect(first.json().data.onboardingStatus).toBe('EMPTY')
    expect(second.statusCode).toBe(200)
    expect(second.json().data.onboardingStatus).toBe('EMPTY')
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    expect(tx.tenant.updateMany).toHaveBeenCalledTimes(2)
    expect(auditLog.create).toHaveBeenCalledTimes(1)
    expect(auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant_1', actorId: 'user_1', action: 'onboarding.markEmpty' }),
    }))
    expect(getStatus()).toBe('EMPTY')
    await app.close()
  })

  it('rolls back the initialization when the audit write fails', async () => {
    const { app, auditLog, getStatus } = await setup({ auditFails: true })

    const response = await app.inject({ method: 'POST', url: '/empty' })

    expect(response.statusCode).toBe(500)
    expect(auditLog.create).toHaveBeenCalledOnce()
    expect(getStatus()).toBe('PENDING')
    await app.close()
  })
})
