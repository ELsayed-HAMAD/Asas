import { describe, expect, it } from 'vitest'
import { assertEnv, loadEnv } from '../src/config/env.js'

describe('email environment', () => {
  it('loads Resend credentials and sender separately', () => {
    const env = loadEnv({ RESEND_API_KEY: 're_test_key', MAIL_FROM: 'Asas <mail@example.com>' })
    expect(env.resendApiKey).toBe('re_test_key')
    expect(env.mailFrom).toBe('Asas <mail@example.com>')
  })

  it('requires an explicit sender when Resend is configured in production', () => {
    expect(() => assertEnv(loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db', AUTH_SECRET: 'secret', RESEND_API_KEY: 're_test_key', OBJECT_STORAGE_DRIVER: 's3', S3_BUCKET: 'asas-files' })))
      .toThrow('Missing required environment variable: MAIL_FROM')
    expect(() => assertEnv(loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db', AUTH_SECRET: 'secret', RESEND_API_KEY: 're_test_key', MAIL_FROM: 'Asas <mail@example.com>', OBJECT_STORAGE_DRIVER: 's3', S3_BUCKET: 'asas-files' })))
      .not.toThrow()
  })

  it('enforces HTTPS for FRONTEND_ORIGIN in production', () => {
    expect(() => assertEnv(loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db', AUTH_SECRET: 'secret', OBJECT_STORAGE_DRIVER: 's3', S3_BUCKET: 'asas-files', FRONTEND_ORIGIN: 'http://insecure.example.com' })))
      .toThrow('FRONTEND_ORIGIN must use HTTPS in production to prevent cookie leakage over plaintext')
    expect(() => assertEnv(loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db', AUTH_SECRET: 'secret', OBJECT_STORAGE_DRIVER: 's3', S3_BUCKET: 'asas-files', FRONTEND_ORIGIN: 'https://app.asas.com' })))
      .not.toThrow()
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
    expect(() => assertEnv(loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db', AUTH_SECRET: 'secret' })))
      .toThrow('OBJECT_STORAGE_DRIVER=s3 is required in production')
  })
})

describe('Stripe billing environment', () => {
  it('loads configured monthly price IDs without logging or exposing keys', () => {
    const env = loadEnv({ DATABASE_URL: 'postgres://db', STRIPE_SECRET_KEY: 'sk_test_private', STRIPE_WEBHOOK_SECRET: 'whsec_private', STRIPE_PRICE_IDS: 'price_basic, price_pro' })
    expect(env.stripePriceIds).toEqual(['price_basic', 'price_pro'])
    expect(() => assertEnv(env)).not.toThrow()
  })

  it('requires paired API and webhook secrets and validates price IDs', () => {
    expect(() => assertEnv(loadEnv({ DATABASE_URL: 'postgres://db', STRIPE_SECRET_KEY: 'sk_test_private' }))).toThrow('must be configured together')
    expect(() => assertEnv(loadEnv({ DATABASE_URL: 'postgres://db', STRIPE_WEBHOOK_SECRET: 'whsec_private' }))).toThrow('must be configured together')
    expect(() => assertEnv(loadEnv({ DATABASE_URL: 'postgres://db', STRIPE_SECRET_KEY: 'sk_test_private', STRIPE_WEBHOOK_SECRET: 'whsec_private', STRIPE_PRICE_IDS: 'monthly' }))).toThrow('Stripe Price IDs')
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

