import Fastify from 'fastify'
import { Prisma } from '@prisma/client'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { loadEnv } from '../src/config/env.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'
import { clearAuthContextCache, requireRole } from '../src/middlewares/rbac.js'
import { platformRoutes } from '../src/modules/platform/platform.routes.js'
import { invalidatePlatformFlagsCache } from '../src/modules/platform/platformSettings.js'

const TENANT_ID = 'tenant_platform_abc123'
const USER_ID = 'user_platform_abc123'

type PlatformUser = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  platformRole: 'NONE' | 'SUPPORT' | 'ADMIN' | 'OWNER'
  twoFactorEnabled: boolean
}

type BuildPlatformOptions = {
  user?: PlatformUser
  tenant?: Record<string, unknown>
  workspaces?: unknown[]
  workspaceDetail?: Record<string, unknown>
  audited?: unknown[]
  env?: NodeJS.ProcessEnv
  twoFactorVerified?: boolean
  twoFactor?: {
    id?: string
    verified?: boolean
    failedVerificationCount?: number
    lockedUntil?: Date | null
  } | null
  verifyError?: unknown
}

async function buildPlatformApp(options: BuildPlatformOptions = {}) {
  const user = options.user ?? { id: 'user_1', name: 'Owner', email: 'owner@example.com', emailVerified: true, platformRole: 'OWNER', twoFactorEnabled: true }
  const auditRows = options.audited ?? []
  const verifiedAt = options.twoFactorVerified ? new Date('2026-01-01T00:00:00.000Z') : null

  let failureCount = options.twoFactor?.failedVerificationCount ?? 0
  let lockedUntil = options.twoFactor?.lockedUntil ?? null
  const twoFactorRow = options.twoFactor === null
    ? null
    : {
        id: options.twoFactor?.id ?? 'twofactor_1',
        userId: user.id,
        verified: options.twoFactor?.verified ?? true,
        failedVerificationCount: failureCount,
        lockedUntil,
      }

  const tx = {
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    platformAuditLog: {
      create: vi.fn().mockImplementation(async ({ data }) => { auditRows.push(data); return data }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    tenant: {
      count: vi.fn().mockImplementation(async ({ where }) => (where?.status === 'ACTIVE' ? 1 : where?.status === 'SUSPENDED' ? 0 : 1)),
      findMany: vi.fn().mockResolvedValue(options.workspaces ?? []),
      findUnique: vi.fn().mockImplementation(async () => options.tenant ?? null),
      update: vi.fn().mockImplementation(async ({ data }) => ({
        id: 'tenant_1',
        status: data.status,
        suspendedAt: data.suspendedAt ?? null,
        suspendedReason: data.suspendedReason ?? null,
      })),
    },
    subscription: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }) => ({ id: 'sub_new', ...data })),
      update: vi.fn().mockImplementation(async ({ data }) => ({ id: 'sub_1', ...data })),
    },
    session: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
    user: {
      findUnique: vi.fn().mockImplementation(async ({ where }) => ({ ...user, id: where.id, createdAt: new Date(), members: [], sessions: [] })),
      update: vi.fn().mockResolvedValue(user),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(1),
    },
    auditLog: { findMany: vi.fn().mockResolvedValue([]) },
    platformSetting: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    employee: { count: vi.fn().mockResolvedValue(0) },
    payableInvoice: { count: vi.fn().mockResolvedValue(0) },
    receivableInvoice: { count: vi.fn().mockResolvedValue(0) },
    deal: { count: vi.fn().mockResolvedValue(0) },
    project: { count: vi.fn().mockResolvedValue(0) },
    product: { count: vi.fn().mockResolvedValue(0) },
    exportJob: {
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    billingInvoice: {
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null }, _count: { _all: 0 } }),
    },
  }

  const prisma = {
    $transaction: vi.fn().mockImplementation(async fn => fn(tx)),
    user: {
      findUnique: vi.fn().mockImplementation(async () => user),
      update: vi.fn().mockResolvedValue(user),
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([]),
    },
    session: {
      findUnique: vi.fn().mockResolvedValue({ twoFactorVerifiedAt: verifiedAt }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    twoFactor: {
      findFirst: vi.fn().mockResolvedValue(twoFactorRow),
      update: vi.fn().mockImplementation(async ({ data }) => {
        if (data?.failedVerificationCount?.increment) failureCount += data.failedVerificationCount.increment
        if (data?.failedVerificationCount === 0) failureCount = 0
        if (data && 'lockedUntil' in data) lockedUntil = data.lockedUntil
        if (twoFactorRow) {
          twoFactorRow.failedVerificationCount = failureCount
          twoFactorRow.lockedUntil = lockedUntil
        }
        return { ...twoFactorRow, failedVerificationCount: failureCount, lockedUntil }
      }),
    },
    platformSetting: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    platformAuditLog: {
      create: vi.fn().mockImplementation(async ({ data }) => { auditRows.push(data); return data }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    member: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
  }

  const authApi = {
    getSession: vi.fn().mockResolvedValue({
      session: { id: 'session_1', activeOrganizationId: 'tenant_1' },
      user: { id: user.id, email: user.email },
    }),
    verifyTOTP: vi.fn().mockImplementation(async () => {
      if (options.verifyError) throw options.verifyError
      return { token: 'session_token', user: { id: user.id } }
    }),
    verifyBackupCode: vi.fn().mockImplementation(async () => {
      if (options.verifyError) throw options.verifyError
      return { token: 'session_token', user: { id: user.id } }
    }),
  }

  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.decorate('auth', { api: authApi } as unknown as Auth)
  app.decorate('prisma', prisma as never)
  app.decorate('objectStorage', null as never)
  app.decorate('ssePublish', vi.fn())
  await app.register(platformRoutes, {
    prefix: '/platform',
    env: loadEnv({ NODE_ENV: 'test', PLATFORM_OWNER_EMAILS: '', ...options.env }),
  })
  return { app, prisma, tx, auditRows, authApi }
}

function workspaceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tenant_1',
    name: 'Acme Workspace',
    slug: 'acme',
    status: 'ACTIVE',
    onboardingStatus: 'EMPTY',
    currency: 'USD',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    subscriptions: [{
      planName: 'Standard Growth',
      priceMonthly: new Prisma.Decimal(29),
      status: 'ACTIVE',
      seatsUsed: 2,
      seatLimit: 15,
      storageUsedGb: 1.5,
      storageLimitGb: 25,
      renewsOn: null,
      stripeSubscriptionId: null,
      stripeCurrency: 'USD',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    }],
    _count: { members: 2 },
    ...overrides,
  }
}

beforeEach(() => {
  clearAuthContextCache()
  invalidatePlatformFlagsCache()
})

describe('platform console routes', () => {
  it('returns safe public flags without authentication', async () => {
    const { app } = await buildPlatformApp()
    try {
      const response = await app.inject({ method: 'GET', url: '/platform/public-config' })
      expect(response.statusCode).toBe(200)
      expect(response.json().data).toEqual({ maintenanceMode: false, signupsEnabled: true, exportsEnabled: true })
    } finally { await app.close() }
  })

  it('denies a normal workspace account and allows a platform owner', async () => {
    const denied = await buildPlatformApp({
      user: { id: 'user_2', name: 'Member', email: 'member@example.com', emailVerified: true, platformRole: 'NONE', twoFactorEnabled: false },
    })
    try {
      expect((await denied.app.inject({ method: 'GET', url: '/platform/me' })).statusCode).toBe(403)
    } finally { await denied.app.close() }

    const allowed = await buildPlatformApp()
    try {
      const response = await allowed.app.inject({ method: 'GET', url: '/platform/me' })
      expect(response.statusCode).toBe(200)
      expect(response.json().data.platformRole).toBe('OWNER')
      expect(response.json().data.twoFactorVerified).toBe(false)
      expect(response.json().data.requiresTwoFactor).toBe(false)
      expect(response.json().data.requiresTwoFactorVerification).toBe(false)
      expect(response.json().data.nodeEnv).toBe('test')
      expect(response.json().data.isProduction).toBe(false)
    } finally { await allowed.app.close() }
  })

  it('bootstraps an allowlisted email to platform owner and audits it', async () => {
    const app = Fastify()
    app.setValidatorCompiler(validatorCompiler)
    app.setSerializerCompiler(serializerCompiler)
    app.setErrorHandler(errorHandler)
    const user = { id: 'user_3', name: 'Bootstrap', email: 'bootstrap@example.com', emailVerified: true, platformRole: 'NONE', twoFactorEnabled: true }
    const auditRows: unknown[] = []
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user), update: vi.fn().mockResolvedValue({ ...user, platformRole: 'OWNER' }) },
      session: { findUnique: vi.fn().mockResolvedValue(null) },
      platformAuditLog: { create: vi.fn().mockImplementation(async ({ data }) => { auditRows.push(data); return data }) },
    }
    app.decorate('auth', { api: { getSession: async () => ({ user: { id: user.id, email: user.email } }) } } as unknown as Auth)
    app.decorate('prisma', prisma as never)
    await app.register(platformRoutes, {
      prefix: '/platform',
      env: loadEnv({ NODE_ENV: 'test', PLATFORM_OWNER_EMAILS: 'bootstrap@example.com' }),
    })
    try {
      const response = await app.inject({ method: 'GET', url: '/platform/me' })
      expect(response.statusCode).toBe(200)
      expect(response.json().data.platformRole).toBe('OWNER')
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: user.id },
        data: { platformRole: 'OWNER' },
      }))
      expect(auditRows).toEqual([expect.objectContaining({ action: 'platform.owner.bootstrap' })])
    } finally { await app.close() }
  })

  it('does not bootstrap an allowlisted email until it is verified', async () => {
    const app = Fastify()
    app.setValidatorCompiler(validatorCompiler)
    app.setSerializerCompiler(serializerCompiler)
    app.setErrorHandler(errorHandler)
    const user = { id: 'user_4', name: 'Unverified', email: 'unverified@example.com', emailVerified: false, platformRole: 'NONE', twoFactorEnabled: true }
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user), update: vi.fn() },
      session: { findUnique: vi.fn().mockResolvedValue(null) },
      platformAuditLog: { create: vi.fn() },
    }
    app.decorate('auth', { api: { getSession: async () => ({ user: { id: user.id, email: user.email } }) } } as unknown as Auth)
    app.decorate('prisma', prisma as never)
    await app.register(platformRoutes, {
      prefix: '/platform',
      env: loadEnv({ NODE_ENV: 'test', PLATFORM_OWNER_EMAILS: 'unverified@example.com' }),
    })
    try {
      const response = await app.inject({ method: 'GET', url: '/platform/me' })
      expect(response.statusCode).toBe(403)
      expect(prisma.user.update).not.toHaveBeenCalled()
    } finally { await app.close() }
  })

  it('reports the step-up state on /me without blocking the guard', async () => {
    const { app } = await buildPlatformApp({ env: { PLATFORM_REQUIRE_2FA: 'true' } })
    try {
      const response = await app.inject({ method: 'GET', url: '/platform/me' })
      expect(response.statusCode).toBe(200)
      expect(response.json().data).toMatchObject({
        twoFactorEnabled: true,
        twoFactorVerified: false,
        requiresTwoFactor: false,
        requiresTwoFactorVerification: true,
      })
    } finally { await app.close() }
  })

  it('blocks a platform route until the session completes a second factor', async () => {
    const unverified = await buildPlatformApp({ env: { PLATFORM_REQUIRE_2FA: 'true' } })
    try {
      const response = await unverified.app.inject({ method: 'GET', url: '/platform/overview' })
      expect(response.statusCode).toBe(403)
      expect(response.json().error.details).toEqual({ code: 'PLATFORM_2FA_REQUIRED', reason: 'VERIFY' })
    } finally { await unverified.app.close() }

    const verified = await buildPlatformApp({
      env: { PLATFORM_REQUIRE_2FA: 'true' },
      twoFactorVerified: true,
    })
    try {
      const response = await verified.app.inject({ method: 'GET', url: '/platform/overview' })
      expect(response.statusCode).toBe(200)
    } finally { await verified.app.close() }
  })

  it('asks an account without a second factor to enroll first', async () => {
    const { app } = await buildPlatformApp({
      user: { id: 'user_5', name: 'Owner', email: 'owner@example.com', emailVerified: true, platformRole: 'OWNER', twoFactorEnabled: false },
      env: { PLATFORM_REQUIRE_2FA: 'true' },
    })
    try {
      const response = await app.inject({ method: 'GET', url: '/platform/overview' })
      expect(response.statusCode).toBe(403)
      expect(response.json().error.details).toEqual({ code: 'PLATFORM_2FA_REQUIRED', reason: 'ENROLL' })
    } finally { await app.close() }
  })

  it('completes a TOTP step-up and marks the current session', async () => {
    const { app, prisma, authApi, auditRows } = await buildPlatformApp({
      env: { PLATFORM_REQUIRE_2FA: 'true' },
    })
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/platform/step-up',
        payload: { method: 'totp', code: '123456' },
      })
      expect(response.statusCode, response.body).toBe(200)
      expect(response.json().data.verified).toBe(true)
      expect(authApi.verifyTOTP).toHaveBeenCalledWith(expect.objectContaining({
        body: { code: '123456' },
      }))
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session_1', userId: 'user_1' },
        data: { twoFactorVerifiedAt: expect.any(Date) },
      })
      expect(prisma.twoFactor.update).toHaveBeenCalledWith({
        where: { id: 'twofactor_1' },
        data: { failedVerificationCount: 0, lockedUntil: null },
      })
      expect(auditRows).toEqual([
        expect.objectContaining({ action: 'platform.step-up', targetId: 'session_1' }),
      ])
    } finally { await app.close() }
  })

  it('verifies a recovery code through the backup-code endpoint', async () => {
    const { app, authApi } = await buildPlatformApp({ env: { PLATFORM_REQUIRE_2FA: 'true' } })
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/platform/step-up',
        payload: { method: 'backup-code', code: 'ABCDE-FGHIJ' },
      })
      expect(response.statusCode, response.body).toBe(200)
      expect(authApi.verifyBackupCode).toHaveBeenCalledWith(expect.objectContaining({
        body: { code: 'ABCDE-FGHIJ' },
      }))
      expect(authApi.verifyTOTP).not.toHaveBeenCalled()
    } finally { await app.close() }
  })

  it('counts a rejected step-up and leaves the session unmarked', async () => {
    const invalid = Object.assign(new Error('Invalid code'), { status: 'UNAUTHORIZED' })
    const { app, prisma, auditRows } = await buildPlatformApp({
      env: { PLATFORM_REQUIRE_2FA: 'true' },
      verifyError: invalid,
    })
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/platform/step-up',
        payload: { method: 'totp', code: '000000' },
      })
      expect(response.statusCode).toBe(401)
      expect(response.json().error.details).toEqual({
        code: 'PLATFORM_2FA_INVALID_CODE',
        attemptsRemaining: 9,
      })
      expect(prisma.twoFactor.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'twofactor_1' },
        data: { failedVerificationCount: { increment: 1 } },
      }))
      expect(prisma.session.updateMany).not.toHaveBeenCalled()
      expect(auditRows).toEqual([])
    } finally { await app.close() }
  })

  it('refuses a step-up while the two-factor account lock is active', async () => {
    const { app, authApi } = await buildPlatformApp({
      env: { PLATFORM_REQUIRE_2FA: 'true' },
      twoFactor: { lockedUntil: new Date(Date.now() + 60_000) },
    })
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/platform/step-up',
        payload: { method: 'totp', code: '123456' },
      })
      expect(response.statusCode).toBe(429)
      expect(response.json().error.details).toMatchObject({ code: 'PLATFORM_2FA_LOCKED' })
      expect(authApi.verifyTOTP).not.toHaveBeenCalled()
    } finally { await app.close() }
  })

  it('asks for enrollment when the step-up account has no TOTP row', async () => {
    const { app, authApi } = await buildPlatformApp({
      env: { PLATFORM_REQUIRE_2FA: 'true' },
      twoFactor: null,
    })
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/platform/step-up',
        payload: { method: 'totp', code: '123456' },
      })
      expect(response.statusCode).toBe(400)
      expect(response.json().error.details).toEqual({ code: 'PLATFORM_2FA_ENROLL_REQUIRED' })
      expect(authApi.verifyTOTP).not.toHaveBeenCalled()
    } finally { await app.close() }
  })

  it('lists workspaces through the RLS bypass transaction', async () => {
    const { app, tx } = await buildPlatformApp({ workspaces: [workspaceRow()] })
    try {
      const response = await app.inject({ method: 'GET', url: '/platform/workspaces?status=ALL&page=1&limit=25' })
      expect(response.statusCode).toBe(200)
      const body = response.json().data
      expect(body.items[0]).toMatchObject({ id: 'tenant_1', planName: 'Standard Growth', seatsUsed: 2, seatLimit: 15 })
      expect(body.pagination.total).toBe(1)
      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining("app.bypass_rls = 'on'"))
    } finally { await app.close() }
  })

  it('suspends a workspace and writes an immutable platform audit row', async () => {
    const audited: unknown[] = []
    const { app } = await buildPlatformApp({
      audited,
      tenant: { id: TENANT_ID, name: 'Acme Workspace', status: 'ACTIVE' },
    })
    try {
      const response = await app.inject({
        method: 'PATCH',
        url: `/platform/workspaces/${TENANT_ID}/status`,
        payload: { status: 'SUSPENDED', reason: 'Security review' },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().data).toMatchObject({ status: 'SUSPENDED', suspendedReason: 'Security review' })
      expect(audited).toEqual([expect.objectContaining({ action: 'workspace.suspend', targetId: TENANT_ID })])
    } finally { await app.close() }
  })

  it('refuses to comp a Stripe-managed workspace', async () => {
    const { app } = await buildPlatformApp({
      tenant: {
        id: TENANT_ID,
        name: 'Acme Workspace',
        status: 'ACTIVE',
        stripeCustomerId: 'cus_123',
        subscriptions: [{
          id: 'sub_1',
          planName: 'Professional Scale',
          priceMonthly: new Prisma.Decimal(79),
          status: 'ACTIVE',
          seatsUsed: 4,
          seatLimit: 50,
          storageUsedGb: 10,
          storageLimitGb: 100,
          renewsOn: null,
          stripeSubscriptionId: 'sub_stripe',
          stripeCurrency: 'USD',
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
        }],
        _count: { members: 4 },
      },
    })
    try {
      const response = await app.inject({
        method: 'PATCH',
        url: `/platform/workspaces/${TENANT_ID}/plan`,
        payload: { planId: 'pro' },
      })
      expect(response.statusCode).toBe(409)
      expect(response.json().error.message).toMatch(/Stripe/)
    } finally { await app.close() }
  })

  it('comps a local plan and refreshes workspace settings subscribers', async () => {
    const audited: unknown[] = []
    const { app } = await buildPlatformApp({
      audited,
      tenant: {
        id: TENANT_ID,
        name: 'Acme Workspace',
        status: 'ACTIVE',
        stripeCustomerId: null,
        subscriptions: [],
        _count: { members: 2 },
      },
    })
    try {
      const response = await app.inject({
        method: 'PATCH',
        url: `/platform/workspaces/${TENANT_ID}/plan`,
        payload: { planId: 'starter' },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().data).toMatchObject({
        planName: 'Standard Growth',
        seatLimit: 15,
        storageLimitGb: 25,
      })
      expect(audited).toEqual([expect.objectContaining({ action: 'workspace.plan.comp', targetId: TENANT_ID })])
      expect(app.ssePublish).toHaveBeenCalledWith(TENANT_ID, ['asas,settings'])
    } finally { await app.close() }
  })

  it('revokes user sessions and records the action', async () => {
    const audited: unknown[] = []
    const { app } = await buildPlatformApp({ audited })
    try {
      const response = await app.inject({ method: 'POST', url: `/platform/users/${USER_ID}/revoke-sessions` })
      expect(response.statusCode).toBe(200)
      expect(response.json().data.revoked).toBe(2)
      expect(audited).toEqual([expect.objectContaining({ action: 'user.sessions.revoke', targetId: USER_ID })])
    } finally { await app.close() }
  })

  it('accepts Better Auth identifiers that are not cuids', async () => {
    const { app } = await buildPlatformApp()
    try {
      const userResponse = await app.inject({ method: 'GET', url: `/platform/users/${USER_ID}` })
      expect(userResponse.statusCode, userResponse.body).toBe(200)
      expect(userResponse.json().data.user.id).toBe(USER_ID)

      const workspaceResponse = await app.inject({ method: 'GET', url: `/platform/workspaces/${TENANT_ID}` })
      expect(workspaceResponse.statusCode).toBe(404)
    } finally { await app.close() }
  })

  it('updates a platform flag and audits it', async () => {
    const audited: unknown[] = []
    const { app, prisma } = await buildPlatformApp({ audited })
    try {
      const response = await app.inject({
        method: 'PATCH',
        url: '/platform/flags/signups_enabled',
        payload: { enabled: false },
      })
      expect(response.statusCode).toBe(200)
      expect(prisma.platformSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { key: 'signups_enabled' },
        update: expect.objectContaining({ value: false }),
      }))
      expect(audited).toEqual([expect.objectContaining({ action: 'platform.flags.update', targetId: 'signups_enabled' })])
    } finally { await app.close() }
  })
})

describe('workspace suspension guard', () => {
  async function buildGuardApp(status: string) {
    const app = Fastify()
    app.decorate('auth', {
      api: {
        getSession: async () => ({
          session: { activeOrganizationId: 'tenant_1' },
          user: { id: 'user_1', email: 'owner@example.com' },
        }),
      },
    } as unknown as Auth)
    app.decorate('prisma', {
      member: {
        findUnique: async () => ({
          userId: 'user_1',
          tenantId: 'tenant_1',
          role: 'OWNER',
          employeeId: null,
          tenant: { status },
        }),
        findMany: async () => [],
      },
    } as never)
    app.get('/tenant', { preHandler: requireRole('MEMBER') }, async () => ({ data: { ok: true } }))
    return app
  }

  it('blocks a suspended workspace with a machine-readable code', async () => {
    const app = await buildGuardApp('SUSPENDED')
    try {
      const response = await app.inject({ method: 'GET', url: '/tenant' })
      expect(response.statusCode).toBe(403)
      expect(response.json().error.details).toEqual({ code: 'WORKSPACE_SUSPENDED' })
    } finally { await app.close() }
  })

  it('allows an active workspace through the same guard', async () => {
    const app = await buildGuardApp('ACTIVE')
    try {
      const response = await app.inject({ method: 'GET', url: '/tenant' })
      expect(response.statusCode).toBe(200)
    } finally { await app.close() }
  })
})
