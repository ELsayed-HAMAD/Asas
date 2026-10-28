import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { fromNodeHeaders } from 'better-auth/node'
import {
  envelope,
  errorResponses,
  platformIdParamSchema,
  platformAuditListQuerySchema,
  platformAuditListResponseSchema,
  platformBillingResponseSchema,
  platformFlagsSchema,
  platformFlagKeySchema,
  platformHealthSchema,
  platformMeSchema,
  platformOverviewSchema,
  platformPublicConfigSchema,
  platformStepUpResponseSchema,
  platformStepUpSchema,
  platformUserDetailSchema,
  platformUserListQuerySchema,
  platformUserListResponseSchema,
  platformWorkspaceDetailSchema,
  platformWorkspaceListQuerySchema,
  platformWorkspaceListResponseSchema,
  platformWorkspacePlanUpdateSchema,
  platformWorkspaceStatusUpdateSchema,
} from '@asas/contracts'
import { z } from 'zod'
import type { AsasEnv } from '../../config/env.js'
import {
  loadPlatformIdentity,
  requirePlatformAdmin,
  requirePlatformContext,
  requirePlatformIdentity,
} from './platform.middleware.js'
import { recordPlatformAudit } from './platform.service.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import { getPlatformFlags, setPlatformFlag, type PlatformFlagKey } from './platformSettings.js'
import {
  compWorkspacePlan,
  getPlatformBilling,
  getPlatformHealth,
  getPlatformOverview,
  getPlatformUserDetail,
  getPlatformWorkspaceDetail,
  listPlatformAudit,
  listPlatformUsers,
  listPlatformWorkspaces,
  revokeUserSessions,
  updateWorkspaceStatus,
} from './platform.service.js'

const PLATFORM_RATE_LIMIT = { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } } as const

// Mirrors Better Auth's two-factor account-lockout defaults. The plugin only enforces the
// lockout during a sign-in challenge, so the step-up endpoint keeps its own budget.
const STEP_UP_MAX_FAILURES = 10
const STEP_UP_LOCKOUT_MS = 15 * 60 * 1000

function isUnauthorizedError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    (error as { status?: unknown }).status === 'UNAUTHORIZED',
  )
}

function actorDetails(request: Parameters<typeof requirePlatformContext>[0]) {
  return {
    userId: request.platformAdmin!.userId,
    ipAddress: request.ip || null,
    userAgent: request.headers['user-agent'] ?? null,
  }
}

export async function platformRoutes(app: FastifyInstance, options: { env: AsasEnv }): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>()
  const env = options.env
  const guard = requirePlatformAdmin(env, 'ADMIN')
  const identityGuard = requirePlatformIdentity(env, 'ADMIN')

  server.get('/public-config', {
    schema: { response: { 200: envelope(platformPublicConfigSchema), ...errorResponses } },
    ...PLATFORM_RATE_LIMIT,
  }, async () => {
    const flags = await getPlatformFlags(app.prisma)
    return {
      data: {
        maintenanceMode: flags.maintenanceMode,
        signupsEnabled: flags.signupsEnabled,
        exportsEnabled: flags.exportsEnabled,
      },
    }
  })

  server.get('/me', {
    schema: { response: { 200: envelope(platformMeSchema), ...errorResponses } },
    ...PLATFORM_RATE_LIMIT,
  }, async (request, reply) => {
    const identity = await loadPlatformIdentity(
      request.server.auth,
      request.server.prisma,
      env,
      request.headers,
    )
    if (identity.status === 'unauthenticated') {
      reply.code(401)
      return { error: { message: 'Authentication required' } }
    }
    if (identity.status === 'forbidden') {
      reply.code(403)
      return { error: { message: 'Platform access is not available for this account' } }
    }

    const context = identity.context
    return {
      data: {
        userId: context.userId,
        name: context.name,
        email: context.email,
        platformRole: context.platformRole,
        twoFactorEnabled: context.twoFactorEnabled,
        twoFactorVerified: context.twoFactorVerified,
        requiresTwoFactor: env.platformRequire2fa && !context.twoFactorEnabled,
        requiresTwoFactorVerification:
          env.platformRequire2fa && context.twoFactorEnabled && !context.twoFactorVerified,
        nodeEnv: env.nodeEnv,
        isProduction: env.isProduction,
      },
    }
  })

  /**
   * Complete a second factor for a session that was created without one (OAuth, trusted
   * device, or a session that predates the marker). This route cannot sit behind the 2FA
   * guard, otherwise it would be impossible to satisfy it. It is still protected by the
   * platform role check, a strict rate limit, and the two-factor account lockout below.
   */
  server.post('/step-up', {
    preHandler: identityGuard,
    schema: {
      body: platformStepUpSchema,
      response: { 200: envelope(platformStepUpResponseSchema), ...errorResponses },
    },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const actor = requirePlatformContext(request)
    if (!actor.sessionId) {
      reply.code(409)
      return {
        error: {
          message: 'The current session is no longer available. Sign in again.',
          details: { code: 'PLATFORM_SESSION_UNAVAILABLE' },
        },
      }
    }
    if (!actor.twoFactorEnabled) {
      reply.code(400)
      return {
        error: {
          message: 'Enable two-factor authentication before using the platform console',
          details: { code: 'PLATFORM_2FA_ENROLL_REQUIRED' },
        },
      }
    }
    if (actor.twoFactorVerified) {
      return {
        data: {
          verified: true as const,
          verifiedAt: (actor.twoFactorVerifiedAt ?? new Date()).toISOString(),
        },
      }
    }

    const twoFactor = await request.server.prisma.twoFactor.findFirst({
      where: { userId: actor.userId },
      select: { id: true, verified: true, failedVerificationCount: true, lockedUntil: true },
    })
    // A missing or unverified row means the account has not finished TOTP enrollment, even
    // if `twoFactorEnabled` is already set on the user. There is no code that can succeed.
    if (!twoFactor || !twoFactor.verified) {
      reply.code(400)
      return {
        error: {
          message: 'Finish two-factor authentication setup before using the platform console',
          details: { code: 'PLATFORM_2FA_ENROLL_REQUIRED' },
        },
      }
    }
    if (twoFactor.lockedUntil && twoFactor.lockedUntil.getTime() > Date.now()) {
      const retryAfterSeconds = Math.ceil((twoFactor.lockedUntil.getTime() - Date.now()) / 1000)
      reply.code(429).header('retry-after', String(retryAfterSeconds))
      return {
        error: {
          message: 'Too many failed verification attempts. Try again later.',
          details: { code: 'PLATFORM_2FA_LOCKED', retryAfterSeconds },
        },
      }
    }
    // Mirror Better Auth's lazy lock cleanup: an expired lock restores the full budget.
    if (twoFactor.lockedUntil) {
      await request.server.prisma.twoFactor.update({
        where: { id: twoFactor.id },
        data: { failedVerificationCount: 0, lockedUntil: null },
      })
    }

    try {
      if (request.body.method === 'totp') {
        await request.server.auth.api.verifyTOTP({
          body: { code: request.body.code },
          headers: fromNodeHeaders(request.headers),
        })
      } else {
        await request.server.auth.api.verifyBackupCode({
          body: { code: request.body.code },
          headers: fromNodeHeaders(request.headers),
        })
      }
    } catch (error) {
      if (!isUnauthorizedError(error)) throw error

      const attempt = await request.server.prisma.twoFactor.update({
        where: { id: twoFactor.id },
        data: { failedVerificationCount: { increment: 1 } },
        select: { failedVerificationCount: true },
      })
      if (attempt.failedVerificationCount >= STEP_UP_MAX_FAILURES) {
        const lockedUntil = new Date(Date.now() + STEP_UP_LOCKOUT_MS)
        await request.server.prisma.twoFactor.update({
          where: { id: twoFactor.id },
          data: { lockedUntil },
        })
        reply.code(429).header('retry-after', String(Math.ceil(STEP_UP_LOCKOUT_MS / 1000)))
        return {
          error: {
            message: 'Too many failed verification attempts. Try again later.',
            details: {
              code: 'PLATFORM_2FA_LOCKED',
              retryAfterSeconds: Math.ceil(STEP_UP_LOCKOUT_MS / 1000),
            },
          },
        }
      }

      reply.code(401)
      return {
        error: {
          message: 'That verification code could not be accepted',
          details: {
            code: 'PLATFORM_2FA_INVALID_CODE',
            attemptsRemaining: STEP_UP_MAX_FAILURES - attempt.failedVerificationCount,
          },
        },
      }
    }

    const verifiedAt = new Date()
    const updated = await request.server.prisma.session.updateMany({
      where: { id: actor.sessionId, userId: actor.userId },
      data: { twoFactorVerifiedAt: verifiedAt },
    })
    if (updated.count !== 1) {
      reply.code(409)
      return {
        error: {
          message: 'The current session is no longer available. Sign in again.',
          details: { code: 'PLATFORM_SESSION_UNAVAILABLE' },
        },
      }
    }

    await request.server.prisma.twoFactor.update({
      where: { id: twoFactor.id },
      data: { failedVerificationCount: 0, lockedUntil: null },
    })
    await recordPlatformAudit(request.server.prisma, {
      actorId: actor.userId,
      action: 'platform.step-up',
      targetType: 'Session',
      targetId: actor.sessionId,
      metadata: { method: request.body.method },
      ipAddress: request.ip || null,
      userAgent: request.headers['user-agent'] ?? null,
    })

    return { data: { verified: true as const, verifiedAt: verifiedAt.toISOString() } }
  })

  server.get('/overview', {
    preHandler: guard,
    schema: { response: { 200: envelope(platformOverviewSchema), ...errorResponses } },
    ...PLATFORM_RATE_LIMIT,
  }, async () => {
    return { data: await getPlatformOverview(app.prisma) }
  })

  server.get('/workspaces', {
    preHandler: guard,
    schema: {
      querystring: platformWorkspaceListQuerySchema,
      response: { 200: envelope(platformWorkspaceListResponseSchema), ...errorResponses },
    },
    ...PLATFORM_RATE_LIMIT,
  }, async request => {
    return { data: await listPlatformWorkspaces(app.prisma, request.query) }
  })

  server.get('/workspaces/:id', {
    preHandler: guard,
    schema: {
      params: platformIdParamSchema,
      response: { 200: envelope(platformWorkspaceDetailSchema), ...errorResponses },
    },
    ...PLATFORM_RATE_LIMIT,
  }, async request => {
    return { data: await getPlatformWorkspaceDetail(app.prisma, request.params.id, request.server.objectStorage) }
  })

  server.patch('/workspaces/:id/status', {
    preHandler: guard,
    schema: {
      params: platformIdParamSchema,
      body: platformWorkspaceStatusUpdateSchema,
      response: {
        200: envelope(z.object({
          id: z.string(),
          status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']),
          suspendedAt: z.string().nullable(),
          suspendedReason: z.string().nullable(),
        })),
        ...errorResponses,
      },
    },
    ...PLATFORM_RATE_LIMIT,
  }, async request => {
    const actor = actorDetails(request)
    return {
      data: await updateWorkspaceStatus(
        app.prisma,
        { tenantId: request.params.id, status: request.body.status, reason: request.body.reason },
        actor,
      ),
    }
  })

  server.patch('/workspaces/:id/plan', {
    preHandler: guard,
    schema: {
      params: platformIdParamSchema,
      body: platformWorkspacePlanUpdateSchema,
      response: {
        200: envelope(z.object({
          id: z.string(),
          planName: z.string(),
          priceMonthly: z.string(),
          seatLimit: z.int().min(0),
          storageLimitGb: z.number(),
        })),
        ...errorResponses,
      },
    },
    ...PLATFORM_RATE_LIMIT,
  }, async request => {
    const actor = actorDetails(request)
    const data = await compWorkspacePlan(
      app.prisma,
      { tenantId: request.params.id, planId: request.body.planId },
      actor,
    )
    app.ssePublish(request.params.id, [moduleKeyPrefix('settings')])
    return { data }
  })

  server.get('/users', {
    preHandler: guard,
    schema: {
      querystring: platformUserListQuerySchema,
      response: { 200: envelope(platformUserListResponseSchema), ...errorResponses },
    },
    ...PLATFORM_RATE_LIMIT,
  }, async request => {
    return { data: await listPlatformUsers(app.prisma, request.query) }
  })

  server.get('/users/:id', {
    preHandler: guard,
    schema: {
      params: platformIdParamSchema,
      response: { 200: envelope(platformUserDetailSchema), ...errorResponses },
    },
    ...PLATFORM_RATE_LIMIT,
  }, async request => {
    return { data: await getPlatformUserDetail(app.prisma, request.params.id) }
  })

  server.post('/users/:id/revoke-sessions', {
    preHandler: guard,
    schema: {
      params: platformIdParamSchema,
      response: {
        200: envelope(z.object({ revoked: z.int().min(0) })),
        ...errorResponses,
      },
    },
    ...PLATFORM_RATE_LIMIT,
  }, async request => {
    const actor = actorDetails(request)
    return { data: await revokeUserSessions(app.prisma, request.params.id, actor) }
  })

  server.get('/billing', {
    preHandler: guard,
    schema: { response: { 200: envelope(platformBillingResponseSchema), ...errorResponses } },
    ...PLATFORM_RATE_LIMIT,
  }, async () => {
    return { data: await getPlatformBilling(app.prisma) }
  })

  server.get('/health', {
    preHandler: guard,
    schema: { response: { 200: envelope(platformHealthSchema), ...errorResponses } },
    ...PLATFORM_RATE_LIMIT,
  }, async () => {
    return { data: await getPlatformHealth(app.prisma, env) }
  })

  server.get('/flags', {
    preHandler: guard,
    schema: { response: { 200: envelope(platformFlagsSchema), ...errorResponses } },
    ...PLATFORM_RATE_LIMIT,
  }, async () => {
    return { data: await getPlatformFlags(app.prisma) }
  })

  server.patch('/flags/:key', {
    preHandler: guard,
    schema: {
      params: z.object({ key: platformFlagKeySchema }),
      body: z.object({ enabled: z.boolean() }),
      response: { 200: envelope(platformFlagsSchema), ...errorResponses },
    },
    ...PLATFORM_RATE_LIMIT,
  }, async request => {
    const actor = requirePlatformContext(request)
    const key = request.params.key as PlatformFlagKey
    await setPlatformFlag(app.prisma, key, request.body.enabled, actor.userId)
    await recordPlatformAudit(app.prisma, {
      actorId: actor.userId,
      action: 'platform.flags.update',
      targetType: 'PlatformSetting',
      targetId: key,
      metadata: { key, enabled: request.body.enabled },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    })
    return { data: await getPlatformFlags(app.prisma) }
  })

  server.get('/audit', {
    preHandler: guard,
    schema: {
      querystring: platformAuditListQuerySchema,
      response: { 200: envelope(platformAuditListResponseSchema), ...errorResponses },
    },
    ...PLATFORM_RATE_LIMIT,
  }, async request => {
    return { data: await listPlatformAudit(app.prisma, request.query) }
  })
}
