import { describe, expect, it } from 'vitest'
import { dispatchToBetterAuth } from '../src/plugins/betterAuth.js'

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
