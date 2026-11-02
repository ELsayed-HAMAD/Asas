import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { applyTenantGuard } from '../services/tenantGuard.js'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

/**
 * Decorates the app with a single shared `PrismaClient`, disconnected on server close.
 *
 * The client is wrapped in the application-level tenant guard. `tenantGuardEnabled` exists
 * only for local diagnostics and non-production maintenance commands; production rejects
 * `RLS_ENFORCEMENT=off` during environment validation.
 */

/** Neon suspends compute after idle; the first connection can be rejected while it wakes. */
const RETRYABLE_CONNECT_CODES = new Set(['P1001', 'P1002'])
const CONNECT_ATTEMPTS = 3
const CONNECT_BACKOFF_MS = [1_000, 2_000]

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function connectWithRetry(client: PrismaClient, attempts = CONNECT_ATTEMPTS): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await client.$connect()
      return
    } catch (error) {
      const code = (error as { errorCode?: string }).errorCode
      if (attempt >= attempts || !code || !RETRYABLE_CONNECT_CODES.has(code)) throw error
      await sleep(CONNECT_BACKOFF_MS[attempt - 1] ?? 4_000)
    }
  }
}

export async function prismaPlugin(
  app: FastifyInstance,
  client: PrismaClient = new PrismaClient(),
  tenantGuardEnabled = true,
): Promise<void> {
  const guarded = tenantGuardEnabled ? applyTenantGuard(client) : client
  await connectWithRetry(guarded)
  app.decorate('prisma', guarded)
  app.addHook('onClose', async () => {
    await guarded.$disconnect()
  })
}
