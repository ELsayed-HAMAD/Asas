import { fromNodeHeaders } from 'better-auth/node'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
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
const CREDENTIAL_PATH_PATTERN = /\/api\/auth\/(sign-in|sign-up|forgot-password|reset-password)/
const CREDENTIAL_MAX = 10
const WINDOW_MS = 60_000

const credentialAttempts = new Map<string, { count: number; windowStart: number }>()

function isRateLimited(ip: string, now: number): boolean {
  const entry = credentialAttempts.get(ip)
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    credentialAttempts.set(ip, { count: 1, windowStart: now })
    return false
  }
  entry.count += 1
  return entry.count > CREDENTIAL_MAX
}

/** Prune closed windows so the map never grows unbounded — called on each credential attempt. */
function pruneWindows(now: number): void {
  if (credentialAttempts.size < 10_000) return
  for (const [ip, entry] of credentialAttempts) {
    if (now - entry.windowStart >= WINDOW_MS) credentialAttempts.delete(ip)
  }
}

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

  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.method === 'POST' && CREDENTIAL_PATH_PATTERN.test(request.url)) {
        const now = Date.now()
        pruneWindows(now)
        const ip = request.ip ?? 'unknown'
        if (isRateLimited(ip, now)) {
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
