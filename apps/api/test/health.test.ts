import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadEnv } from '../src/config/env.js'

const apps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map(app => app.close()))
})

describe('health probe', () => {
  it('responds ok without touching the database', async () => {
    const app = await buildApp(loadEnv(), { logger: false })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ data: { status: 'ok' } })
  }, 15_000)

  it('serves the OpenAPI document and UI', async () => {
    const app = await buildApp(loadEnv(), { logger: false })
    apps.push(app)

    const openapi = await app.inject({ method: 'GET', url: '/docs/json' })
    expect(openapi.statusCode).toBe(200)

    const ui = await app.inject({ method: 'GET', url: '/docs/' })
    expect(ui.statusCode).toBe(200)
  })

  it('responds ok on /ready when database is disabled', async () => {
    const app = await buildApp(loadEnv({ RESEND_API_KEY: undefined }), { logger: false })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/ready' })
    expect(response.statusCode).toBe(200)
    const json = response.json()
    expect(json.data.status).toBe('ok')
    expect(json.data.database).toBe('disabled')
    expect(json.data.emailDelivery).toBe('disabled')
    expect(json.data.objectStorage).toBe('local')
    expect(typeof json.data.uptime).toBe('number')
  })

  it('reports configured email delivery without exposing provider secrets', async () => {
    const env = loadEnv({ RESEND_API_KEY: 're_test_secret', MAIL_FROM: 'Asas <mail@example.com>' })
    const app = await buildApp(env, { logger: false })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/ready' })
    expect(response.statusCode).toBe(200)
    expect(response.json().data.emailDelivery).toBe('configured')
    expect(response.body).not.toContain('re_test_secret')
  })

  it('reports the selected object-storage driver without checking or exposing credentials', async () => {
    const env = loadEnv({ OBJECT_STORAGE_DRIVER: 's3', S3_BUCKET: 'private-test-bucket', S3_ACCESS_KEY_ID: 'test-access', S3_SECRET_ACCESS_KEY: 'test-secret' })
    const app = await buildApp(env, { logger: false })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/ready' })
    expect(response.statusCode).toBe(200)
    expect(response.json().data.objectStorage).toBe('s3')
    expect(response.body).not.toContain('test-secret')
  })

  it('checks database connectivity on /ready when prisma is supplied', async () => {
    const mockPrisma = {
      $queryRaw: async () => [{ '?column?': 1 }],
      $connect: async () => {},
      $disconnect: async () => {},
    } as any

    const app = await buildApp(loadEnv(), { logger: false, prisma: mockPrisma })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/ready' })
    expect(response.statusCode).toBe(200)
    const json = response.json()
    expect(json.data.status).toBe('ok')
    expect(json.data.database).toBe('connected')
  })

  it('returns 503 on /ready when database connection fails', async () => {
    const mockPrisma = {
      $queryRaw: async () => { throw new Error('Database unreachable') },
      $connect: async () => {},
      $disconnect: async () => {},
    } as any

    const app = await buildApp(loadEnv(), { logger: false, prisma: mockPrisma })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/ready' })
    expect(response.statusCode).toBe(503)
    const json = response.json()
    expect(json.data.status).toBe('unhealthy')
    expect(json.data.database).toBe('disconnected')
    expect(json.data.error).toBe('Database unreachable')
  })
})
