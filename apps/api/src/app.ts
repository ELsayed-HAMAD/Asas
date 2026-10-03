import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import Fastify from 'fastify'
import type { LoggerOptions } from 'pino'
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { z } from 'zod'
import { type Auth, createAuth } from './auth.js'
import { loadEnv } from './config/env.js'
import { errorHandler } from './middlewares/errorHandler.js'
import { crmRoutes } from './modules/crm/crm.routes.js'
import { financeRoutes } from './modules/finance/finance.routes.js'
import { registerExportHandlers, exportRoutes } from './modules/exports/exports.routes.js'
import { candidateRoutes } from './modules/hr/candidates.routes.js'
import { hrRoutes } from './modules/hr/hr.routes.js'
import { payrollRoutes } from './modules/hr/payroll.routes.js'
import { attendanceRoutes } from './modules/hr/attendance.routes.js'
import { onboardingRoutes } from './modules/onboarding/onboarding.routes.js'
import { inventoryRoutes } from './modules/inventory/inventory.routes.js'
import { projectsRoutes } from './modules/projects/projects.routes.js'
import { settingsRoutes } from './modules/settings/settings.routes.js'
import { betterAuthPlugin } from './plugins/betterAuth.js'
import { correlationPlugin } from './plugins/correlation.js'
import { prismaPlugin } from './plugins/prisma.js'
import { sentryPlugin } from './plugins/sentry.js'
import { publish, ssePlugin } from './plugins/sse.js'
import { exportQueuePlugin } from './services/queue.js'

/**
 * The Fastify logger configuration shared by every build.
 *
 * `redact` strips secrets from every log line *before* it is serialised — a request that logs
 * its body/headers must never leak a session token or an API key into the log sink. `remove:
 * true` deletes the field entirely rather than masking it, because even a partially-redacted
 * secret (e.g. a JWT's first two segments) is more information than nothing.
 *
 * `serializers.req/rep` drop the noisy `headers` object entirely (the correlation plugin
 * re-adds only what is useful) while keeping the request identifier, path, and status — the
 * three fields a request log actually needs. `serializers.err` keeps the stack and message but
 * never the error's `headers`/`request` fields, which can echo request data.
 */
const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers.apikey',
      'req.headers.x-api-key',
      'res.headers.set-cookie',
      'req.body.password',
      'req.body.token',
      'req.body.apiKey',
      'req.headers.password',
      'req.headers.token',
      'err.password',
      'err.token',
      'err.apiKey',
      '*.password',
      '*.token',
      '*.apiKey',
      '.*authorization',
    ],
    censor: '[REDACTED]',
    remove: true,
  },
  serializers: {
    req: (req: { id?: string; method?: string; url?: string; hostname?: string }) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      hostname: req.hostname,
    }),
    res: (res: { statusCode?: number }) => ({
      statusCode: res.statusCode,
    }),
    err: (err: { type?: string; message?: string; stack?: string; statusCode?: number; code?: string }) => ({
      type: err.type,
      message: err.message,
      stack: err.stack,
      statusCode: err.statusCode,
      code: err.code,
    }),
  },
}

/**
 * A fresh, collision-resistant request id. UUIDv4 is the natural choice: 122 bits of entropy,
 * no global counter to worry about across processes, and the string form is exactly what an
 * `x-request-id` header should be. `crypto.randomUUID` is available in every Node version the
 * project targets (≥16.7 with the `--experimental-*` flag, ≥19 without).
 */
function generateRequestId(): string {
  return randomUUID()
}

const healthResponseSchema = z.object({ data: z.object({ status: z.literal('ok') }) })

/**
 * `authSecret` is decorated (when a `PrismaClient` is supplied) so the routes that mint or
 * verify signed grants — the CV upload's HMAC signature in `candidates.routes.ts` — read the
 * same secret better-auth uses for its cookies, from one place, without re-reading the env.
 */
declare module 'fastify' {
  interface FastifyInstance {
    authSecret: string
  }
}

/**
 * Build the Fastify application with all cross-cutting concerns and the health probe.
 *
 * Feature routes (hr, finance, …) register here as they are ported. The application is built
 * with the Zod type provider and OpenAPI transform so every registered route's schema is a
 * single source of truth that produces both runtime validation and the API document.
 *
 * Env is injected (defaulting to `process.env`) so a test can build the app without a real
 * connection string — nothing here connects to the database, *unless* `options.prisma` is
 * supplied. Auth (and therefore the database) is opt-in for exactly that reason: the health
 * and error-handler tests build an app with none of it and stay fast and offline.
 */
export interface BuildAppOptions {
  /**
   * Options for the underlying Pino logger. Tests pass `false` to keep output clean; anything
   * `true`-ish merges on top of the shared {@link loggerOptions} (redact/serializers) so a
   * production-ish build never accidentally logs a token even when it opts into logging.
   */
  logger?: boolean | LoggerOptions
  /** Provide a real `PrismaClient` to mount `/api/auth/*` and enable RBAC lookups. */
  prisma?: PrismaClient
  /** Override the better-auth instance (e.g. with a stub `handler`/`api`) instead of building one from `prisma`+`environment`. */
  auth?: Auth
}

/**
 * Resolve the logger option to a concrete Fastify logger config.
 *
 * - `undefined` or `true` → the shared config (redact + serializers always on).
 * - `false` → `false` (tests want no output at all).
 * - an object → the caller's object spread over the shared config, so redact/serializers
 *   cannot be accidentally overridden off.
 */
function resolveLogger(logger: BuildAppOptions['logger']): false | LoggerOptions {
  if (logger === false) return false
  if (logger === true || logger === undefined) return loggerOptions
  // Merge caller options over the base: base wins on `redact`/`serializers` to keep the
  // guarantees above; `level`/`transport`/`stream` etc. come from the caller.
  return { ...loggerOptions, ...logger }
}

export async function buildApp(
  environment: ReturnType<typeof loadEnv> = loadEnv(),
  options: BuildAppOptions = {},
) {
  const app = Fastify({
    logger: resolveLogger(options.logger),
    // The correlation plugin's `onRequest` reads the incoming `x-request-id` header before
    // Fastify's own id is used; `requestIdHeader` keeps the *response* header the same value
    // so a client can log "request X" and match it against the server's `reqId` field.
    requestIdHeader: 'x-request-id',
    genReqId: req => (req.headers['x-request-id'] as string | undefined) ?? generateRequestId(),
  }).withTypeProvider<ZodTypeProvider>()

  app.setErrorHandler(errorHandler)
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Correlation id + response header, registered before the middleware that will read it.
  await app.register(correlationPlugin)
  // Sentry no-op unless `SENTRY_DSN` is set; must be registered before routes so an unhandled
  // request error goes to Sentry in addition to the log sink.
  await app.register(sentryPlugin, { environment: environment.nodeEnv })

  // This server only ever emits JSON, so the HTML-oriented helmet directives are inert — they
  // cost nothing and are already correct if an OpenAPI UI is mounted here (it is).
  await app.register(helmet)

  await app.register(cors, {
    origin: environment.frontendOrigin.split(',').map(value => value.trim()),
    credentials: true,
  })

  // Global ceiling. The credential endpoints (sign-in/sign-up/password) get their own tighter
  // fixed-window limiter inside the better-auth catch-all (`plugins/betterAuth.ts`), because
  // `@fastify/rate-limit` cannot scope rules to a wildcard sub-path — everything else rides
  // this global ceiling.
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' })

  await app.register(swagger, {
    openapi: {
      info: { title: 'Asas API', version: '1.0.0' },
      components: {
        securitySchemes: {
          // better-auth's default session cookie name — the doc must name the cookie the
          // browser actually sends or "Try it out" can never authenticate.
          cookieAuth: { type: 'apiKey', in: 'cookie', name: 'better-auth.session_token' },
        },
      },
    },
    transform: jsonSchemaTransform,
  })
  await app.register(swaggerUi, { routePrefix: '/docs' })

  // The CV upload route accepts a raw `application/pdf` body (the browser PUTs the file's
  // bytes straight to the API). Fastify has no built-in PDF parser, so buffer it to a
  // `Buffer` — the route itself enforces the size cap and the `%PDF-` magic-number check.
  app.addContentTypeParser('application/pdf', (request, payload, done) => {
    const chunks: Buffer[] = []
    payload.on('data', (chunk: Buffer) => chunks.push(chunk))
    payload.on('end', () => done(null, Buffer.concat(chunks)))
    payload.on('error', done)
  })

  if (options.prisma) {
    await prismaPlugin(app, options.prisma)
    const auth = options.auth ?? createAuth(options.prisma, environment)
    await betterAuthPlugin(app, auth)
    // The CV upload route mints/verifies an HMAC signature against the same secret better-auth
    // uses for its cookies; decorate it once so that route reads it from one place.
    app.decorate('authSecret', environment.authSecret)
    // Decorate `ssePublish` on the *root* so every module route (a child of root) can call
    // `request.server.ssePublish(tenantId, keys)` after a write mutation. The SSE route itself
    // is registered with a prefix so it ends up at `/api/v1/events`.
    app.decorate('ssePublish', publish)
    await app.register(ssePlugin, { prefix: '/api/v1' })
    // The export queue. `QUEUE_URL` set → pg-boss worker; empty (default) → inline, so a job
    // row goes QUEUED → DONE before the request that created it returns. The store is a thin
    // adapter over the `ExportJob` model so the queue stays transport-agnostic.
    //
    // Called *directly* (like `prismaPlugin`), not via `app.register`: registration encapsulates
    // the plugin into a child context, so its `app.decorate('exportQueue', …)` would decorate that
    // child and the root's `registerExportHandlers(app.exportQueue)` below would read undefined.
    await exportQueuePlugin(app, {
      queueUrl: environment.queueUrl || undefined,
      store: {
        create: data => app.prisma.exportJob.create({ data }),
        updateMany: args => app.prisma.exportJob.updateMany(args),
      },
    })
    // Register the concrete "render a kind into bytes" handlers before any job can dispatch.
    registerExportHandlers(app.exportQueue)
    await app.register(hrRoutes, { prefix: '/api/v1/hr' })
    await app.register(payrollRoutes, { prefix: '/api/v1/hr' })
    await app.register(candidateRoutes, { prefix: '/api/v1/hr' })
    await app.register(financeRoutes, { prefix: '/api/v1/finance' })
    await app.register(attendanceRoutes, { prefix: '/api/v1/hr' })
    await app.register(crmRoutes, { prefix: '/api/v1/crm' })
    await app.register(projectsRoutes, { prefix: '/api/v1/projects' })
    await app.register(inventoryRoutes, { prefix: '/api/v1/inventory' })
    await app.register(settingsRoutes, { prefix: '/api/v1/settings' })
    await app.register(onboardingRoutes, { prefix: '/api/v1/onboarding' })
    await app.register(exportRoutes, { prefix: '/api/v1/exports' })
  }

  app.get(
    '/health',
    {
      config: { rateLimit: false },
      schema: { response: { 200: healthResponseSchema } },
    },
    async () => ({ data: { status: 'ok' as const } }),
  )

  return app
}
