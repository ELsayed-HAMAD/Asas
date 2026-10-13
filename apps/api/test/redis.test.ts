import { describe, expect, it, vi } from 'vitest'
import { createRedisClient } from '../src/lib/redis.js'
import { publish, initSseRedis, closeSseRedis } from '../src/plugins/sse.js'
import { buildApp } from '../src/app.js'
import { loadEnv } from '../src/config/env.js'

describe('Redis & Distributed SSE Architecture', () => {
  it('creates an ioredis instance with lazy connect and error handler', () => {
    const client = createRedisClient('redis://127.0.0.1:6379', 'test-redis')
    expect(client).toBeDefined()
    expect(client.options.lazyConnect).toBe(true)
    client.disconnect()
  })

  it('delivers SSE invalidation without error when redis is absent (in-memory mode)', () => {
    expect(() => {
      publish('tenant_test_123', ['asas,finance'])
    }).not.toThrow()
  })

  it('initializes and closes SSE redis without throwing even if offline', async () => {
    initSseRedis('redis://127.0.0.1:6399')
    expect(() => {
      publish('tenant_test_123', ['asas,hr'])
    }).not.toThrow()
    await expect(closeSseRedis()).resolves.toBeUndefined()
  })

  it('builds fastify app with rate limiting and in-memory fallback when redis is not configured', async () => {
    const env = loadEnv({ NODE_ENV: 'test', DATABASE_URL: 'mock', AUTH_SECRET: 'test-secret' })
    expect(env.redisUrl).toBe('')
    const app = await buildApp(env)
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
    await app.close()
  })
})
