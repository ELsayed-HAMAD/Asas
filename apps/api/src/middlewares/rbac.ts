import type { PrismaClient, UserRole } from '@prisma/client'
import { fromNodeHeaders } from 'better-auth/node'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Auth } from '../auth.js'

export interface AuthContext {
  userId: string
  tenantId: string
  role: UserRole
  employeeId: string | null
}

declare module 'fastify' {
  interface FastifyRequest {
    authContext?: AuthContext
  }
}

const ROLE_RANK: Record<UserRole, number> = {
  MEMBER: 0,
  ADMIN: 1,
  OWNER: 2,
}

/**
 * Short-lived cache of resolved auth contexts, keyed by raw session token. Every guarded
 * request otherwise pays for `getSession()` plus one or two `Member` lookups (REVIEW.md
 * finding F4); a 30 s TTL cuts that to one resolution per token per half-minute.
 *
 * Only successful resolutions are cached: a `null` (no session, no membership) is cheap to
 * produce and must never stick around, so sign-out takes effect immediately. The accepted
 * staleness window also covers role changes and organization switches — both become visible
 * within the TTL. The cache is process-local by design; replicas do not share it, and a
 * per-replica miss costs exactly what every request cost before this existed.
 */
const AUTH_CONTEXT_TTL_MS = 5_000
const AUTH_CONTEXT_CACHE_MAX = 1_000
const authContextCache = new Map<string, { context: AuthContext; expiresAt: number }>()

/** Test seam: drop every cached resolution so a suite starts from a cold cache. */
export function clearAuthContextCache(): void {
  authContextCache.clear()
}

/** Invalidate cached auth context for an explicit session token. */
export function invalidateAuthCacheForToken(sessionToken: string): void {
  authContextCache.delete(sessionToken)
}

/** Invalidate cached auth contexts for a specific user across all tokens. */
export function invalidateAuthCacheForUser(userId: string): void {
  for (const [key, val] of authContextCache.entries()) {
    if (val.context.userId === userId) authContextCache.delete(key)
  }
}

/** Invalidate cached auth contexts for a specific tenant across all sessions. */
export function invalidateAuthCacheForTenant(tenantId: string): void {
  for (const [key, val] of authContextCache.entries()) {
    if (val.context.tenantId === tenantId) authContextCache.delete(key)
  }
}

/** Extract better-auth's session token from the request's `cookie` header, matching standard and __Secure- prefixes. */
export function sessionTokenFromHeaders(headers: FastifyRequest['headers']): string | null {
  const cookie = headers.cookie
  if (typeof cookie !== 'string') return null
  const match = cookie.match(/(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=([^;]+)/)
  return match?.[1] ?? null
}

/**
 * Pure role comparison, kept separate from session/database lookups so it is testable without
 * either. `role` is currently signed into nothing and checked nowhere in the legacy API (see
 * the rebuild plan, Phase 1 \u00a75) \u2014 this is the one place that decision is made in the new stack.
 */
export function hasRequiredRole(actual: UserRole, minimum: UserRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[minimum]
}

/**
 * Resolves a request's session into tenant/role context.
 *
 * Returns `null` when there is no session, the session has no active organization (workspace
 * picker not yet resolved), or \u2014 should never happen once onboarding always creates one \u2014 the
 * user has no `Member` row for that tenant. Callers treat `null` as "not authenticated" rather
 * than distinguishing these cases, since none of them should let a request through.
 */
export async function resolveAuthContext(
  auth: Pick<Auth, 'api'>,
  prisma: PrismaClient,
  headers: FastifyRequest['headers'],
): Promise<AuthContext | null> {
  const sessionToken = sessionTokenFromHeaders(headers)
  if (sessionToken) {
    const cached = authContextCache.get(sessionToken)
    if (cached && cached.expiresAt > Date.now()) return cached.context
    authContextCache.delete(sessionToken)
  }
  const sessionData = await auth.api.getSession({ headers: fromNodeHeaders(headers) })
  if (!sessionData) return null
  const session = sessionData.session as (typeof sessionData.session & {
    activeOrganizationId?: string | null
  })
  let tenantId = session?.activeOrganizationId
  if (!tenantId) {
    const members = await prisma.member.findMany({ where: { userId: sessionData.user.id } })
    // Convenience fallback only when it is unambiguous: exactly one membership. When the user
    // belongs to two or more workspaces but has no active organization, we cannot know which
    // tenant this request targets, so refuse (return null → 401) instead of guessing — the
    // client must resolve the workspace picker first. (REVIEW.md finding F4.)
    if (members.length === 1) {
      tenantId = members[0]?.tenantId
    }
  }
  if (!tenantId) return null

  const member = await prisma.member.findUnique({
    where: { tenantId_userId: { tenantId, userId: sessionData.user.id } },
  })
  if (!member) return null

  const context: AuthContext = {
    userId: sessionData.user.id,
    tenantId,
    role: member.role,
    employeeId: member.employeeId,
  }
  if (sessionToken) {
    // A hard size cap with a full clear keeps the map bounded without an LRU dependency;
    // an evicted entry simply costs one fresh resolution.
    if (authContextCache.size >= AUTH_CONTEXT_CACHE_MAX) authContextCache.clear()
    authContextCache.set(sessionToken, { context, expiresAt: Date.now() + AUTH_CONTEXT_TTL_MS })
  }
  return context
}

/**
 * Reads `request.authContext` back out after a `requireRole`/`requirePermission` preHandler
 * has run. Throwing instead of a non-null assertion means a route that forgets to register
 * the guard fails loudly (500, logged) rather than silently reading `undefined` fields.
 */
export function requireAuthContext(request: FastifyRequest): AuthContext {
  if (!request.authContext) {
    throw new Error('requireAuthContext() called without a requireRole/requirePermission preHandler on this route')
  }
  return request.authContext
}

/**
 * Fastify preHandler factory. 401s with no valid session, 403s below `minimum`, otherwise
 * attaches `request.authContext` for the route handler to read `tenantId`/`employeeId` from.
 *
 * Register once per route (or per-plugin via `onRequest`/`preHandler` at the prefix level) \u2014
 * this is deliberately the single place tenant/role gating happens, per the plan's "one
 * declarative permission map / one preHandler" decision.
 */
export function requireRole(minimum: UserRole) {
  return async function roleGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const context = await resolveAuthContext(request.server.auth, request.server.prisma, request.headers)
    if (!context) {
      await reply.code(401).send({ error: { message: 'Authentication required' } })
      return
    }
    if (!hasRequiredRole(context.role, minimum)) {
      await reply.code(403).send({ error: { message: 'Insufficient role for this action' } })
      return
    }
    request.authContext = context
  }
}
