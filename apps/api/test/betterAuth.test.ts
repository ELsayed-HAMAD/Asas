import { describe, expect, it } from 'vitest'
import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { loadEnv } from '../src/config/env.js'
import { betterAuthPlugin, dispatchToBetterAuth } from '../src/plugins/betterAuth.js'

/**
 * Unit-tests the Fastify\u2192Fetch bridge in isolation from better-auth itself, so it doesn't
 * need a real database: a stub `{ handler }` stands in for the better-auth instance, and the
 * assertions are about *this* code (URL/header/body reconstruction, response copy-back), not
 * about auth logic. See `plugins/betterAuth.ts` for the route that wraps this in Fastify.
 */
describe('dispatchToBetterAuth', () => {
  it('reconstructs a Fetch Request with the right URL, method, and headers', async () => {
    let received: Request | undefined
    const stubAuth = {
      handler: async (request: Request) => {
        received = request
        return new Response(null, { status: 200 })
      },
    }

    await dispatchToBetterAuth(stubAuth, {
      url: '/api/auth/get-session',
      method: 'GET',
      headers: { host: 'api.example.com', cookie: 'better-auth.session=abc' },
      body: undefined,
    })

    expect(received?.url).toBe('http://api.example.com/api/auth/get-session')
    expect(received?.method).toBe('GET')
    expect(received?.headers.get('cookie')).toBe('better-auth.session=abc')
  })

  it('serializes an already-parsed JSON body onto the Fetch Request', async () => {
    let receivedBody: unknown
    const stubAuth = {
      handler: async (request: Request) => {
        receivedBody = await request.json()
        return new Response(null, { status: 200 })
      },
    }

    await dispatchToBetterAuth(stubAuth, {
      url: '/api/auth/sign-in/email',
      method: 'POST',
      headers: { host: 'localhost:4000', 'content-type': 'application/json' },
      body: { email: 'owner@example.com', password: 'correct-horse' },
    })

    expect(receivedBody).toEqual({ email: 'owner@example.com', password: 'correct-horse' })
  })

  it('omits the body entirely for requests that had none', async () => {
    let bodyUsed: boolean | undefined
    const stubAuth = {
      handler: async (request: Request) => {
        bodyUsed = request.body !== null
        return new Response(null, { status: 200 })
      },
    }

    await dispatchToBetterAuth(stubAuth, {
      url: '/api/auth/get-session',
      method: 'GET',
      headers: { host: 'localhost:4000' },
      body: undefined,
    })

    expect(bodyUsed).toBe(false)
  })

  it('passes the handler response straight through', async () => {
    const stubAuth = {
      handler: async () => new Response(JSON.stringify({ ok: true }), { status: 201 }),
    }

    const response = await dispatchToBetterAuth(stubAuth, {
      url: '/api/auth/organization/create',
      method: 'POST',
      headers: { host: 'localhost:4000' },
      body: { name: 'Acme', slug: 'acme' },
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ ok: true })
  })
})

describe('better-auth route safeguards', () => {
  it('rejects email-dependent auth requests before dispatch when delivery is unavailable', async () => {
    const app = Fastify({ logger: false })
    await app.register(rateLimit, { global: false, max: 300, timeWindow: '1 minute' })
    app.decorate('environment', loadEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://mock:mock@localhost:5432/db',
      RESEND_API_KEY: '',
    }))
    let dispatches = 0
    await betterAuthPlugin(app, {
      handler: async () => {
        dispatches += 1
        return new Response('{}')
      },
    } as any)

    for (const url of [
      '/api/auth/sign-up/email',
      '/api/auth/request-password-reset?callbackURL=%2Fdashboard',
      '/api/auth/send-verification-email',
    ]) {
      const response = await app.inject({ method: 'POST', url, payload: { email: 'owner@example.com' } })
      expect(response.statusCode).toBe(503)
      expect(response.json().error.message).toContain('Email delivery is not configured')
    }

    expect(dispatches).toBe(0)
    await app.close()
  })

  it('rate-limits the actual password reset endpoint', async () => {
    const app = Fastify({ logger: false, trustProxy: true })
    await app.register(rateLimit, { global: false, max: 300, timeWindow: '1 minute' })
    app.decorate('environment', loadEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://mock:mock@localhost:5432/db',
      RESEND_API_KEY: 're_test_configured',
    }))
    await betterAuthPlugin(app, {
      handler: async () => new Response('{}'),
    } as any)

    const responses = []
    for (let attempt = 0; attempt < 11; attempt += 1) {
      responses.push(await app.inject({
        method: 'POST',
        url: '/api/auth/request-password-reset',
        headers: { 'x-forwarded-for': '203.0.113.71' },
        payload: { email: 'owner@example.com' },
      }))
    }

    expect(responses.slice(0, 10).every(response => response.statusCode === 200)).toBe(true)
    expect(responses[10]?.statusCode).toBe(429)
    await app.close()
  })
})
