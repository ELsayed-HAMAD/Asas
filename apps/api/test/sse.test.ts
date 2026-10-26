import Fastify from 'fastify'
import cors from '@fastify/cors'
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

describe('Server-Sent Events (SSE) Plugin', () => {
  it('preserves credentialed CORS headers on hijacked streams and shuts them down cleanly', async () => {
    const app = Fastify()
    await app.register(cors, { origin: 'http://localhost:5173', credentials: true })
    app.decorate('auth', {
      api: {
        getSession: async () => ({
          session: { activeOrganizationId: 'tenant_1' },
          user: { id: 'user_1' },
        }),
      },
    } as unknown as Auth)
    app.decorate('prisma', {
      member: { findUnique: async () => ({ role: 'MEMBER' }) },
    } as unknown as PrismaClient)
    await app.register(ssePlugin)
    const controller = new AbortController()
    try {
      const address = await app.listen({ port: 0, host: '127.0.0.1' })
      const response = await fetch(`${address}/events`, {
        headers: { origin: 'http://localhost:5173' },
        signal: controller.signal,
      })
      expect(response.status).toBe(200)
      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
      expect(response.headers.get('access-control-allow-credentials')).toBe('true')
      expect(response.headers.get('content-type')).toBe('text/event-stream')
      await app.close()
    } finally {
      controller.abort()
      await app.close()
    }
  })

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
      for (let i = 0; i < MAX_STREAMS_PER_USER; i++) {
        const controller = new AbortController()
        controllers.push(controller)
        const res = await fetch(`${address}/events`, { signal: controller.signal })
        expect(res.status).toBe(200)
      }

      const rejectedRes = await fetch(`${address}/events`)
      expect(rejectedRes.status).toBe(429)
      const errorJson = (await rejectedRes.json()) as { error: { message: string } }
      expect(errorJson.error.message).toContain('Too many live event streams for this user')

      const closedCount = closeStreamsForUser('user_bounded_1')
      expect(closedCount).toBe(MAX_STREAMS_PER_USER)

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

