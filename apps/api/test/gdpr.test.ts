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

const employeeCuid = 'cly0000000000000000000001'
const userCuid = 'cly0000000000000000000002'

describe('GDPR & Compliance Anonymization', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const auth = stubAuth(null)
    const prisma = { $connect: async () => {}, $disconnect: async () => {} } as any
    const app = await buildApp(loadEnv(), { logger: false, prisma, auth })
    apps.push(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/settings/compliance/anonymize',
      payload: { targetType: 'EMPLOYEE', targetId: employeeCuid, reason: 'Right to erasure' },
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
      url: '/api/v1/settings/compliance/anonymize',
      payload: { targetType: 'EMPLOYEE', targetId: employeeCuid, reason: 'Right to erasure' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 404 when employee does not exist or belongs to another tenant', async () => {
    const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'admin_1' } })
    const prisma = {
      $connect: async () => {},
      $disconnect: async () => {},
      member: { findUnique: async () => ({ role: 'ADMIN' }) },
      tenant: { findUnique: async () => ({ id: 'tenant_1' }) },
      employee: { findUnique: async () => null },
      $transaction: async (fn: any) => fn(prisma),
    } as any
    const app = await buildApp(loadEnv(), { logger: false, prisma, auth })
    apps.push(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/settings/compliance/anonymize',
      payload: { targetType: 'EMPLOYEE', targetId: employeeCuid, reason: 'Right to erasure' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.message).toBe('Employee not found in this workspace')
  })

  it('successfully scrubs employee PII and records audit log transactionally', async () => {
    const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'admin_1' } })
    const updateSpy = vi.fn(async () => ({}))
    const auditSpy = vi.fn(async () => ({}))

    const prisma = {
      $connect: async () => {},
      $disconnect: async () => {},
      member: { findUnique: async () => ({ role: 'ADMIN' }) },
      tenant: { findUnique: async () => ({ id: 'tenant_1' }) },
      employee: {
        findUnique: async () => ({
          id: employeeCuid,
          tenantId: 'tenant_1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          status: 'ACTIVE',
        }),
        update: updateSpy,
      },
      auditLog: { create: auditSpy },
      $transaction: async (fn: any) => fn(prisma),
    } as any
    const app = await buildApp(loadEnv(), { logger: false, prisma, auth })
    apps.push(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/settings/compliance/anonymize',
      payload: { targetType: 'EMPLOYEE', targetId: employeeCuid, reason: 'Employee departed and requested erasure' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({
      success: true,
      targetType: 'EMPLOYEE',
      targetId: employeeCuid,
      recordsScrubbed: 1,
    })

    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: employeeCuid },
      data: expect.objectContaining({
        status: 'ARCHIVED',
        avatarUrl: null,
        location: null,
        band: null,
        employeeNumber: null,
      }),
    })

    expect(auditSpy).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant_1',
        actorId: 'admin_1',
        action: 'compliance.gdpr.anonymize',
        targetType: 'EMPLOYEE',
        targetId: employeeCuid,
      }),
    })
  })

  it('successfully scrubs user PII when member of workspace', async () => {
    const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'admin_1' } })
    const updateUserSpy = vi.fn(async () => ({}))
    const auditSpy = vi.fn(async () => ({}))

    const prisma = {
      $connect: async () => {},
      $disconnect: async () => {},
      member: {
        findUnique: async () => ({ role: 'ADMIN' }),
        findFirst: async () => ({
          userId: userCuid,
          tenantId: 'tenant_1',
          user: { id: userCuid, name: 'John Doe', email: 'john@example.com' },
        }),
      },
      tenant: { findUnique: async () => ({ id: 'tenant_1' }) },
      user: { update: updateUserSpy },
      auditLog: { create: auditSpy },
      $transaction: async (fn: any) => fn(prisma),
    } as any
    const app = await buildApp(loadEnv(), { logger: false, prisma, auth })
    apps.push(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/settings/compliance/anonymize',
      payload: { targetType: 'USER', targetId: userCuid, reason: 'User requested account erasure' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.success).toBe(true)
    expect(updateUserSpy).toHaveBeenCalledWith({
      where: { id: userCuid },
      data: expect.objectContaining({
        image: null,
      }),
    })
  })
})
