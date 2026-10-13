import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { assertEnv, loadEnv } from './config/env.js'
import { buildApp } from './app.js'
import { generateStalePunchExceptions, syncApprovedLeaveEmployeeStatuses } from './modules/hr/attendance.service.js'

/**
 * Boot the API. Reads the environment, validates it, builds the app, and starts listening.
 * Kept separate from `buildApp` so tests can exercise the app without a live port.
 */
async function main(): Promise<void> {
  const environment = assertEnv(loadEnv())
  const prisma = new PrismaClient()
  const app = await buildApp(environment, { prisma })
  let attendanceMaintenanceRunning = false
  const runAttendanceMaintenance = async () => {
    if (attendanceMaintenanceRunning) return
    attendanceMaintenanceRunning = true
    try {
      const changed = await syncApprovedLeaveEmployeeStatuses(prisma)
      if (changed.started || changed.ended) app.log.info({ ...changed }, 'Synchronized approved leave dates to employee status')
    } catch (error) {
      app.log.error(error, 'Failed to synchronize approved leave dates')
    }
    try {
      const created = await generateStalePunchExceptions(prisma)
      if (created) app.log.info({ created }, 'Detected stale open attendance punches')
    } catch (error) {
      app.log.error(error, 'Failed to detect stale open attendance punches')
    } finally {
      attendanceMaintenanceRunning = false
    }
  }
  await runAttendanceMaintenance()
  const attendanceMaintenanceTimer = setInterval(() => { void runAttendanceMaintenance() }, 15 * 60 * 1000)
  attendanceMaintenanceTimer.unref()
  let stopping = false
  async function shutdown(): Promise<void> {
    if (stopping) return
    stopping = true
    clearInterval(attendanceMaintenanceTimer)
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
