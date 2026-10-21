import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import type { Auth } from '../src/auth.js'
import {
  closeStreamsForTenant,
  closeStreamsForUser,
  getSseStats,
  MAX_STREAMS_PER_USER,
  ssePlugin,
} from '../src/plugins/sse.js'

describe('Finding 22: SSE Connection Bounds & Revocation', () => {
  it('enforces connection limit per user with 429 and terminates on user revocation', async () => {
    const app = Fastify()
    app.decorate('auth', {
      api: {
        getSession: async () => ({
          session: { activeOrganizationId: 'tenant_test_sse' },
          user: { id: 'user_bounded_1' },
        }),
      },
    } as unknown as Auth)
    app.decorate('prisma', {
      member: { findUnique: async () => ({ role: 'MEMBER' }) },
    } as unknown as PrismaClient)
    await app.register(ssePlugin)

    const address = await app.listen({ port: 0, host: '127.0.0.1' })
    const controllers: AbortController[] = []

    try {
      // Open maximum allowed connections for user
      for (let i = 0; i < MAX_STREAMS_PER_USER; i++) {
        const controller = new AbortController()
        controllers.push(controller)
        const res = await fetch(`${address}/events`, { signal: controller.signal })
        expect(res.status).toBe(200)
      }

      // Next connection attempt must be rejected with 429 Too Many Requests
      const rejectedRes = await fetch(`${address}/events`)
      expect(rejectedRes.status).toBe(429)
      const errorJson = (await rejectedRes.json()) as { error: { message: string } }
      expect(errorJson.error.message).toContain('Too many live event streams for this user')

      // Terminate streams for user on revocation / logout
      const closedCount = closeStreamsForUser('user_bounded_1')
      expect(closedCount).toBe(MAX_STREAMS_PER_USER)

      // Connection count should now be 0 for this user
      const stats = getSseStats()
      expect(stats.userCounts['user_bounded_1'] ?? 0).toBe(0)
    } finally {
      controllers.forEach(c => c.abort())
      await app.close()
    }
  })

  it('terminates all open streams for tenant on workspace archival or purge', async () => {
    const app = Fastify()
    app.decorate('auth', {
      api: {
        getSession: async () => ({
          session: { activeOrganizationId: 'tenant_to_archive' },
          user: { id: 'user_t1' },
        }),
      },
    } as unknown as Auth)
    app.decorate('prisma', {
      member: { findUnique: async () => ({ role: 'MEMBER' }) },
    } as unknown as PrismaClient)
    await app.register(ssePlugin)

    const address = await app.listen({ port: 0, host: '127.0.0.1' })
    const controller = new AbortController()

    try {
      const res = await fetch(`${address}/events`, { signal: controller.signal })
      expect(res.status).toBe(200)

      const closed = closeStreamsForTenant('tenant_to_archive')
      expect(closed).toBe(1)

      const stats = getSseStats()
      expect(stats.tenantCounts['tenant_to_archive'] ?? 0).toBe(0)
    } finally {
      controller.abort()
      await app.close()
    }
  })
})

