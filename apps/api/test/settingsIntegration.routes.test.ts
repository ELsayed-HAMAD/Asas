import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { clearAuthContextCache } from '../src/middlewares/rbac.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'
import { settingsRoutes } from '../src/modules/settings/settings.routes.js'

const integrationId = 'clh0000000000000000000000'
const createdAt = new Date('2026-10-23T10:00:00.000Z')

async function setup(options: { failAudit?: boolean } = {}) {
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.decorate('auth', {
    api: { getSession: async () => ({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'admin_1' } }) },
  } as unknown as Auth)

  const events: string[] = []
  const integration = {
    id: integrationId,
    tenantId: 'tenant_1',
    name: 'Custom webhook',
    description: null,
    status: 'CONFIGURE',
    syncPullRequests: false,
    syncCiCdStatus: false,
    credential: null,
    createdAt,
    updatedAt: createdAt,
  }
  const auditLogCreate = vi.fn(async () => {
    events.push('audit.create')
    if (options.failAudit) throw new Error('audit database unavailable')
    return { id: 'audit_1' }
  })
  const integrationFindFirst = vi.fn(async () => {
    events.push('integration.findFirst')
    return integration
  })
  const webhookLogCreate = vi.fn(async ({ data }) => {
    events.push('webhookLog.create')
    return { id: 'clh0000000000000000000001', ...data, createdAt }
  })
  const integrationUpdateMany = vi.fn(async () => {
    events.push('integration.updateMany')
    return { count: 1 }
  })
  const prisma = {
    member: { findUnique: vi.fn().mockResolvedValue({ role: 'ADMIN', employeeId: null }) },
    integration: { findFirst: integrationFindFirst, updateMany: integrationUpdateMany },
    webhookLog: { create: webhookLogCreate },
    auditLog: { create: auditLogCreate },
  } as unknown as PrismaClient
  app.decorate('prisma', prisma)
  app.decorate('ssePublish', vi.fn())
  await app.register(settingsRoutes, { prefix: '/api/v1/settings' })

  const sendTest = () => app.inject({
    method: 'POST',
    url: `/api/v1/settings/integrations/${integrationId}/test`,
    headers: { cookie: 'better-auth.session_token=integration-test-token' },
  })
  return { app, events, sendTest, auditLogCreate, integrationFindFirst, webhookLogCreate, integrationUpdateMany }
}

afterEach(() => clearAuthContextCache())

describe('POST /settings/integrations/:id/test', () => {
  it('records the attempt before sending the configured endpoint ping', async () => {
    const f = await setup()
    try {
      const response = await f.sendTest()

      expect(response.statusCode, response.body).toBe(200)
      expect(f.events).toEqual([
        'integration.findFirst',
        'audit.create',
        'integration.findFirst',
        'webhookLog.create',
        'integration.updateMany',
      ])
      expect(f.auditLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant_1',
          actorId: 'admin_1',
          action: 'settings.integration.test',
          targetId: integrationId,
          metadata: JSON.stringify({ event: 'ping', status: 'REQUESTED' }),
        }),
      })
    } finally {
      await f.app.close()
    }
  })

  it('does not ping the provider if the audit record cannot be written', async () => {
    const f = await setup({ failAudit: true })
    try {
      const response = await f.sendTest()

      expect(response.statusCode).toBe(500)
      expect(f.events).toEqual(['integration.findFirst', 'audit.create'])
      expect(f.integrationFindFirst).toHaveBeenCalledTimes(1)
      expect(f.webhookLogCreate).not.toHaveBeenCalled()
      expect(f.integrationUpdateMany).not.toHaveBeenCalled()
    } finally {
      await f.app.close()
    }
  })
})
