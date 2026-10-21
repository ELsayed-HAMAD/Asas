import { describe, expect, it, vi } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadEnv } from '../src/config/env.js'

describe('Auth providers and dev social login', () => {
  it('reports provider status accurately in development', async () => {
    const env = loadEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://mock:mock@localhost:5432/db',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
    })

    const mockPrisma = {
      $connect: async () => {},
      $disconnect: async () => {},
      $queryRaw: async () => [{ 1: 1 }],
      user: {
        findUnique: async () => null,
        create: async (args: any) => ({ id: 'usr_123', email: args.data.email, name: args.data.name }),
      },
      account: {
        findFirst: async () => null,
        create: async () => ({ id: 'acc_123' }),
      },
      member: {
        findFirst: async () => null,
      },
      session: {
        create: async (args: any) => ({ id: 'sess_123', ...args.data }),
      },
    }

    const app = await buildApp(env, {
      prisma: mockPrisma as any,
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/providers',
    })

    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.data).toEqual({
      google: false,
      apple: false,
      email: false,
      devAuthAllowed: false,
    })

    await app.close()
  })

  it('reports google and apple as true when client credentials are set', async () => {
    const env = loadEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://mock:mock@localhost:5432/db',
      GOOGLE_CLIENT_ID: 'google-client-id-123',
      GOOGLE_CLIENT_SECRET: 'google-secret-456',
      APPLE_CLIENT_ID: 'apple-client-id-789',
      APPLE_CLIENT_SECRET: 'apple-secret-012',
      DEV_SOCIAL_AUTH_ENABLED: 'true',
    })

    const mockPrisma = {
      $connect: async () => {},
      $disconnect: async () => {},
      $queryRaw: async () => [{ 1: 1 }],
      user: {
        findUnique: async () => null,
        create: async (args: any) => ({ id: 'usr_123', email: args.data.email, name: args.data.name }),
      },
      account: {
        findFirst: async () => null,
        create: async () => ({ id: 'acc_123' }),
      },
      member: {
        findFirst: async () => null,
      },
      session: {
        create: async (args: any) => ({ id: 'sess_123', ...args.data }),
      },
    }

    const app = await buildApp(env, {
      prisma: mockPrisma as any,
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/providers',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data).toEqual({
      google: true,
      apple: true,
      email: false,
      devAuthAllowed: true,
    })

    await app.close()
  })

  it('blocks dev-social-login in production with 403 Forbidden', async () => {
    const env = loadEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://mock:mock@localhost:5432/db',
      AUTH_SECRET: '01234567890123456789012345678901',
      FRONTEND_ORIGIN: 'https://app.asas.local',
    })

    const mockPrisma = {
      $connect: async () => {},
      $disconnect: async () => {},
      $queryRaw: async () => [{ 1: 1 }],
      user: {
        findUnique: async () => null,
        create: async (args: any) => ({ id: 'usr_123', email: args.data.email, name: args.data.name }),
      },
      account: {
        findFirst: async () => null,
        create: async () => ({ id: 'acc_123' }),
      },
      member: {
        findFirst: async () => null,
      },
      session: {
        create: async (args: any) => ({ id: 'sess_123', ...args.data }),
      },
    }

    const app = await buildApp(env, {
      prisma: mockPrisma as any,
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/dev-social-login',
      payload: {
        provider: 'google',
        email: 'alex@example.com',
      },
    })

    expect(res.statusCode).toBe(403)
    await app.close()
  })

  it('blocks arbitrary-email social login by default in development', async () => {
    const env = loadEnv({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://mock:mock@localhost:5432/db' })
    const findUser = vi.fn()
    const mockPrisma = {
      $connect: async () => {},
      $disconnect: async () => {},
      $queryRaw: async () => [{ 1: 1 }],
      user: { findUnique: findUser, create: vi.fn() },
      account: { findFirst: vi.fn(), create: vi.fn() },
      member: { findFirst: vi.fn() },
      session: { create: vi.fn() },
    }
    const app = await buildApp(env, { prisma: mockPrisma as any })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/dev-social-login',
      payload: { provider: 'google', email: 'arbitrary@example.com' },
    })

    expect(res.statusCode).toBe(403)
    expect(findUser).not.toHaveBeenCalled()
    await app.close()
  })

  it('successfully creates session and cookie in development mode', async () => {
    const env = loadEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://mock:mock@localhost:5432/db',
      AUTH_SECRET: '01234567890123456789012345678901',
      DEV_SOCIAL_AUTH_ENABLED: 'true',
    })

    const mockPrisma = {
      $connect: async () => {},
      $disconnect: async () => {},
      $queryRaw: async () => [{ 1: 1 }],
      user: {
        findUnique: async () => null,
        create: async (args: any) => ({ id: 'usr_test_1', email: args.data.email, name: args.data.name }),
      },
      account: {
        findFirst: async () => null,
        create: async () => ({ id: 'acc_test_1' }),
      },
      member: {
        findFirst: async () => null,
      },
      session: {
        create: async (args: any) => ({ id: 'sess_test_1', ...args.data }),
      },
    }

    const app = await buildApp(env, {
      prisma: mockPrisma as any,
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/dev-social-login',
      payload: {
        provider: 'google',
        email: 'hamad@asas-enterprise.io',
        name: 'Hamad Elsayed',
      },
    })

    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.data.success).toBe(true)
    expect(json.data.user.email).toBe('hamad@asas-enterprise.io')
    expect(json.data.redirectUrl).toBe('/onboarding')
    expect(res.headers['set-cookie']).toContain('better-auth.session_token=')

    await app.close()
  })
})
