import type { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import type { Auth } from '../src/auth.js'
import { hasRequiredRole, resolveAuthContext } from '../src/middlewares/rbac.js'

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

  it('resolves tenant, role, and employeeId once session and membership agree', async () => {
    const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } })
    const prisma = stubPrisma({ role: 'ADMIN', employeeId: 'emp_1' })
    const context = await resolveAuthContext(auth, prisma, {})
    expect(context).toEqual({ userId: 'user_1', tenantId: 'tenant_1', role: 'ADMIN', employeeId: 'emp_1' })
  })
})
