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
  /** Dedicated key for encrypting employee bank details at rest. */
  bankDataEncryptionKey: string
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
  /**
   * Redis URL for distributed rate limiting and cross-node SSE fanout.
   * If empty (default), in-memory fallback is used automatically.
   */
  redisUrl: string
  /** Resend API key; email delivery fails explicitly when this is not configured. */
  resendApiKey: string
  /** Verified sender address configured with the email provider. */
  mailFrom: string
  /** File backend. Local storage is intended for development; S3-compatible storage is durable. */
  objectStorageDriver: 'local' | 's3'
  objectStorageBucket: string
  objectStorageRegion: string
  objectStorageEndpoint: string
  objectStorageAccessKeyId: string
  objectStorageSecretAccessKey: string
  /** Stripe API key. Empty disables hosted billing operations. */
  stripeSecretKey: string
  /** Stripe webhook signing secret. Empty disables webhook processing. */
  stripeWebhookSecret: string
  /** Comma-separated allow-list of Stripe recurring Price IDs. */
  stripePriceIds: string[]
  /** Google OAuth Client ID & Secret for Social SSO */
  googleClientId: string
  googleClientSecret: string
  /** Apple OAuth Services ID & Secret */
  appleClientId: string
  appleClientSecret: string
  /** Local-only identity bypass for exercising the social onboarding UI without OAuth credentials. */
  devSocialAuthEnabled: boolean
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AsasEnv {
  const nodeEnv = source.NODE_ENV || 'development'
  const devSocialAuthRequested = source.DEV_SOCIAL_AUTH_ENABLED === 'true'
  if (devSocialAuthRequested && nodeEnv !== 'development') {
    throw new Error('DEV_SOCIAL_AUTH_ENABLED may only be enabled when NODE_ENV=development')
  }
  const frontendOrigin = source.FRONTEND_ORIGIN || (nodeEnv === 'production' ? 'https://app.asas.local' : 'http://localhost:5173,http://127.0.0.1:5173')
  const objectStorageDriver = source.OBJECT_STORAGE_DRIVER ?? 'local'
  if (objectStorageDriver !== 'local' && objectStorageDriver !== 's3') {
    throw new Error('OBJECT_STORAGE_DRIVER must be either local or s3')
  }
  const rawPort = source.PORT !== undefined && source.PORT !== '' ? Number(source.PORT) : 4000
  if (!Number.isInteger(rawPort) || rawPort < 1 || rawPort > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, received: ${source.PORT}`)
  }
  return {
    databaseUrl: source.DATABASE_URL ?? '',
    authSecret: source.AUTH_SECRET ?? source.BETTER_AUTH_SECRET ?? '',
    bankDataEncryptionKey: source.BANK_DATA_ENCRYPTION_KEY?.trim() ?? '',
    port: rawPort,
    host: source.HOST || '127.0.0.1',
    frontendOrigin,
    nodeEnv,
    isProduction: nodeEnv === 'production',
    queueUrl: source.QUEUE_URL ?? '',
    enableApiDocs: source.ENABLE_API_DOCS === 'true',
    redisUrl: source.REDIS_URL ?? '',
    resendApiKey: source.RESEND_API_KEY ?? '',
    mailFrom: source.MAIL_FROM?.trim() ?? '',
    objectStorageDriver,
    objectStorageBucket: source.S3_BUCKET ?? '',
    objectStorageRegion: source.S3_REGION ?? 'us-east-1',
    objectStorageEndpoint: source.S3_ENDPOINT ?? '',
    objectStorageAccessKeyId: source.S3_ACCESS_KEY_ID ?? '',
    objectStorageSecretAccessKey: source.S3_SECRET_ACCESS_KEY ?? '',
    stripeSecretKey: source.STRIPE_SECRET_KEY ?? '',
    stripeWebhookSecret: source.STRIPE_WEBHOOK_SECRET ?? '',
    stripePriceIds: (source.STRIPE_PRICE_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean),
    googleClientId: source.GOOGLE_CLIENT_ID?.trim() ?? '',
    googleClientSecret: source.GOOGLE_CLIENT_SECRET?.trim() ?? '',
    appleClientId: source.APPLE_CLIENT_ID?.trim() ?? '',
    appleClientSecret: source.APPLE_CLIENT_SECRET?.trim() ?? '',
    devSocialAuthEnabled: devSocialAuthRequested,
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
  if (environment.isProduction) {
    const origins = environment.frontendOrigin.split(',').map(o => o.trim())
    if (origins.some(o => !o.startsWith('https://'))) {
      throw new Error('FRONTEND_ORIGIN must use HTTPS in production to prevent cookie leakage over plaintext')
    }
  }
  if (environment.nodeEnv === 'production' && environment.resendApiKey && !environment.mailFrom) {
    throw new Error('Missing required environment variable: MAIL_FROM (required with RESEND_API_KEY)')
  }
  if (environment.objectStorageDriver === 's3' && !environment.objectStorageBucket.trim()) {
    throw new Error('Missing required environment variable: S3_BUCKET (required with OBJECT_STORAGE_DRIVER=s3)')
  }
  if (environment.isProduction && environment.objectStorageDriver !== 's3') {
    throw new Error('OBJECT_STORAGE_DRIVER=s3 is required in production to prevent files being stored on ephemeral disk')
  }
  if (Boolean(environment.objectStorageAccessKeyId) !== Boolean(environment.objectStorageSecretAccessKey)) {
    throw new Error('S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured together')
  }
  if (environment.objectStorageEndpoint && !environment.objectStorageAccessKeyId) {
    throw new Error('S3 credentials are required when using a custom S3_ENDPOINT')
  }
  if (Boolean(environment.stripeSecretKey) !== Boolean(environment.stripeWebhookSecret)) {
    throw new Error('STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must be configured together')
  }
  if (environment.stripePriceIds.some(priceId => !/^price_[A-Za-z0-9]+$/.test(priceId))) {
    throw new Error('STRIPE_PRICE_IDS must contain comma-separated Stripe Price IDs')
  }
  if (environment.stripePriceIds.length && !environment.stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY is required when STRIPE_PRICE_IDS are configured')
  }
  if (environment.isProduction && environment.bankDataEncryptionKey.length < 32) {
    throw new Error('BANK_DATA_ENCRYPTION_KEY must contain at least 32 characters in production')
  }
  return environment
}
