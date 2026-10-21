import { fromNodeHeaders } from 'better-auth/node'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { normalizeIP } from '@fastify/rate-limit'
import type { Auth } from '../auth.js'

declare module 'fastify' {
  interface FastifyInstance {
    auth: Auth
  }
}

/**
 * Credential-stuffing guard for the better-auth catch-all.
 *
 * `@fastify/rate-limit` cannot scope rules to a wildcard sub-path (the auth surface is one
 * `app.route` handler, not one route per endpoint), so the credential endpoints get their own
 * fixed-window limiter here — 10 sign-in/sign-up/password attempts per IP per minute, 429
 * beyond that, exactly the tightening the global limiter's comment in `app.ts` promises.
 * Everything else under `/api/auth/*` (session fetches, organization calls) passes through
 * untouched and keeps riding the global 300/min ceiling.
 */
const CREDENTIAL_PATHS = new Set([
  '/api/auth/sign-in/email',
  '/api/auth/sign-up/email',
  '/api/auth/request-password-reset',
  '/api/auth/reset-password',
  '/api/auth/send-verification-email',
])
const EMAIL_DELIVERY_PATHS = new Set([
  '/api/auth/sign-up/email',
  '/api/auth/request-password-reset',
  '/api/auth/send-verification-email',
])
const CREDENTIAL_MAX = 10
const WINDOW_MS = 60_000

/**
 * Bridges Fastify to better-auth's Fetch API (`Request`/`Response`) handler.
 *
 * This is the integration documented at better-auth.com/docs/integrations/fastify: reconstruct
 * a standard `Request` from the already-parsed Fastify request, forward it to `auth.handler`,
 * then copy the resulting status/headers/body onto the Fastify reply. It relies on Fastify
 * having already parsed JSON bodies into `request.body` (true for every request this route
 * sees, since better-auth's client only ever sends JSON), so it round-trips through
 * `JSON.stringify` rather than passing a raw stream.
 */
export async function betterAuthPlugin(app: FastifyInstance, auth: Auth): Promise<void> {
  app.decorate('auth', auth)
  // Reuse the global limiter's configured store (Redis when configured) and normalized IP
  // handling, with an isolated namespace so the auth threshold is independent of the global one.
  const checkCredentialRateLimit = app.createRateLimit({
    max: CREDENTIAL_MAX,
    timeWindow: WINDOW_MS,
    keyGenerator: request => `${normalizeIP(request.ip)}:auth-credential`,
  })

  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const authPath = new URL(request.url, 'http://localhost').pathname
      if (
        request.method === 'POST'
        && EMAIL_DELIVERY_PATHS.has(authPath)
        && !request.server.environment.resendApiKey
      ) {
        await reply.code(503).send({ error: { message: 'Email delivery is not configured. Contact your workspace administrator.' } })
        return
      }
      if (request.method === 'POST' && CREDENTIAL_PATHS.has(authPath)) {
        const limit = await checkCredentialRateLimit(request)
        if (!limit.isAllowed && limit.isExceeded) {
          await reply.code(429).send({
            error: { message: 'Too many attempts. Wait a minute and try again.' },
          })
          return
        }
      }
      const response = await dispatchToBetterAuth(auth, request)
      reply.status(response.status)
      // Set-Cookie is a multi-value header. Iterating Fetch Headers with forEach can
      // coalesce multiple cookies into one comma-separated value, which browsers may
      // reject and then the client never acquires the session after a successful login.
      const setCookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie')].filter((value): value is string => Boolean(value))
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') reply.header(key, value)
      })
      if (setCookies.length > 0) reply.header('set-cookie', setCookies)
      const body = response.body ? await response.text() : null
      return reply.send(body)
    },
  })
}

/** The Fastify→Fetch bridge itself, isolated so it can be unit-tested without a real server. */
export async function dispatchToBetterAuth(
  auth: { handler: Auth['handler'] },
  request: Pick<FastifyRequest, 'url' | 'headers' | 'method' | 'body'>,
): Promise<Response> {
  const host = request.headers.host ?? 'localhost'
  const url = new URL(request.url, `http://${host}`)
  const headers = fromNodeHeaders(request.headers)
  const hasBody = request.body !== undefined && request.body !== null

  const webRequest = new Request(url, {
    method: request.method,
    headers,
    ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
  })

  return auth.handler(webRequest)
}
