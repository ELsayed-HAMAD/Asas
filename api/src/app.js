import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import { env } from './config/env.js'
import { prismaPlugin } from './plugins/prisma.js'
import { errorHandler } from './middlewares/errorHandler.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { tenantRoutes } from './modules/tenant/tenant.routes.js'
import { onboardingRoutes } from './modules/onboarding/onboarding.routes.js'
import { hrRoutes } from './modules/hr/hr.routes.js'
import { financeRoutes } from './modules/finance/finance.routes.js'
import { crmRoutes } from './modules/crm/crm.routes.js'
import { inventoryRoutes } from './modules/inventory/inventory.routes.js'
import { projectsRoutes } from './modules/projects/projects.routes.js'
import { settingsRoutes } from './modules/settings/settings.routes.js'
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js'
import { supportRoutes } from './modules/support/support.routes.js'

export async function buildApp() {
  const app = Fastify({ logger: true })
  app.setErrorHandler(errorHandler)
  await app.register(cors, { origin: env.frontendOrigin.split(',').map(value => value.trim()), credentials: true })
  await app.register(jwt, { secret: env.jwtSecret })
  await prismaPlugin(app)
  app.get('/health', async () => ({ data: { status: 'ok' } }))
  await app.register(authRoutes, { prefix: '/api/v1/auth' })
  await app.register(tenantRoutes, { prefix: '/api/v1/tenant' })
  await app.register(onboardingRoutes, { prefix: '/api/v1/onboarding' })
  await app.register(hrRoutes, { prefix: '/api/v1/hr' })
  await app.register(financeRoutes, { prefix: '/api/v1/finance' })
  await app.register(crmRoutes, { prefix: '/api/v1/crm' })
  await app.register(inventoryRoutes, { prefix: '/api/v1/inventory' })
  await app.register(projectsRoutes, { prefix: '/api/v1/projects' })
  await app.register(settingsRoutes, { prefix: '/api/v1/settings' })
  await app.register(dashboardRoutes, { prefix: '/api/v1/dashboard' })
  await app.register(supportRoutes, { prefix: '/api/v1/support' })
  return app
}
