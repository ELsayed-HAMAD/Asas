import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { assertEnv, loadEnv } from './config/env.js'
import { buildApp } from './app.js'
import { generateStalePunchExceptions, syncApprovedLeaveEmployeeStatuses } from './modules/hr/attendance.service.js'

// Note on the maintenance sweep below: it is safe to run on several replicas at once.
// generateStalePunchExceptions claims punches with FOR UPDATE ... SKIP LOCKED, and
// syncApprovedLeaveEmployeeStatuses is an idempotent UPDATE, so overlap wastes work but
// cannot corrupt data — no leader election is required.

/**
 * Boot the API. Reads the environment, validates it, builds the app, and starts listening.
 * Kept separate from `buildApp` so tests can exercise the app without a live port.
 */
async function main(): Promise<void> {
  const environment = assertEnv(loadEnv())
  const prisma = new PrismaClient()
  const app = await buildApp(environment, { prisma })
  // Not boot-fatal — a single replica runs fine without either — but both are silently
  // assumed by a multi-replica deployment (REVIEW.md finding F5), so make them impossible
  // to miss in the production log.
  if (environment.isProduction && !environment.redisUrl) {
    app.log.warn('REDIS_URL is not set: rate limits are in-memory and SSE cache invalidation will not fan out to other replicas')
  }
  if (environment.isProduction && !environment.queueUrl) {
    app.log.warn('QUEUE_URL is not set: exports and transactional email run inline in-process instead of on pg-boss')
  }
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
