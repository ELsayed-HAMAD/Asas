import { Prisma, type PrismaClient } from '@prisma/client'
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
import { recordAuditLog } from '../../services/auditLog.js'
import { exportContentType, exportFileExtension, type ExportHandler } from '../../services/queue.js'
import { exportObjectKey } from '../../services/objectStorage.js'
import { renderEmployeeDirectoryXlsx, renderLedgerXlsx, renderProjectsXlsx } from '../../services/export.js'
import type { EmployeeDirectoryRow, LedgerRow, ProjectExportRow } from '../../services/export.js'

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
 * Downloading carries the same `employee.write` gate as creating, since an export may carry
 * salaries; both are recorded in the audit log.
 *
 * The queue payload is plain data only (`{ canReadSalary }`) — it is JSON-serialised into
 * pg-boss in boss mode. Handlers use the app's Prisma client (captured at registration) and
 * read the owning `tenantId` from the `ExportJob` row, never from the payload.
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
    where: { tenantId, status: { not: 'ARCHIVED' } },
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

/** The tenant's full general ledger in date order; queries real JournalEntry accounting rows when present. */
async function buildLedger(prisma: PrismaClient, tenantId: string): Promise<Buffer> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
  const currency = tenant?.currency ?? 'USD'

  // Query real JournalEntry and JournalLine records
  const journalEntries = typeof prisma.journalEntry?.findMany === 'function'
    ? await prisma.journalEntry.findMany({
        where: { tenantId },
        include: { lines: { include: { account: true } } },
        orderBy: { postedAt: 'asc' },
      })
    : []

  if (journalEntries.length > 0) {
    const rows: LedgerRow[] = journalEntries.map(entry => ({
      date: entry.postedAt.toISOString().slice(0, 10),
      description: entry.description,
      status: entry.sourceType,
      amount: (entry.baseAmount ?? entry.amount).toString(),
      currency: entry.baseCurrency ?? entry.currency ?? currency,
    }))
    return renderLedgerXlsx(rows)
  }

  // Fallback to legacy LedgerTransaction for workspaces with only sample data
  const transactions = typeof prisma.ledgerTransaction?.findMany === 'function'
    ? await prisma.ledgerTransaction.findMany({
        where: { tenantId },
        orderBy: { date: 'asc' },
      })
    : []
  const rows: LedgerRow[] = transactions.map(tx => ({
    date: tx.date.toISOString().slice(0, 10),
    description: tx.description,
    status: tx.status,
    amount: tx.amount.toString(),
    currency,
  }))
  return renderLedgerXlsx(rows)
}

/** The tenant's full project portfolio, calculating true aggregated spend from source financial records (Finding 18). */
async function buildProjects(prisma: PrismaClient, tenantId: string): Promise<Buffer> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
  const currency = tenant?.currency ?? 'USD'
  const projects = await prisma.project.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
    include: {
      department: { select: { name: true } },
      _count: { select: { sprints: true } },
    },
  })

  // Load true project spend from posted settlements net of reversals (Finding 18)
  const spendMap = new Map<string, string>()
  try {
    const settlements = await prisma.$queryRaw<Array<{ projectId: string | null; spent: number }>>`
      WITH settlements AS (
        SELECT p."projectId", j."baseAmount", r."baseAmount" AS "reversalBaseAmount", r."id" AS "reversalId"
        FROM "PayableInvoice" p JOIN "JournalEntry" j ON j."payableInvoiceId" = p."id" AND j."tenantId" = p."tenantId" AND j."sourceType" = 'AP_PAYMENT'
        LEFT JOIN "JournalEntry" r ON r."reversesJournalEntryId" = j."id" AND r."tenantId" = j."tenantId"
        WHERE p."tenantId" = ${tenantId}
        UNION ALL
        SELECT e."projectId", j."baseAmount", r."baseAmount" AS "reversalBaseAmount", r."id" AS "reversalId"
        FROM "Expense" e JOIN "JournalEntry" j ON j."expenseId" = e."id" AND j."tenantId" = e."tenantId" AND j."sourceType" = 'EXPENSE_REIMBURSEMENT'
        LEFT JOIN "JournalEntry" r ON r."reversesJournalEntryId" = j."id" AND r."tenantId" = j."tenantId"
        WHERE e."tenantId" = ${tenantId}
      )
      SELECT "projectId", COALESCE(SUM(CASE WHEN "baseAmount" IS NOT NULL AND ("reversalId" IS NULL OR "reversalBaseAmount" IS NOT NULL) THEN "baseAmount" - COALESCE("reversalBaseAmount", 0) ELSE 0 END), 0)::numeric AS spent
      FROM settlements WHERE "projectId" IS NOT NULL GROUP BY "projectId"
    `
    for (const s of settlements) {
      if (s.projectId) spendMap.set(s.projectId, s.spent.toString())
    }
  } catch {
    // If settlements query is unavailable in test mocks, fallback to stored spent
  }

  const rows: ProjectExportRow[] = projects.map(proj => ({
    name: proj.name,
    status: proj.status,
    department: proj.department?.name ?? null,
    budget: proj.budget ? proj.budget.toString() : null,
    spent: spendMap.get(proj.id) ?? (proj.spent ? proj.spent.toString() : '0'),
    currency,
    sprintsCount: proj._count.sprints,
  }))
  return renderProjectsXlsx(rows)
}

const EXCLUDED_EXPORT_MODELS = new Set(['Account', 'Session', 'TwoFactor', 'Verification'])
const SENSITIVE_EXPORT_FIELD = /password|secret|token|credential|private.?key|api.?key|client.?secret/i
const EXPORT_USER_FIELDS = ['id', 'name', 'email', 'emailVerified', 'createdAt', 'updatedAt'] as const
type ExportQueryDelegate = {
  findMany(args: { where: Record<string, unknown>; select: Record<string, boolean> }): Promise<Record<string, unknown>[]>
}

/** Build an explicit tenant predicate for models that reach a tenant through parent rows. */
function tenantScopeForModel(modelName: string, visited = new Set<string>()): Record<string, unknown> | null {
  if (visited.has(modelName)) return null
  const model = Prisma.dmmf.datamodel.models.find(candidate => candidate.name === modelName)
  if (!model) return null
  if (model.fields.some(field => field.name === 'tenantId')) return { tenantId: '__TENANT_ID__' }

  const nextVisited = new Set(visited).add(modelName)
  const parentScopes = model.fields
    .filter(field => field.kind === 'object' && !field.isList)
    .map(field => ({ name: field.name, scope: tenantScopeForModel(field.type, nextVisited) }))
    .filter((entry): entry is { name: string; scope: Record<string, unknown> } => entry.scope !== null)

  if (parentScopes.length === 0) return null
  const relationFilters = parentScopes.map(({ name, scope }) => ({ [name]: scope }))
  return relationFilters.length === 1 ? relationFilters[0]! : { AND: relationFilters }
}

function replaceTenantPlaceholder(filter: Record<string, unknown>, tenantId: string): Record<string, unknown> {
  if (filter.tenantId === '__TENANT_ID__') return { tenantId }
  return Object.fromEntries(Object.entries(filter).map(([key, value]) => [
    key,
    Array.isArray(value)
      ? value.map(entry => replaceTenantPlaceholder(entry as Record<string, unknown>, tenantId))
      : value && typeof value === 'object'
        ? replaceTenantPlaceholder(value as Record<string, unknown>, tenantId)
        : value,
  ]))
}

function redactNestedSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactNestedSecrets)
  if (!value || typeof value !== 'object') return value
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return value
  return Object.fromEntries(Object.entries(value)
    .filter(([field]) => !SENSITIVE_EXPORT_FIELD.test(field))
    .map(([field, child]) => [field, redactNestedSecrets(child)]))
}

/** Full tenant data archive. Authenticator secrets, sessions, passwords, and credentials are excluded. */
export async function buildWorkspaceArchive(prisma: PrismaClient, tenantId: string): Promise<Buffer> {
  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) throw new Error('Workspace not found')

    const models = Prisma.dmmf.datamodel.models.filter(model =>
      !EXCLUDED_EXPORT_MODELS.has(model.name)
      && model.name !== 'Tenant'
      && model.name !== 'User'
      && tenantScopeForModel(model.name) !== null,
    )
    const delegates = tx as unknown as Record<string, ExportQueryDelegate>
    const modelRecords = await Promise.all(models.map(async (model) => {
      const delegateName = model.name[0]!.toLowerCase() + model.name.slice(1)
      const delegate = delegates[delegateName]
      if (!delegate || typeof delegate.findMany !== 'function') {
        throw new Error(`Workspace export is missing the Prisma delegate for ${model.name}`)
      }
      const select = Object.fromEntries(model.fields
        .filter(field => (field.kind === 'scalar' || field.kind === 'enum') && !SENSITIVE_EXPORT_FIELD.test(field.name))
        .map(field => [field.name, true]))
      const where = replaceTenantPlaceholder(tenantScopeForModel(model.name)!, tenantId)
      const records = await delegate.findMany({ where, select })
      return [model.name, records.map(record => redactNestedSecrets(record))] as const
    }))

    const users = await tx.user.findMany({
      where: { members: { some: { tenantId } } },
      select: Object.fromEntries(EXPORT_USER_FIELDS.map(field => [field, true])),
    })
    const data: Record<string, unknown> = {
      Tenant: redactNestedSecrets(tenant),
      UserIdentity: users,
      ...Object.fromEntries(modelRecords),
    }
    const counts = Object.fromEntries(modelRecords.map(([modelName, records]) => [modelName, records.length]))

    const archive = {
      metadata: {
        version: '2.0.0',
        tenantId,
        workspaceName: tenant.name,
        exportedAt: new Date().toISOString(),
        modelCounts: counts,
        redactions: 'Authentication records and secret or credential fields are omitted.',
      },
      data,
    }

    return Buffer.from(JSON.stringify(archive, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2), 'utf8')
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    maxWait: 10_000,
    timeout: 120_000,
  })
}

/**
 * Register the queue's export handlers. Called from `buildApp` after the queue plugin is
 * up, so the handlers are present before the first job could dispatch (inline or boss).
 */
export function registerExportHandlers(
  queue: { register: (kind: string, handler: ExportHandler) => void },
  prisma: PrismaClient,
): void {
  async function jobTenantId(jobId: string): Promise<string> {
    const job = await prisma.exportJob.findUnique({ where: { id: jobId }, select: { tenantId: true } })
    if (!job) throw new Error(`Export job ${jobId} not found`)
    return job.tenantId
  }
  queue.register('employees', async (data, { jobId }) => {
    const { canReadSalary } = data as { canReadSalary?: unknown }
    return buildEmployeeDirectory(prisma, await jobTenantId(jobId), canReadSalary === true)
  })
  queue.register('ledger', async (_data, { jobId }) => buildLedger(prisma, await jobTenantId(jobId)))
  queue.register('projects', async (_data, { jobId }) => buildProjects(prisma, await jobTenantId(jobId)))
  queue.register('workspace', async (_data, { jobId }) => buildWorkspaceArchive(prisma, await jobTenantId(jobId)))
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
      const { tenantId, role, userId } = requireAuthContext(request)
      const prisma = request.server.prisma
      const canReadSalary = role === 'ADMIN' || role === 'OWNER'

      const jobId = await request.server.exportQueue.submit(request.body.kind, { canReadSalary }, tenantId)

      await prisma.exportJob.update({
        where: { id: jobId },
        data: {
          format: exportFileExtension(request.body.kind),
          dateRange: null,
        },
      })

      const job = await prisma.exportJob.findFirstOrThrow({ where: { id: jobId, tenantId } })
      await recordAuditLog(prisma, {
        tenantId,
        actorId: userId,
        action: 'export.create',
        targetType: 'ExportJob',
        targetId: jobId,
        metadata: { kind: request.body.kind },
      })
      // The web caches export jobs under `queryKeys.exports` (`asas,exports`), not hr/finance.
      request.server.ssePublish(tenantId, [moduleKeyPrefix('exports')])
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
      preHandler: requirePermission('employee.write'),
      schema: { params: idParamSchema, ...({} as object) },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
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
      const storage = request.server.objectStorage
      const key = exportObjectKey(tenantId, job.id, extension)
      let bytes = await storage.get(key)
      // Existing local export artifacts used an unscoped key before object storage was added.
      if (!bytes && storage.mode === 'local') bytes = await storage.get(`exports/${job.id}.${extension}`)
      if (!bytes) {
        reply.code(404)
        return { error: { message: 'Export file not found' } }
      }
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'export.download',
        targetType: 'ExportJob',
        targetId: job.id,
        metadata: { kind: job.dataScope },
      })

      reply
        .code(200)
        .header('content-type', exportContentType(job.dataScope ?? ''))
        .header('content-disposition', `attachment; filename="${job.filename}"`)
        .header('content-length', bytes.length)
      return reply.send(bytes)
    },
  )
}
