import type { FastifyInstance } from 'fastify'

/**
 * Sentry for the API (rebuild plan, Phase 7).
 *
 * Initialised **only when `SENTRY_DSN` is set** — without a DSN this plugin is a complete
 * no-op: no import side effects, no event capture. The `@sentry/node` module is imported
 * lazily *after* the DSN check precisely so the no-op path has zero cost and a mis-shapen DSN
 * can never crash the boot sequence.
 *
 * When configured, the server uses the same DSN as the web client, so a browser error and the
 * server-side 5xx that caused it land in one project. Every captured event carries the
 * `x-request-id` (the correlation id) so a report can be matched to the server's `reqId` log
 * line.
 */
export interface SentryPluginOptions {
  /** Passed straight to `Sentry.init` as `environment` (development/production/…). */
  environment?: string
}

export async function sentryPlugin(app: FastifyInstance, options: SentryPluginOptions = {}): Promise<void> {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return

  // Dynamic import keeps the module graph clean when Sentry is not configured.
  const Sentry = await import('@sentry/node')

  Sentry.init({
    dsn,
    environment: options.environment ?? process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
  })

  // Report unexpected 5xx that the error handler already returned to the client. The error
  // handler logs it; Sentry gets it too so it is visible even where log shipping is not set up.
  app.addHook('onResponse', (request, reply, done) => {
    if (reply.statusCode >= 500) {
      Sentry.captureException(new Error(`Unhandled ${reply.statusCode} on ${request.method} ${request.url}`), {
        extra: {
          requestId: request.id,
          method: request.method,
          url: request.url,
          statusCode: reply.statusCode,
        },
      })
    }
    done()
  })
}
