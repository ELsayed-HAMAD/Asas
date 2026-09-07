import { readFile } from 'node:fs/promises'
import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import {
  buildPaginationMeta,
  exportJobCreateSchema,
  exportJobListQuerySchema,
  exportJobListResponseSchema,
  exportJobSchema,
  envelope,
  errorResponses,
  idParamSchema,
  type ExportJobKind,
} from '@asas/contracts'
import { requireAuthContext, requireRole } from '../../middlewares/rbac.js'
import { requirePermission } from '../../middlewares/permissions.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import { exportFileExtension, exportFilePath } from '../../services/queue.js'
import { renderEmployeeDirectoryXlsx, renderLedgerXlsx } from '../../services/export.js'
import type { EmployeeDirectoryRow, LedgerRow } from '../../services/export.js'

/**
 * The export surface — job-based bulk exports (employee directory, general ledger) that run
 * through the queue in `services/queue.ts` and land in the `ExportJob` table.
 *
 * Why a job, not a synchronous response: a bulk export reads the *whole* tenant set and renders
 * a file, which can outlive one request and — when `QUEUE_URL` is set — run in a separate
 * worker. The client therefore POSTs a job, polls the row until DONE, then downloads. In the
 * default inline mode the row is DONE before the POST returns, so the round trip still takes
 * one poll; the client is written against the same two-step in both modes.
 *
 * Two handlers are registered with the queue here (not in `app.ts`) because they are the only
 * place the queue's abstract "render a kind into bytes" meets the concrete data: the employee
 * directory reuses the HR salary-visibility rule (an ADMIN export carries salary, a MEMBER's
 * does not — the same gate as the list endpoint), and the ledger is the tenant's full
 * `LedgerTransaction` set in date order, credits negative exactly as stored.
 *
 * The download is a binary stream addressed by job id (`storage/exports/<id>.<ext>`), so it
 * declares no JSON response schema — the same rule the CV preview route follows. Tenant
 * isolation: a job row is read with `{ id, tenantId }`, so a foreign id is a 404, not a leak.
 */

/** Wire projection of an `ExportJob` row: the model's `dataScope` carries the kind. */
function mapExportJob(row: {
  id: string
  filename: string
  dataScope: string | null
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED'
  progressPct: number
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: row.id,
    kind: row.dataScope as ExportJobKind,
    status: row.status,
    progressPct: row.progressPct,
    downloadUrl: `/api/v1/exports/jobs/${row.id}/download`,
    filename: row.filename,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** The tenant's full employee directory, salary present only when the caller may read it. */
async function buildEmployeeDirectory(
  prisma: PrismaClient,
  tenantId: string,
  canReadSalary: boolean,
): Promise<Buffer> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
  const currency = tenant?.currency ?? 'USD'
  const employees = await prisma.employee.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
    include: { department: { select: { name: true } } },
  })
  const rows: EmployeeDirectoryRow[] = employees.map(employee => ({
    name: employee.name,
    title: employee.title,
    status: employee.status,
    department: employee.department?.name ?? null,
    location: employee.location,
    email: employee.email,
    hiredAt: employee.hiredAt ? employee.hiredAt.toISOString().slice(0, 10) : null,
    salary: canReadSalary ? (employee.salary?.toString() ?? null) : null,
    currency,
  }))
  return renderEmployeeDirectoryXlsx(rows)
}

/** The tenant's full general ledger in date order; the ledger's signed amounts, as stored. */
async function buildLedger(prisma: PrismaClient, tenantId: string): Promise<Buffer> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
  const currency = tenant?.currency ?? 'USD'
  const transactions = await prisma.ledgerTransaction.findMany({
    where: { tenantId },
    orderBy: { date: 'asc' },
  })
  const rows: LedgerRow[] = transactions.map(tx => ({
    date: tx.date.toISOString().slice(0, 10),
    description: tx.description,
    status: tx.status,
    amount: tx.amount.toString(),
    currency,
  }))
  return renderLedgerXlsx(rows)
}

/**
 * Register the queue's two export handlers. Called from `buildApp` after the queue plugin is
 * up, so the handlers are present before the first job could dispatch (inline or boss).
 */
export function registerExportHandlers(queue: { register: (kind: string, handler: (data: unknown) => Promise<Buffer>) => void }): void {
  queue.register('employees', async data => {
    const { prisma, tenantId, canReadSalary } = data as { prisma: PrismaClient; tenantId: string; canReadSalary: boolean }
    return buildEmployeeDirectory(prisma, tenantId, canReadSalary)
  })
  queue.register('ledger', async data => {
    const { prisma, tenantId } = data as { prisma: PrismaClient; tenantId: string }
    return buildLedger(prisma, tenantId)
  })
}

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>()

  /** List this tenant's export jobs, newest first. */
  server.get(
    '/jobs',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        querystring: exportJobListQuerySchema,
        response: { 200: envelope(exportJobListResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const prisma = request.server.prisma
      const query = request.query
      const [items, total] = await Promise.all([
        prisma.exportJob.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        prisma.exportJob.count({ where: { tenantId } }),
      ])
      return { data: { items: items.map(mapExportJob), pagination: buildPaginationMeta(query, total), summary: null } }
    },
  )

  /** One job's status — the poll target after creating a job. */
  server.get(
    '/jobs/:id',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        params: idParamSchema,
        response: { 200: envelope(exportJobSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId } = requireAuthContext(request)
      const job = await request.server.prisma.exportJob.findFirst({
        where: { id: request.params.id, tenantId },
      })
      if (!job) {
        reply.code(404)
        return { error: { message: 'Export job not found' } }
      }
      return { data: mapExportJob(job) }
    },
  )

  /**
   * Create an export job. Inline mode (default) resolves DONE before this returns; boss mode
   * returns it QUEUED and the client polls. `employee.write` is the gate: the employee
   * directory is HR data, and a MEMBER's copy is salary-redacted to match the list endpoint.
   */
  server.post(
    '/jobs',
    {
      preHandler: requirePermission('employee.write'),
      schema: {
        body: exportJobCreateSchema,
        response: { 202: envelope(exportJobSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, role } = requireAuthContext(request)
      const prisma = request.server.prisma
      const canReadSalary = role === 'ADMIN' || role === 'OWNER'

      const jobId = await request.server.exportQueue.submit(
        request.body.kind,
        { prisma, tenantId, canReadSalary },
        tenantId,
      )

      const job = await prisma.exportJob.findFirstOrThrow({ where: { id: jobId, tenantId } })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr'), moduleKeyPrefix('finance')])
      reply.code(202)
      return { data: mapExportJob(job) }
    },
  )

  /**
   * Download a completed job's file. Binary, addressed by job id — no JSON response schema.
   * A 404 covers both a job the caller does not own and a job that has not produced a file
   * yet (or whose file is gone); the UI polls to DONE before calling this, so the not-ready
   * case is a client error, not a race.
   */
  server.get(
    '/jobs/:id/download',
    {
      preHandler: requireRole('MEMBER'),
      schema: { params: idParamSchema, ...({} as object) },
    },
    async (request, reply) => {
      const { tenantId } = requireAuthContext(request)
      const job = await request.server.prisma.exportJob.findFirst({
        where: { id: request.params.id, tenantId },
      })
      if (!job) {
        reply.code(404)
        return { error: { message: 'Export job not found' } }
      }
      if (job.status !== 'DONE') {
        reply.code(409)
        return { error: { message: `Export is still ${job.status.toLowerCase()}; not ready to download` } }
      }

      const extension = exportFileExtension(job.dataScope ?? '')
      let bytes: Buffer | null
      try {
        bytes = await readFile(exportFilePath(job.id, extension))
      } catch {
        bytes = null
      }
      if (!bytes) {
        reply.code(404)
        return { error: { message: 'Export file not found' } }
      }

      reply
        .code(200)
        .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('content-disposition', `attachment; filename="${job.filename}"`)
        .header('content-length', bytes.length)
      return reply.send(bytes)
    },
  )
}
