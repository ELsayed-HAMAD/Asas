import { isIP } from 'node:net'

/**
 * Environment configuration.
 *
 * `loadEnv` is a pure function so tests can inject values without process-global mutation.
 * `assertEnv` guards the process-level invariants required to actually boot (a database
 * connection string, real secrets, and an explicit proxy trust boundary). Everything short
 * of booting, including building the Fastify app and running handler tests, is intentionally
 * free of these.
 */

export interface AsasEnv {
  databaseUrl: string
  /** Signs and encrypts Better Auth's session cookies. */
  authSecret: string
  /** Dedicated master key for AES-256-GCM credential encryption. */
  encryptionKey: string
  /** Dedicated key for encrypting employee bank details at rest. */
  bankDataEncryptionKey: string
  port: number
  host: string
  frontendOrigin: string
  /**
   * Public origin of this API. Better Auth uses it for OAuth callbacks, emailed links, and
   * secure-cookie prefixes. Development defaults to loopback; production must set an HTTPS
   * public origin so cookies are `Secure` and callbacks never point at the server's loopback.
   */
  betterAuthUrl: string
  nodeEnv: string
  isProduction: boolean
  /**
   * True when the API runs inside a request-scoped function (Vercel). Long-lived transports such
   * as the SSE stream cannot survive there, and the deploy-time maintenance timers must not run.
   */
  serverless: boolean
  /**
   * Explicit reverse-proxy IPs/CIDRs whose `X-Forwarded-*` headers are trusted. An empty list
   * means no proxy is trusted, which is the safe default. Trust-all ranges are rejected.
   */
  trustedProxyCidrs: string[]
  /**
   * Application-level tenant guard. `enforce` injects the active tenant into every
   * request-scoped Prisma operation on a tenant-owned model and rejects mismatches; `off`
   * is allowed only outside production for diagnostics. RLS remains defence-in-depth.
   */
  tenantGuardEnabled: boolean
  /**
   * When set, the export queue runs on pg-boss (this Postgres connection string); when empty
   * it runs inline in-process. Default empty: local dev, tests, and CI never need a broker.
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
  /** Optional SMTP relay used when Resend is not configured (Gmail app password, Brevo, etc.). */
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPass: string
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
  /** Local-only identity bypass for exercising the social onboarding UI without OAuth credentials. */
  devSocialAuthEnabled: boolean
  /** Emails that bootstrap the first platform owner on sign-in. */
  platformOwnerEmails: string[]
  /** Require an enabled second factor before platform-console access. */
  platformRequire2fa: boolean
}

/** Proxy values that disable the trust boundary entirely. They are never accepted. */
const TRUST_ALL_PROXIES = new Set(['*', '0.0.0.0/0', '::/0', 'true'])

function isValidCidr(value: string): boolean {
  const [address, prefix, ...rest] = value.split('/')
  if (!address || prefix === undefined || rest.length > 0) return false
  const family = isIP(address)
  if (family === 0 || !/^\d{1,3}$/.test(prefix)) return false
  const bits = Number(prefix)
  return family === 4 ? bits >= 0 && bits <= 32 : bits >= 0 && bits <= 128
}

/**
 * Parse the explicit proxy trust boundary.
 *
 * `TRUSTED_PROXY_CIDRS` is the preferred name. `TRUST_PROXY` is accepted for compatibility,
 * but `true` and trust-all CIDRs are rejected: trusting every peer lets any client forge
 * `X-Forwarded-For`, defeating IP rate limits and audit attribution.
 */
export function resolveTrustedProxyCidrs(source: NodeJS.ProcessEnv = process.env): string[] {
  const raw = (source.TRUSTED_PROXY_CIDRS ?? source.TRUST_PROXY ?? '').trim()
  if (!raw || raw.toLowerCase() === 'false') return []
  if (TRUST_ALL_PROXIES.has(raw.toLowerCase())) {
    throw new Error('Trusting every reverse proxy is unsafe; list explicit TRUSTED_PROXY_CIDRS values instead')
  }

  const values = raw.split(',').map(value => value.trim()).filter(Boolean)
  for (const value of values) {
    if (TRUST_ALL_PROXIES.has(value.toLowerCase())) {
      throw new Error('Trusting every reverse proxy is unsafe; list explicit TRUSTED_PROXY_CIDRS values instead')
    }
    if (value.includes('/')) {
      if (!isValidCidr(value)) {
        throw new Error(`TRUSTED_PROXY_CIDRS contains an invalid CIDR range: ${value}`)
      }
      continue
    }
    if (isIP(value) === 0) {
      throw new Error(`TRUSTED_PROXY_CIDRS contains an invalid IP address: ${value}`)
    }
  }
  return values
}

function resolveBetterAuthUrl(value: string | undefined, nodeEnv: string, port: number): string {
  const configured = value?.trim()
  const raw = configured || (nodeEnv === 'production' ? '' : `http://127.0.0.1:${port}`)
  if (!raw) return ''

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('BETTER_AUTH_URL must be a valid absolute URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('BETTER_AUTH_URL must use http or https')
  }
  return raw.replace(/\/+$/, '')
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AsasEnv {
  const nodeEnv = source.NODE_ENV || 'development'
  const authSecret = source.AUTH_SECRET ?? source.BETTER_AUTH_SECRET ?? ''
  const devSocialAuthRequested = source.DEV_SOCIAL_AUTH_ENABLED === 'true'
  if (devSocialAuthRequested && nodeEnv !== 'development') {
    throw new Error('DEV_SOCIAL_AUTH_ENABLED may only be enabled when NODE_ENV=development')
  }
  if (devSocialAuthRequested && !authSecret.trim()) {
    throw new Error('AUTH_SECRET is required when DEV_SOCIAL_AUTH_ENABLED=true')
  }
  const rlsEnforcement = (source.RLS_ENFORCEMENT ?? 'enforce').trim().toLowerCase()
  if (rlsEnforcement !== 'enforce' && rlsEnforcement !== 'off') {
    throw new Error('RLS_ENFORCEMENT must be either "enforce" or "off"')
  }
  // No placeholder origin in production: a fabricated default silently produces a CORS
  // allow-list that matches no real browser origin. An empty value rejects every cross-origin
  // request, which is the safe default for a same-origin deployment.
  const frontendOrigin = source.FRONTEND_ORIGIN?.trim() || (nodeEnv === 'production' ? '' : 'http://localhost:5173,http://127.0.0.1:5173')
  const objectStorageDriver = source.OBJECT_STORAGE_DRIVER ?? 'local'
  if (objectStorageDriver !== 'local' && objectStorageDriver !== 's3') {
    throw new Error('OBJECT_STORAGE_DRIVER must be either local or s3')
  }
  const rawPort = source.PORT !== undefined && source.PORT !== '' ? Number(source.PORT) : 4000
  if (!Number.isInteger(rawPort) || rawPort < 1 || rawPort > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, received: ${source.PORT}`)
  }
  const betterAuthUrl = resolveBetterAuthUrl(source.BETTER_AUTH_URL, nodeEnv, rawPort)
  return {
    databaseUrl: source.DATABASE_URL ?? '',
    authSecret,
    encryptionKey: source.ENCRYPTION_KEY?.trim() ?? '',
    bankDataEncryptionKey: source.BANK_DATA_ENCRYPTION_KEY?.trim() ?? '',
    port: rawPort,
    host: source.HOST || '127.0.0.1',
    frontendOrigin,
    betterAuthUrl,
    nodeEnv,
    isProduction: nodeEnv === 'production',
    serverless: Boolean(source.VERCEL) || source.SERVERLESS === 'true',
    trustedProxyCidrs: resolveTrustedProxyCidrs(source),
    tenantGuardEnabled: rlsEnforcement === 'enforce',
    queueUrl: source.QUEUE_URL ?? '',
    enableApiDocs: source.ENABLE_API_DOCS === 'true',
    redisUrl: source.REDIS_URL ?? '',
    resendApiKey: source.RESEND_API_KEY ?? '',
    mailFrom: source.MAIL_FROM?.trim() ?? '',
    smtpHost: source.SMTP_HOST?.trim() ?? '',
    smtpPort: Number(source.SMTP_PORT ?? 587),
    smtpSecure: source.SMTP_SECURE === 'true',
    smtpUser: source.SMTP_USER?.trim() ?? '',
    smtpPass: source.SMTP_PASS ?? '',
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
    devSocialAuthEnabled: devSocialAuthRequested,
    platformOwnerEmails: (source.PLATFORM_OWNER_EMAILS ?? '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
    platformRequire2fa: source.PLATFORM_REQUIRE_2FA === 'true',
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
  if (environment.isProduction && environment.authSecret.length < 32) {
    throw new Error('AUTH_SECRET must contain at least 32 characters in production')
  }
  if (environment.isProduction && environment.encryptionKey.length < 32) {
    throw new Error('ENCRYPTION_KEY must contain at least 32 characters in production')
  }
  if (environment.isProduction && environment.encryptionKey === environment.authSecret) {
    throw new Error('ENCRYPTION_KEY must be different from AUTH_SECRET so credential encryption is independently keyed')
  }
  if (environment.isProduction && !environment.tenantGuardEnabled) {
    throw new Error('RLS_ENFORCEMENT=off is not allowed in production')
  }
  if (environment.isProduction && !environment.betterAuthUrl) {
    throw new Error('Missing required environment variable: BETTER_AUTH_URL (required in production)')
  }
  if (environment.isProduction && !environment.betterAuthUrl.startsWith('https://')) {
    throw new Error('BETTER_AUTH_URL must use HTTPS in production so session cookies are Secure and OAuth callbacks are correct')
  }
  if (environment.isProduction) {
    const origins = environment.frontendOrigin.split(',').map(o => o.trim()).filter(Boolean)
    if (origins.length === 0) {
      throw new Error('Missing required environment variable: FRONTEND_ORIGIN (required in production)')
    }
    if (origins.some(o => !o.startsWith('https://'))) {
      throw new Error('FRONTEND_ORIGIN must use HTTPS in production to prevent cookie leakage over plaintext')
    }
  }
  if (environment.nodeEnv === 'production' && (environment.resendApiKey || environment.smtpHost) && !environment.mailFrom) {
    throw new Error('Missing required environment variable: MAIL_FROM (required with an email provider)')
  }
  if (Boolean(environment.smtpUser) !== Boolean(environment.smtpPass)) {
    throw new Error('SMTP_USER and SMTP_PASS must be configured together')
  }
  if (environment.smtpHost && (!Number.isInteger(environment.smtpPort) || environment.smtpPort < 1 || environment.smtpPort > 65535)) {
    throw new Error('SMTP_PORT must be an integer between 1 and 65535')
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
