import { PrismaClient } from '@prisma/client'
import { assertEnv, loadEnv } from './config/env.js'
import { buildApp } from './app.js'

/**
 * Boot the API. Reads the environment, validates it, builds the app, and starts listening.
 * Kept separate from `buildApp` so tests can exercise the app without a live port.
 */
async function main(): Promise<void> {
  const environment = assertEnv(loadEnv())
  const prisma = new PrismaClient()
  const app = await buildApp(environment, { prisma })

  try {
    await app.listen({ port: environment.port, host: environment.host })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

void main()
