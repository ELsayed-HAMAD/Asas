import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

/** Decorates the app with a single shared `PrismaClient`, disconnected on server close. */
export async function prismaPlugin(app: FastifyInstance, client: PrismaClient = new PrismaClient()): Promise<void> {
  await client.$connect()
  app.decorate('prisma', client)
  app.addHook('onClose', async () => {
    await client.$disconnect()
  })
}
