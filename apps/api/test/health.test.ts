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
})
