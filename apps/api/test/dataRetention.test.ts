import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadEnv } from '../src/config/env.js'

const apps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map(app => app.close()))
})

function stubAuth(sessionData: { session: { activeOrganizationId: string | null }; user: { id: string } } | null) {
  return { api: { getSession: async () => sessionData } } as any
}

describe('Compliance & Data Retention Cleanup', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const auth = stubAuth(null)
    const prisma = { $connect: async () => {}, $disconnect: async () => {} } as any
    const app = await buildApp(loadEnv(), { logger: false, prisma, auth })
    apps.push(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/settings/compliance/cleanup',
      payload: { retentionDays: 30 },
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects non-admin MEMBER callers with 403', async () => {
    const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } })
    const prisma = {
      $connect: async () => {},
      $disconnect: async () => {},
      member: { findUnique: async () => ({ role: 'MEMBER' }) },
      tenant: { findUnique: async () => ({ id: 'tenant_1' }) },
    } as any
    const app = await buildApp(loadEnv(), { logger: false, prisma, auth })
    apps.push(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/settings/compliance/cleanup',
      payload: { retentionDays: 30 },
    })
    expect(res.statusCode).toBe(403)
  })

  it('executes data retention cleanup and logs audit trail for ADMIN', async () => {
    const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'admin_1' } })
    const deleteTokensSpy = vi.fn(async () => ({ count: 5 }))
    const deleteSessionsSpy = vi.fn(async () => ({ count: 12 }))
    const deleteExportsSpy = vi.fn(async () => ({ count: 3 }))
    const auditSpy = vi.fn(async () => ({}))

    const prisma = {
      $connect: async () => {},
      $disconnect: async () => {},
      member: {
        findUnique: async () => ({ role: 'ADMIN' }),
        findMany: async () => [{ user: { email: 'admin@example.com' } }],
      },
      tenant: { findUnique: async () => ({ id: 'tenant_1' }) },
      verification: { deleteMany: deleteTokensSpy },
      session: { deleteMany: deleteSessionsSpy },
      exportJob: { deleteMany: deleteExportsSpy },
      auditLog: { create: auditSpy },
    } as any

    const app = await buildApp(loadEnv(), { logger: false, prisma, auth })
    apps.push(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/settings/compliance/cleanup',
      payload: { retentionDays: 14, categories: ['EXPIRED_TOKENS', 'OLD_SESSIONS', 'EXPIRED_EXPORTS'] },
    })

    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.data.success).toBe(true)
    expect(json.data.purgedCounts).toEqual({
      expiredTokens: 5,
      expiredSessions: 12,
      expiredExports: 3,
      transientLogs: 0,
    })

    expect(deleteTokensSpy).toHaveBeenCalledTimes(1)
    expect(deleteSessionsSpy).toHaveBeenCalledTimes(1)
    expect(deleteExportsSpy).toHaveBeenCalledTimes(1)
    expect(auditSpy).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant_1',
        actorId: 'admin_1',
        action: 'compliance.dataRetention.cleanup',
        targetType: 'DataRetention',
      }),
    })
  })
})
