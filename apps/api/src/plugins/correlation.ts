import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

/**
 * Request correlation (rebuild plan, Phase 7).
 *
 * Every request is addressed by one id for its whole life. The id is chosen by the app's
 * `genReqId` (see `app.ts`): it honours an inbound `x-request-id` header so an upstream proxy
 * or the client can thread its own id through, and otherwise mints a fresh UUIDv4. Fastify
 * binds that value as `reqId` on the per-request child logger, so *every* log line for the
 * request already carries it — the plugin's job is the remaining two surfaces:
 *
 *  - **the response header.** `x-request-id` is set on the way out for *every* response
 *    (success or error) so a client can log "I made request X" and match it to the server's
 *    `reqId` in the logs, or hand the value to support.
 *  - **the error body.** `errorHandler` reads the id via {@link correlationId} and includes it
 *    in `error.requestId` so a failed client call can be traced without re-opening the logs.
 */

/**
 * The id for this request, safe to read in a handler, preHandler, or the error handler. Returns
 * the id Fastify assigned (from `genReqId`); never throws.
 */
export function correlationId(request: FastifyRequest): string {
  return request.id
}

export async function correlationPlugin(app: FastifyInstance): Promise<void> {
  // `onRequest` runs before any route handler or preHandler, so the header is present even on
  // a 401/403 raised by the RBAC guard and on a 422 raised by body validation. For a hijacked
  // reply (the SSE stream) the header is set but not sent — harmless.
  app.addHook('onRequest', (request: FastifyRequest, reply: FastifyReply, done) => {
    reply.header('x-request-id', request.id)
    done()
  })
}
