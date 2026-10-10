import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { assertEnv, loadEnv } from './config/env.js'
import { buildApp } from './app.js'
import { syncApprovedLeaveEmployeeStatuses } from './modules/hr/attendance.service.js'

/**
 * Boot the API. Reads the environment, validates it, builds the app, and starts listening.
 * Kept separate from `buildApp` so tests can exercise the app without a live port.
 */
async function main(): Promise<void> {
  const environment = assertEnv(loadEnv())
  const prisma = new PrismaClient()
  const app = await buildApp(environment, { prisma })
  const syncLeaveStatuses = async () => {
    try {
      const changed = await syncApprovedLeaveEmployeeStatuses(prisma)
      if (changed.started || changed.ended) app.log.info({ ...changed }, 'Synchronized approved leave dates to employee status')
    } catch (error) {
      app.log.error(error, 'Failed to synchronize approved leave dates')
    }
  }
  await syncLeaveStatuses()
  const leaveStatusTimer = setInterval(() => { void syncLeaveStatuses() }, 15 * 60 * 1000)
  leaveStatusTimer.unref()
  let stopping = false
  async function shutdown(): Promise<void> {
    if (stopping) return
    stopping = true
    clearInterval(leaveStatusTimer)
    const deadline = setTimeout(() => process.exit(1), 15_000)
    deadline.unref()
    try {
      await app.close()
      await prisma.$disconnect()
      clearTimeout(deadline)
      process.exit(0)
    } catch (error) {
      app.log.error(error)
      process.exit(1)
    }
  }
  process.once('SIGINT', () => { void shutdown() })
  process.once('SIGTERM', () => { void shutdown() })

  try {
    await app.listen({ port: environment.port, host: environment.host })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

void main()
