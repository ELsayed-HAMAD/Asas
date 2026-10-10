import Fastify from 'fastify'
import cors from '@fastify/cors'
import type { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import type { Auth } from '../src/auth.js'
import { ssePlugin } from '../src/plugins/sse.js'

describe('authenticated cross-origin SSE', () => {
  it('preserves credentialed CORS headers on hijacked streams and shuts them down cleanly', async () => {
    const app = Fastify()
    await app.register(cors, { origin: 'http://localhost:5173', credentials: true })
    app.decorate('auth', { api: { getSession: async () => ({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } }) } } as unknown as Auth)
    app.decorate('prisma', { member: { findUnique: async () => ({ role: 'MEMBER' }) } } as unknown as PrismaClient)
    await app.register(ssePlugin)
    const controller = new AbortController()
    try {
      const address = await app.listen({ port: 0, host: '127.0.0.1' })
      const response = await fetch(`${address}/events`, { headers: { origin: 'http://localhost:5173' }, signal: controller.signal })
      expect(response.status).toBe(200)
      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
      expect(response.headers.get('access-control-allow-credentials')).toBe('true')
      expect(response.headers.get('content-type')).toBe('text/event-stream')
      // Close while a stream is still open: preClose must end it, not hang waiting for it.
      await app.close()
    } finally {
      controller.abort()
      await app.close()
    }
  })
})
