import { describe, expect, it } from 'vitest'
import { assertEnv, loadEnv, resolveTrustedProxyCidrs } from '../src/config/env.js'

const productionAuthSecret = '01234567890123456789012345678901'
const productionEncryptionKey = 'abcdefghijklmnopqrstuvwxyz012345'
const productionUrl = 'https://api.asas.test'
const bankKey = 'bank-data-encryption-key-that-is-at-least-32-chars'

function productionEnv(overrides: NodeJS.ProcessEnv = {}) {
  return loadEnv({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://db',
    AUTH_SECRET: productionAuthSecret,
    ENCRYPTION_KEY: productionEncryptionKey,
    BETTER_AUTH_URL: productionUrl,
    FRONTEND_ORIGIN: 'https://app.asas.test',
    ...overrides,
  })
}

describe('email environment', () => {
  it('loads Resend credentials and sender separately', () => {
    const env = loadEnv({ RESEND_API_KEY: 're_test_key', MAIL_FROM: 'Asas <mail@example.com>' })
    expect(env.resendApiKey).toBe('re_test_key')
    expect(env.mailFrom).toBe('Asas <mail@example.com>')
  })

  it('requires an explicit sender when Resend is configured in production', () => {
    expect(() => assertEnv(productionEnv({
      RESEND_API_KEY: 're_test_key',
      OBJECT_STORAGE_DRIVER: 's3',
      S3_BUCKET: 'asas-files',
    }))).toThrow('Missing required environment variable: MAIL_FROM')
    expect(() => assertEnv(productionEnv({
      BANK_DATA_ENCRYPTION_KEY: bankKey,
      RESEND_API_KEY: 're_test_key',
      MAIL_FROM: 'Asas <mail@example.com>',
      OBJECT_STORAGE_DRIVER: 's3',
      S3_BUCKET: 'asas-files',
    }))).not.toThrow()
  })

  it('enforces HTTPS for FRONTEND_ORIGIN in production', () => {
    expect(() => assertEnv(productionEnv({
      OBJECT_STORAGE_DRIVER: 's3',
      S3_BUCKET: 'asas-files',
      FRONTEND_ORIGIN: 'http://insecure.example.com',
    }))).toThrow('FRONTEND_ORIGIN must use HTTPS in production to prevent cookie leakage over plaintext')
    expect(() => assertEnv(productionEnv({
      BANK_DATA_ENCRYPTION_KEY: bankKey,
      OBJECT_STORAGE_DRIVER: 's3',
      S3_BUCKET: 'asas-files',
      FRONTEND_ORIGIN: 'https://app.asas.com',
    }))).not.toThrow()
  })

  it('requires an explicit production origin instead of a fabricated placeholder', () => {
    expect(loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db' }).frontendOrigin).toBe('')
    expect(() => assertEnv(productionEnv({
      FRONTEND_ORIGIN: '',
      BANK_DATA_ENCRYPTION_KEY: bankKey,
      OBJECT_STORAGE_DRIVER: 's3',
      S3_BUCKET: 'asas-files',
    }))).toThrow('Missing required environment variable: FRONTEND_ORIGIN')
  })

  it('derives the production origin from the Vercel platform domain', () => {
    expect(loadEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://db',
      VERCEL_PROJECT_PRODUCTION_URL: 'asas-sigma-wheat.vercel.app',
    }).frontendOrigin).toBe('https://asas-sigma-wheat.vercel.app')
    expect(loadEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://db',
      VERCEL_URL: 'https://asas-preview.vercel.app/',
    }).frontendOrigin).toBe('https://asas-preview.vercel.app')
    expect(loadEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://db',
      FRONTEND_ORIGIN: 'https://app.example.com',
      VERCEL_PROJECT_PRODUCTION_URL: 'ignored.vercel.app',
    }).frontendOrigin).toBe('https://app.example.com')
  })
})

describe('Better Auth public URL environment', () => {
  it('defaults to loopback in development and strips trailing slashes', () => {
    expect(loadEnv({}).betterAuthUrl).toBe('http://127.0.0.1:4000')
    expect(loadEnv({ PORT: '8080' }).betterAuthUrl).toBe('http://127.0.0.1:8080')
    expect(loadEnv({ BETTER_AUTH_URL: 'https://api.asas.test/' }).betterAuthUrl).toBe('https://api.asas.test')
  })

  it('requires a valid HTTPS public URL in production', () => {
    expect(() => assertEnv(productionEnv({ BETTER_AUTH_URL: '' })))
      .toThrow('Missing required environment variable: BETTER_AUTH_URL')
    expect(() => assertEnv(productionEnv({ BETTER_AUTH_URL: 'http://api.asas.test' })))
      .toThrow('BETTER_AUTH_URL must use HTTPS in production')
    expect(() => loadEnv({ NODE_ENV: 'production', BETTER_AUTH_URL: 'not-a-url' }))
      .toThrow('BETTER_AUTH_URL must be a valid absolute URL')
    expect(() => assertEnv(productionEnv({
      BANK_DATA_ENCRYPTION_KEY: bankKey,
      OBJECT_STORAGE_DRIVER: 's3',
      S3_BUCKET: 'asas-files',
    }))).not.toThrow()
  })

  it('rejects a short AUTH_SECRET in production', () => {
    expect(() => assertEnv(productionEnv({
      AUTH_SECRET: 'short',
      BANK_DATA_ENCRYPTION_KEY: bankKey,
      OBJECT_STORAGE_DRIVER: 's3',
      S3_BUCKET: 'asas-files',
    }))).toThrow('AUTH_SECRET must contain at least 32 characters in production')
  })
})

describe('object storage environment', () => {
  it('loads S3-compatible storage settings', () => {
    const env = loadEnv({
      OBJECT_STORAGE_DRIVER: 's3',
      DATABASE_URL: 'postgres://db',
      S3_BUCKET: 'asas-files',
      S3_REGION: 'auto',
      S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
      S3_ACCESS_KEY_ID: 'access',
      S3_SECRET_ACCESS_KEY: 'secret',
    })
    expect(env.objectStorageDriver).toBe('s3')
    expect(env.objectStorageBucket).toBe('asas-files')
    expect(env.objectStorageRegion).toBe('auto')
    expect(() => assertEnv(env)).not.toThrow()
  })

  it('rejects invalid driver names, missing buckets and incomplete custom-endpoint credentials', () => {
    expect(() => loadEnv({ OBJECT_STORAGE_DRIVER: 'cloud' })).toThrow('OBJECT_STORAGE_DRIVER must be either local or s3')
    expect(() => assertEnv(loadEnv({ DATABASE_URL: 'postgres://db', OBJECT_STORAGE_DRIVER: 's3' }))).toThrow('S3_BUCKET')
    expect(() => assertEnv(loadEnv({ DATABASE_URL: 'postgres://db', OBJECT_STORAGE_DRIVER: 's3', S3_BUCKET: 'asas-files', S3_ENDPOINT: 'https://objects.example.test', S3_ACCESS_KEY_ID: 'access' })))
      .toThrow('must be configured together')
    expect(() => assertEnv(productionEnv()))
      .toThrow('OBJECT_STORAGE_DRIVER=s3 is required in production')
  })
})

describe('Stripe billing environment', () => {
  it('loads configured monthly price IDs without logging or exposing keys', () => {
    const env = loadEnv({ DATABASE_URL: 'postgres://db', STRIPE_SECRET_KEY: 'synthetic-stripe-secret', STRIPE_WEBHOOK_SECRET: 'synthetic-webhook-secret', STRIPE_PRICE_IDS: 'price_basic, price_pro' })
    expect(env.stripePriceIds).toEqual(['price_basic', 'price_pro'])
    expect(() => assertEnv(env)).not.toThrow()
  })

  it('requires paired API and webhook secrets and validates price IDs', () => {
    expect(() => assertEnv(loadEnv({ DATABASE_URL: 'postgres://db', STRIPE_SECRET_KEY: 'synthetic-stripe-secret' }))).toThrow('must be configured together')
    expect(() => assertEnv(loadEnv({ DATABASE_URL: 'postgres://db', STRIPE_WEBHOOK_SECRET: 'whsec_private' }))).toThrow('must be configured together')
    expect(() => assertEnv(loadEnv({ DATABASE_URL: 'postgres://db', STRIPE_SECRET_KEY: 'synthetic-stripe-secret', STRIPE_WEBHOOK_SECRET: 'synthetic-webhook-secret', STRIPE_PRICE_IDS: 'monthly' }))).toThrow('Stripe Price IDs')
    expect(() => assertEnv(loadEnv({ DATABASE_URL: 'postgres://db', STRIPE_PRICE_IDS: 'price_basic' }))).toThrow('STRIPE_SECRET_KEY is required')
  })
})

describe('PORT environment validation', () => {
  it('defaults to 4000 when PORT is omitted', () => {
    const env = loadEnv({})
    expect(env.port).toBe(4000)
  })

  it('parses valid integer PORT strings', () => {
    const env = loadEnv({ PORT: '8080' })
    expect(env.port).toBe(8080)
  })

  it('rejects invalid, negative, zero, non-integer, and out-of-range ports', () => {
    expect(() => loadEnv({ PORT: 'invalid' })).toThrow('PORT must be an integer between 1 and 65535')
    expect(() => loadEnv({ PORT: '0' })).toThrow('PORT must be an integer between 1 and 65535')
    expect(() => loadEnv({ PORT: '-1' })).toThrow('PORT must be an integer between 1 and 65535')
    expect(() => loadEnv({ PORT: '70000' })).toThrow('PORT must be an integer between 1 and 65535')
    expect(() => loadEnv({ PORT: '4000.5' })).toThrow('PORT must be an integer between 1 and 65535')
  })
})

describe('development social authentication environment', () => {
  it('rejects enabling the identity-bypass sandbox outside local development', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging', DEV_SOCIAL_AUTH_ENABLED: 'true' }))
      .toThrow('DEV_SOCIAL_AUTH_ENABLED may only be enabled when NODE_ENV=development')
    expect(loadEnv({ NODE_ENV: 'development' }).devSocialAuthEnabled).toBe(false)
  })

  it('requires a real signing secret when the sandbox is enabled', () => {
    expect(() => loadEnv({ NODE_ENV: 'development', DEV_SOCIAL_AUTH_ENABLED: 'true' }))
      .toThrow('AUTH_SECRET is required when DEV_SOCIAL_AUTH_ENABLED=true')
    expect(loadEnv({ NODE_ENV: 'development', DEV_SOCIAL_AUTH_ENABLED: 'true', AUTH_SECRET: 'dev-secret' }).devSocialAuthEnabled).toBe(true)
  })
})

describe('employee bank-data encryption environment', () => {
  it('requires a dedicated 32-character key in production', () => {
    expect(() => assertEnv(productionEnv({
      OBJECT_STORAGE_DRIVER: 's3', S3_BUCKET: 'asas-files',
    }))).toThrow('BANK_DATA_ENCRYPTION_KEY must contain at least 32 characters in production')
    expect(() => assertEnv(productionEnv({
      BANK_DATA_ENCRYPTION_KEY: 'short', OBJECT_STORAGE_DRIVER: 's3', S3_BUCKET: 'asas-files',
    }))).toThrow('BANK_DATA_ENCRYPTION_KEY must contain at least 32 characters in production')
  })
})

describe('credential encryption environment', () => {
  it('requires an independent 32-character ENCRYPTION_KEY in production', () => {
    expect(() => assertEnv(productionEnv({
      ENCRYPTION_KEY: '',
      BANK_DATA_ENCRYPTION_KEY: bankKey,
      OBJECT_STORAGE_DRIVER: 's3',
      S3_BUCKET: 'asas-files',
    }))).toThrow('ENCRYPTION_KEY must contain at least 32 characters in production')
    expect(() => assertEnv(productionEnv({
      ENCRYPTION_KEY: 'short',
      BANK_DATA_ENCRYPTION_KEY: bankKey,
      OBJECT_STORAGE_DRIVER: 's3',
      S3_BUCKET: 'asas-files',
    }))).toThrow('ENCRYPTION_KEY must contain at least 32 characters in production')
    expect(() => assertEnv(productionEnv({
      ENCRYPTION_KEY: productionAuthSecret,
      BANK_DATA_ENCRYPTION_KEY: bankKey,
      OBJECT_STORAGE_DRIVER: 's3',
      S3_BUCKET: 'asas-files',
    }))).toThrow('ENCRYPTION_KEY must be different from AUTH_SECRET')
  })
})

describe('tenant guard environment', () => {
  it('enforces the guard by default and permits an explicit non-production opt-out', () => {
    expect(loadEnv({}).tenantGuardEnabled).toBe(true)
    expect(loadEnv({ RLS_ENFORCEMENT: 'enforce' }).tenantGuardEnabled).toBe(true)
    expect(loadEnv({ NODE_ENV: 'development', RLS_ENFORCEMENT: 'off' }).tenantGuardEnabled).toBe(false)
    expect(() => loadEnv({ RLS_ENFORCEMENT: 'sometimes' })).toThrow('RLS_ENFORCEMENT must be either "enforce" or "off"')
    expect(() => assertEnv(productionEnv({
      RLS_ENFORCEMENT: 'off',
      BANK_DATA_ENCRYPTION_KEY: bankKey,
      OBJECT_STORAGE_DRIVER: 's3',
      S3_BUCKET: 'asas-files',
    }))).toThrow('RLS_ENFORCEMENT=off is not allowed in production')
  })
})

describe('reverse-proxy trust boundary', () => {
  it('accepts explicit IPs and CIDR ranges only', () => {
    expect(resolveTrustedProxyCidrs({})).toEqual([])
    expect(resolveTrustedProxyCidrs({ TRUSTED_PROXY_CIDRS: '127.0.0.1, 10.0.0.0/8, 2001:db8::/32, ::1' }))
      .toEqual(['127.0.0.1', '10.0.0.0/8', '2001:db8::/32', '::1'])
    expect(resolveTrustedProxyCidrs({ TRUST_PROXY: 'false' })).toEqual([])
  })

  it('rejects trust-all values and malformed entries', () => {
    for (const value of ['*', 'true', '0.0.0.0/0', '::/0', '0.0.0.0/0, 10.0.0.0/8']) {
      expect(() => resolveTrustedProxyCidrs({ TRUSTED_PROXY_CIDRS: value })).toThrow('Trusting every reverse proxy is unsafe')
    }
    expect(() => resolveTrustedProxyCidrs({ TRUSTED_PROXY_CIDRS: 'proxy.internal' })).toThrow('invalid IP address')
    expect(() => resolveTrustedProxyCidrs({ TRUSTED_PROXY_CIDRS: '10.0.0.0/99' })).toThrow('invalid CIDR range')
    expect(() => resolveTrustedProxyCidrs({ TRUSTED_PROXY_CIDRS: '10.0.0.0/8/extra' })).toThrow('invalid CIDR range')
  })
})
