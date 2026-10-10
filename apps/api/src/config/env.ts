/**
 * Environment configuration.
 *
 * `loadEnv` is a pure function so tests can inject values without process-global mutation.
 * `assertEnv` guards the process-level invariants required to actually boot (a database
 * connection string, and — once auth ships — a secret). Everything short of booting, including
 * building the Fastify app and running handler tests, is intentionally free of these.
 */

export interface AsasEnv {
  databaseUrl: string
  /** Signs and encrypts Better Auth's session cookies. Not JWT-related — auth has shipped. */
  authSecret: string
  port: number
  host: string
  frontendOrigin: string
  nodeEnv: string
  isProduction: boolean
  /**
   * When set, the export queue runs on pg-boss (this Postgres connection string); when empty
   * it runs inline in-process. Default empty — local dev, tests, and CI never need a broker.
   */
  queueUrl: string
  /**
   * `ENABLE_API_DOCS=true` mounts the Swagger UI (`/docs`) even in production. Outside
   * production the docs are always mounted.
   */
  enableApiDocs: boolean
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AsasEnv {
  const nodeEnv = source.NODE_ENV || 'development'
  const frontendOrigin = source.FRONTEND_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173'
  return {
    databaseUrl: source.DATABASE_URL ?? '',
    authSecret: source.AUTH_SECRET ?? source.BETTER_AUTH_SECRET ?? '',
    port: Number(source.PORT || 4000),
    host: source.HOST || '127.0.0.1',
    frontendOrigin,
    nodeEnv,
    isProduction: nodeEnv === 'production',
    queueUrl: source.QUEUE_URL ?? '',
    enableApiDocs: source.ENABLE_API_DOCS === 'true',
  }
}

/** Throw if the environment is missing something a live server genuinely needs. */
export function assertEnv(environment: AsasEnv = loadEnv()): AsasEnv {
  if (!environment.databaseUrl) {
    throw new Error('Missing required environment variable: DATABASE_URL')
  }
  if (environment.nodeEnv === 'production' && !environment.authSecret) {
    throw new Error('Missing required environment variable: AUTH_SECRET (required in production)')
  }
  return environment
}
