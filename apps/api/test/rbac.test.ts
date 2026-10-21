import type { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Auth } from '../src/auth.js'
import {
  clearAuthContextCache,
  hasRequiredRole,
  invalidateAuthCacheForTenant,
  invalidateAuthCacheForToken,
  invalidateAuthCacheForUser,
  resolveAuthContext,
  sessionTokenFromHeaders,
} from '../src/middlewares/rbac.js'

describe('hasRequiredRole', () => {
  it('orders roles MEMBER < ADMIN < OWNER', () => {
    expect(hasRequiredRole('MEMBER', 'ADMIN')).toBe(false)
    expect(hasRequiredRole('ADMIN', 'OWNER')).toBe(false)
    expect(hasRequiredRole('MEMBER', 'OWNER')).toBe(false)
  })

  it('lets a role satisfy its own minimum', () => {
    expect(hasRequiredRole('MEMBER', 'MEMBER')).toBe(true)
    expect(hasRequiredRole('ADMIN', 'ADMIN')).toBe(true)
    expect(hasRequiredRole('OWNER', 'OWNER')).toBe(true)
  })

  it('lets a higher role satisfy a lower minimum', () => {
    expect(hasRequiredRole('OWNER', 'MEMBER')).toBe(true)
    expect(hasRequiredRole('OWNER', 'ADMIN')).toBe(true)
    expect(hasRequiredRole('ADMIN', 'MEMBER')).toBe(true)
  })
})

function stubAuth(sessionData: { session: { activeOrganizationId: string | null }; user: { id: string } } | null) {
  return {
    api: {
      getSession: async () => sessionData,
    },
  } as unknown as Pick<Auth, 'api'>
}

function stubPrisma(member: { role: 'OWNER' | 'ADMIN' | 'MEMBER'; employeeId: string | null } | null) {
  return {
    member: {
      findUnique: async () => member,
      findMany: async () => (member ? [{ tenantId: 'tenant_1', ...member }] : []),
    },
  } as unknown as PrismaClient
}

describe('resolveAuthContext', () => {
  beforeEach(() => {
    clearAuthContextCache()
  })

  it('returns null when there is no session', async () => {
    const context = await resolveAuthContext(stubAuth(null), stubPrisma(null), {})
    expect(context).toBeNull()
  })

  it('returns null when the session has no active organization', async () => {
    const auth = stubAuth({ session: { activeOrganizationId: null }, user: { id: 'user_1' } })
    const context = await resolveAuthContext(auth, stubPrisma(null), {})
    expect(context).toBeNull()
  })

  it('returns null when the user has no membership in the active tenant', async () => {
    const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } })
    const context = await resolveAuthContext(auth, stubPrisma(null), {})
    expect(context).toBeNull()
  })

  it('refuses to guess a tenant when the user has multiple memberships and no active organization', async () => {
    const auth = stubAuth({ session: { activeOrganizationId: null }, user: { id: 'user_1' } })
    const prisma = {
      member: {
        findUnique: async () => ({ role: 'MEMBER', employeeId: null }),
        findMany: async () => [
          { tenantId: 'tenant_1', role: 'MEMBER', employeeId: null },
          { tenantId: 'tenant_2', role: 'MEMBER', employeeId: null },
        ],
      },
    } as unknown as PrismaClient
    const context = await resolveAuthContext(auth, prisma, {})
    expect(context).toBeNull()
  })

  it('falls back to the sole membership when there is no active organization', async () => {
    const auth = stubAuth({ session: { activeOrganizationId: null }, user: { id: 'user_1' } })
    const prisma = stubPrisma({ role: 'MEMBER', employeeId: null })
    const context = await resolveAuthContext(auth, prisma, {})
    expect(context).toEqual({ userId: 'user_1', tenantId: 'tenant_1', role: 'MEMBER', employeeId: null })
  })

  it('refuses to guess a tenant when the user has multiple memberships and no active organization', async () => {
    const auth = stubAuth({ session: { activeOrganizationId: null }, user: { id: 'user_1' } })
    const prisma = {
      member: {
        findUnique: async () => ({ role: 'MEMBER', employeeId: null }),
        findMany: async () => [
          { tenantId: 'tenant_1', role: 'MEMBER', employeeId: null },
          { tenantId: 'tenant_2', role: 'MEMBER', employeeId: null },
        ],
      },
    } as unknown as PrismaClient
    const context = await resolveAuthContext(auth, prisma, {})
    expect(context).toBeNull()
  })

  it('falls back to the sole membership when there is no active organization', async () => {
    const auth = stubAuth({ session: { activeOrganizationId: null }, user: { id: 'user_1' } })
    const prisma = stubPrisma({ role: 'MEMBER', employeeId: null })
    const context = await resolveAuthContext(auth, prisma, {})
    expect(context).toEqual({ userId: 'user_1', tenantId: 'tenant_1', role: 'MEMBER', employeeId: null })
  })

  it('resolves tenant, role, and employeeId once session and membership agree', async () => {
    const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } })
    const prisma = stubPrisma({ role: 'ADMIN', employeeId: 'emp_1' })
    const context = await resolveAuthContext(auth, prisma, {})
    expect(context).toEqual({ userId: 'user_1', tenantId: 'tenant_1', role: 'ADMIN', employeeId: 'emp_1' })
  })

  it('caches a resolved context by session token so subsequent calls skip the DB', async () => {
    let getSessionCalls = 0
    const auth = {
      api: {
        getSession: async () => {
          getSessionCalls += 1
          return { session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } }
        },
      },
    } as unknown as Pick<Auth, 'api'>
    let memberLookupCalls = 0
    const prisma = {
      member: {
        findUnique: async () => { memberLookupCalls += 1; return { role: 'ADMIN', employeeId: 'emp_1' } },
        findMany: async () => [{ tenantId: 'tenant_1', role: 'ADMIN', employeeId: 'emp_1' }],
      },
    } as unknown as PrismaClient
    const headers = { cookie: 'better-auth.session_token=cached_test_token' }

    const first = await resolveAuthContext(auth, prisma, headers)
    expect(first).toEqual({ userId: 'user_1', tenantId: 'tenant_1', role: 'ADMIN', employeeId: 'emp_1' })
    expect(getSessionCalls).toBe(1)
    expect(memberLookupCalls).toBe(1)

    const second = await resolveAuthContext(auth, prisma, headers)
    expect(second).toEqual(first)
    // The second call is served entirely from cache.
    expect(getSessionCalls).toBe(1)
    expect(memberLookupCalls).toBe(1)
  })

  it('does not cache a null resolution (no session / no membership)', async () => {
    let getSessionCalls = 0
    const auth = {
      api: {
        getSession: async () => { getSessionCalls += 1; return null },
      },
    } as unknown as Pick<Auth, 'api'>
    const prisma = stubPrisma(null)
    const headers = { cookie: 'better-auth.session_token=absent_session_token' }

    await resolveAuthContext(auth, prisma, headers)
    await resolveAuthContext(auth, prisma, headers)
    // Both calls hit getSession because null is never cached.
    expect(getSessionCalls).toBe(2)
  })

  it('does not use the cache when no session cookie is present', async () => {
    let getSessionCalls = 0
    const auth = {
      api: {
        getSession: async () => {
          getSessionCalls += 1
          return { session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } }
        },
      },
    } as unknown as Pick<Auth, 'api'>
    const prisma = stubPrisma({ role: 'MEMBER', employeeId: null })

    await resolveAuthContext(auth, prisma, {})
    await resolveAuthContext(auth, prisma, {})
    // Without a cookie header there is no cache key, so each call resolves fresh.
    expect(getSessionCalls).toBe(2)
  })

  it('correctly extracts session tokens with and without __Secure- prefix', () => {
    expect(sessionTokenFromHeaders({})).toBeNull()
    expect(sessionTokenFromHeaders({ cookie: 'foo=bar' })).toBeNull()
    expect(sessionTokenFromHeaders({ cookie: 'better-auth.session_token=token_standard_123' })).toBe('token_standard_123')
    expect(sessionTokenFromHeaders({ cookie: '__Secure-better-auth.session_token=token_secure_456' })).toBe('token_secure_456')
    expect(sessionTokenFromHeaders({ cookie: 'foo=bar; __Secure-better-auth.session_token=token_combo_789; other=1' })).toBe('token_combo_789')
  })

  it('immediately invalidates cache by token, user, or tenant', async () => {
    let getSessionCalls = 0
    const auth = {
      api: {
        getSession: async () => {
          getSessionCalls += 1
          return { session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } }
        },
      },
    } as unknown as Pick<Auth, 'api'>
    const prisma = stubPrisma({ role: 'ADMIN', employeeId: 'emp_1' })
    const headers = { cookie: '__Secure-better-auth.session_token=secure_tok_1' }

    await resolveAuthContext(auth, prisma, headers)
    expect(getSessionCalls).toBe(1)

    // Second call is cached
    await resolveAuthContext(auth, prisma, headers)
    expect(getSessionCalls).toBe(1)

    // Invalidate by token
    invalidateAuthCacheForToken('secure_tok_1')
    await resolveAuthContext(auth, prisma, headers)
    expect(getSessionCalls).toBe(2)

    // Invalidate by user
    invalidateAuthCacheForUser('user_1')
    await resolveAuthContext(auth, prisma, headers)
    expect(getSessionCalls).toBe(3)

    // Invalidate by tenant
    invalidateAuthCacheForTenant('tenant_1')
    await resolveAuthContext(auth, prisma, headers)
    expect(getSessionCalls).toBe(4)
  })
})
