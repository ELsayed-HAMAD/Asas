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
export async function prismaPlugin(
  app: FastifyInstance,
  client: PrismaClient = new PrismaClient(),
  tenantGuardEnabled = true,
): Promise<void> {
  const guarded = tenantGuardEnabled ? applyTenantGuard(client) : client
  await guarded.$connect()
  app.decorate('prisma', guarded)
  app.addHook('onClose', async () => {
    await guarded.$disconnect()
  })
}
