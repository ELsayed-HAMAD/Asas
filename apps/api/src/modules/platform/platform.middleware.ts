import type { PlatformRole, PrismaClient } from '@prisma/client'
import { fromNodeHeaders } from 'better-auth/node'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Auth } from '../../auth.js'
import type { AsasEnv } from '../../config/env.js'
import { recordPlatformAudit } from './platform.service.js'

const PLATFORM_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  platformRole: true,
  twoFactorEnabled: true,
} as const

type PlatformUserRecord = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  platformRole: PlatformRole
  twoFactorEnabled: boolean
}

export interface PlatformAdminContext {
  userId: string
  email: string
  name: string
  platformRole: PlatformRole
  twoFactorEnabled: boolean
  sessionId: string | null
  twoFactorVerified: boolean
  twoFactorVerifiedAt: Date | null
}

declare module 'fastify' {
  interface FastifyRequest {
    platformAdmin?: PlatformAdminContext
  }
}

const PLATFORM_ROLE_RANK: Record<PlatformRole, number> = {
  NONE: 0,
  SUPPORT: 1,
  ADMIN: 2,
  OWNER: 3,
}

export type PlatformMinimumRole = 'SUPPORT' | 'ADMIN' | 'OWNER'

export function hasPlatformRole(actual: PlatformRole, minimum: PlatformMinimumRole): boolean {
  return PLATFORM_ROLE_RANK[actual] >= PLATFORM_ROLE_RANK[minimum]
}

/**
 * Bootstrap the first platform owner from `PLATFORM_OWNER_EMAILS`. The email must already be
 * verified, so an attacker cannot claim an allow-listed address before proving ownership.
 * The promotion is audited; a failed audit write must not lock the owner out of the console.
 */
async function promoteAllowlistedOwner(
  prisma: PrismaClient,
  env: AsasEnv,
  user: PlatformUserRecord,
): Promise<PlatformUserRecord> {
  const allowlisted =
    user.emailVerified &&
    user.platformRole === 'NONE' &&
    env.platformOwnerEmails.includes(user.email.toLowerCase())
  if (!allowlisted) return user

  const promoted = await prisma.user.update({
    where: { id: user.id },
    data: { platformRole: 'OWNER' },
    select: PLATFORM_USER_SELECT,
  })
  await recordPlatformAudit(prisma, {
    actorId: promoted.id,
    action: 'platform.owner.bootstrap',
    targetType: 'User',
    targetId: promoted.id,
    metadata: { email: promoted.email, source: 'platform.guard' },
  }).catch(() => undefined)
  return promoted
}

export type PlatformIdentity =
  | { status: 'unauthenticated' }
  | { status: 'forbidden' }
  | { status: 'ok'; context: PlatformAdminContext }

/**
 * Resolve a session into a platform-operator context. This deliberately does not require a
 * workspace membership or an active organization: the platform owner may not belong to any
 * tenant. It also does not set a tenant scope, so callers must use the platform service's
 * audited cross-tenant transaction helper for tenant-owned tables.
 *
 * The context carries the session-level second-factor marker, but does not enforce it. Routes
 * that can wait for a step-up use `requirePlatformIdentity`; everything else uses
 * `requirePlatformAdmin`, which rejects an unmarked session when `PLATFORM_REQUIRE_2FA` is on.
 */
export async function loadPlatformIdentity(
  auth: Pick<Auth, 'api'>,
  prisma: PrismaClient,
  env: AsasEnv,
  headers: FastifyRequest['headers'],
): Promise<PlatformIdentity> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) })
  if (!session?.user?.id) return { status: 'unauthenticated' }

  const found = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: PLATFORM_USER_SELECT,
  })
  if (!found) return { status: 'unauthenticated' }

  const user = await promoteAllowlistedOwner(prisma, env, found)
  if (user.platformRole === 'NONE') return { status: 'forbidden' }

  const sessionId = session.session?.id ?? null
  const marker = sessionId
    ? await prisma.session.findUnique({
        where: { id: sessionId },
        select: { twoFactorVerifiedAt: true },
      })
    : null

  return {
    status: 'ok',
    context: {
      userId: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.platformRole,
      twoFactorEnabled: user.twoFactorEnabled,
      sessionId,
      twoFactorVerified: Boolean(marker?.twoFactorVerifiedAt),
      twoFactorVerifiedAt: marker?.twoFactorVerifiedAt ?? null,
    },
  }
}

/** Resolve a context without distinguishing "no session" from "no platform role". */
export async function resolvePlatformAdmin(
  auth: Pick<Auth, 'api'>,
  prisma: PrismaClient,
  env: AsasEnv,
  headers: FastifyRequest['headers'],
): Promise<PlatformAdminContext | null> {
  const identity = await loadPlatformIdentity(auth, prisma, env, headers)
  return identity.status === 'ok' ? identity.context : null
}

/**
 * Guard that verifies the session and the minimum platform role, but not the second factor.
 * Only the step-up endpoint should use this; it needs to run before the session is marked.
 */
export function requirePlatformIdentity(env: AsasEnv, minimum: PlatformMinimumRole = 'ADMIN') {
  return async function platformIdentityGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const identity = await loadPlatformIdentity(
      request.server.auth,
      request.server.prisma,
      env,
      request.headers,
    )

    if (identity.status === 'unauthenticated') {
      await reply.code(401).send({ error: { message: 'Authentication required' } })
      return
    }
    if (identity.status === 'forbidden') {
      await reply.code(403).send({ error: { message: 'Platform access is not available for this account' } })
      return
    }

    const { context } = identity
    if (!hasPlatformRole(context.platformRole, minimum)) {
      await reply.code(403).send({ error: { message: `Requires the platform ${minimum} role or higher` } })
      return
    }

    request.platformAdmin = context
  }
}

/**
 * Guard for every `/api/v1/platform` route. Returns 401 for no session, 403 for a normal
 * workspace user, and a distinct 2FA code when enforcement is enabled. `reason: 'ENROLL'`
 * means the account has no second factor yet; `reason: 'VERIFY'` means it has one but this
 * session has not completed a challenge (OAuth, trusted-device, or a pre-migration session).
 */
export function requirePlatformAdmin(env: AsasEnv, minimum: PlatformMinimumRole = 'ADMIN') {
  const identityGuard = requirePlatformIdentity(env, minimum)

  return async function platformGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await identityGuard(request, reply)
    const context = request.platformAdmin
    if (!context) return

    if (env.platformRequire2fa) {
      if (!context.twoFactorEnabled) {
        await reply.code(403).send({
          error: {
            message: 'Enable two-factor authentication before using the platform console',
            details: { code: 'PLATFORM_2FA_REQUIRED', reason: 'ENROLL' },
          },
        })
        return
      }
      if (!context.twoFactorVerified) {
        await reply.code(403).send({
          error: {
            message: 'Verify your second factor to continue to the platform console',
            details: { code: 'PLATFORM_2FA_REQUIRED', reason: 'VERIFY' },
          },
        })
        return
      }
    }
  }
}

export function requirePlatformContext(request: FastifyRequest): PlatformAdminContext {
  if (!request.platformAdmin) {
    throw new Error('requirePlatformContext() called without requirePlatformAdmin on this route')
  }
  return request.platformAdmin
}
