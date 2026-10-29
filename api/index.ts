import type { IncomingMessage, ServerResponse } from 'node:http'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../apps/api/dist/app.js'
import { assertEnv, loadEnv } from '../apps/api/dist/config/env.js'

type App = Awaited<ReturnType<typeof buildApp>>

// Reuse the app and the Prisma pool across warm invocations. A cold invocation builds the
// Fastify instance once; `app.listen` is never called because Vercel owns the HTTP server.
const prisma = new PrismaClient({ log: ['error'] })
let appPromise: Promise<App> | null = null

function getApp(): Promise<App> {
  if (!appPromise) {
    appPromise = (async () => {
      const environment = assertEnv(loadEnv())
      const app = await buildApp(environment, { prisma })
      await app.ready()
      return app
    })()
  }
  return appPromise
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const app = await getApp()
    app.server.emit('request', request, response)
  } catch (error) {
    console.error('API failed to start', error)
    response.statusCode = 500
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ error: { message: 'API failed to start' } }))
  }
}
