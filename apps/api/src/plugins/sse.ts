import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { requireRole } from '../middlewares/rbac.js'

/**
 * The string form of a module's query-key *prefix*, e.g. `moduleKeyPrefix('finance')` →
 * `'asas,finance'`. This must match `queryKeys[module].all().toString()` on the web side
 * (`apps/web/src/lib/queryKeys.js`), which builds `[...root, name]` with `root = ['asas']`.
 *
 * It is the unit the server publishes: a mutation that touched any finance row invalidates the
 * whole `finance` namespace in every open tab. If the web-side root or a module name ever
 * changes, this constant and the queryKeys factory must move together — they describe the same
 * key namespace from two ends of the wire.
 */
const QUERY_KEY_ROOT = 'asas'

export function moduleKeyPrefix(moduleName: string): string {
  return `${QUERY_KEY_ROOT},${moduleName}`
}

/**
 * Server-Sent Events push channel (rebuild plan, Phase 7).
 *
 * One long-lived `text/event-stream` connection per authenticated tab. A client subscribes to
 * its tenant's stream; whenever a *write mutation* succeeds on the server, the route calls
 * {@link publish} with the TanStack Query key prefixes that changed, and every connected
 * subscriber for that tenant receives a single `invalidate` event carrying those prefixes. The
 * web client (`apps/web/src/lib/sse.js`) then calls `queryClient.invalidateQueries` for each —
 * the UI self-heals after any mutation in any tab without polling.
 *
 * Event frame (SSE):
 *
 * ```
 * event: invalidate
 * data: {"type":"invalidate","keys":["asas,finance"]}
 * ```
 *
 * `keys` are the *stringified* prefixes because an SSE frame is one string; the client splits
 * them back into arrays (see `parseInvalidatePayload`). Comma is the delimiter because a
 * TanStack Query key is `[...root, name]` whose `String()` form is exactly `asas,finance`.
 */

/** A client that has opened the event stream for one tenant. */
interface Subscriber {
  tenantId: string
  send: (event: string, data: string) => void
  close: () => void
}

/** In-memory subscriber registry, keyed by tenant. */
const subscribers = new Map<string, Set<Subscriber>>()

declare module 'fastify' {
  interface FastifyInstance {
    /** The tenant's event stream is live only behind auth, so this always resolves. */
    ssePublish: (tenantId: string, keys: readonly string[]) => void
  }
}

/**
 * Publish an invalidation to every subscriber of `tenantId`. Safe to call with zero
 * subscribers (a mutation performed with no other tab open) — it is a no-op then, never an
 * error. The frame is written unbuffered so it reaches the client the instant the mutation
 * commits; `publish` never throws, so a dead socket can never break a request handler.
 */
export function publish(tenantId: string, keys: readonly string[]): void {
  const set = subscribers.get(tenantId)
  if (!set) return
  const payload = JSON.stringify({ type: 'invalidate' as const, keys: [...keys] })
  for (const subscriber of set) {
    try {
      subscriber.send('invalidate', payload)
    } catch {
      // A slow/dead socket's write errors are the close handler's problem, not the writer's.
    }
  }
}

function addSubscriber(subscriber: Subscriber): void {
  let set = subscribers.get(subscriber.tenantId)
  if (!set) {
    set = new Set()
    subscribers.set(subscriber.tenantId, set)
  }
  set.add(subscriber)
}

function removeSubscriber(subscriber: Subscriber): void {
  const set = subscribers.get(subscriber.tenantId)
  if (!set) return
  set.delete(subscriber)
  if (set.size === 0) subscribers.delete(subscriber.tenantId)
}

/**
 * Registers `GET /events`. The route carries its own `requireRole('MEMBER')` preHandler — the
 * SSE endpoint must authenticate before opening a stream — and sets the stream headers itself,
 * so Fastify's JSON serializer and the onSend hooks are bypassed via `reply.hijack()`.
 *
 * **Where it is mounted:** `app.ts` registers this plugin with `{ prefix: '/api/v1' }`, so the
 * route is `GET /api/v1/events`. The `ssePublish` decorator is added on the *root* app (in
 * `app.ts`), not here: this plugin runs in its own encapsulated context, and the module route
 * handlers (`request.server.ssePublish`) are registered as *siblings* of this one, so a
 * decorator set only inside this plugin would be invisible to them. Root is the common
 * ancestor, which is where it must live.
 */
export async function ssePlugin(app: FastifyInstance): Promise<void> {
  app.get(
    '/events',
    {
      preHandler: requireRole('MEMBER'),
      config: { rateLimit: false },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // `request.authContext` is attached by `requireRole` above; reading it here (not via
      // `requireAuthContext`) is deliberate — this handler controls the raw reply stream and
      // must never let an error bubble back through the JSON error handler.
      const tenantId = request.authContext?.tenantId
      if (!tenantId) {
        reply.code(401).send({ error: { message: 'Authentication required' } })
        return
      }

      reply.hijack()
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        // Browsers and proxies keep the stream open for its full life.
        'x-accel-buffering': 'no',
      })
      // A comment frame acknowledges the stream is up and doubles as the keepalive's first beat.
      reply.raw.write(`: connected ${new Date().toISOString()}\n\n`)

      let closed = false
      const close = () => {
        if (closed) return
        closed = true
        removeSubscriber(subscriber)
        try {
          reply.raw.end()
        } catch {
          // Socket already gone — nothing to do.
        }
      }

      const subscriber: Subscriber = {
        tenantId,
        send: (event, data) => {
          if (closed) return
          reply.raw.write(`event: ${event}\ndata: ${data}\n\n`)
        },
        close,
      }
      addSubscriber(subscriber)

      // Keepalive every 25 s so idle-connection timeouts (proxies, load balancers) do not
      // silently drop the stream; clients reconnect automatically on close.
      const keepalive = setInterval(() => {
        if (closed) return
        try {
          reply.raw.write(`: ping ${Date.now()}\n\n`)
        } catch {
          close()
        }
      }, 25_000)

      request.raw.on('close', () => {
        clearInterval(keepalive)
        close()
      })
    },
  )
}

/**
 * Parse an `invalidate` frame's payload back into `{ type, keys }`. Exported for the unit tests
 * and for any non-browser consumer; the web client has its own copy next to the fetch logic.
 */
export function parseInvalidatePayload(
  raw: string,
): { type: 'invalidate'; keys: string[] } | null {
  try {
    const parsed = JSON.parse(raw) as { type?: unknown; keys?: unknown }
    if (parsed?.type !== 'invalidate' || !Array.isArray(parsed.keys)) return null
    return { type: 'invalidate', keys: parsed.keys.filter((key): key is string => typeof key === 'string') }
  } catch {
    return null
  }
}
