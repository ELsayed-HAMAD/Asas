import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ExportJobStatus } from '@prisma/client'
import type { FastifyInstance } from 'fastify'

/**
 * The API's job queue — pg-boss, per the rebuild plan ("all queued through pg-boss in
 * `apps/api/src/services/`").
 *
 * Design notes:
 *
 * - **Opt-in.** `QUEUE_URL` selects pg-boss; when it is unset (local dev, tests, and the CI
 *   runner) the queue degrades to *inline execution*: `submit` runs the handler in the same
 *   tick and the job row ends DONE before the HTTP response is written. The `ExportJob`
 *   bookkeeping (QUEUED → RUNNING → DONE/FAILED) happens either way, so the table always
 *   tells the same story regardless of transport.
 * - **The job row is the source of truth, not the queue.** A `submit` call creates the row
 *   first (QUEUED) and stamps progress/status as it moves. pg-boss only *drives* the handler;
 *   if the queue later becomes unavailable the row still exists with a status — a failure
 *   reads as FAILED, never as "happened but invisible".
 * - **The file is addressed by the job id.** A handler renders a deterministic file and
 *   returns it; the queue writes it to `storage/exports/<jobId>.<ext>` — the same tenant/
 *   storage tree as CV uploads, so the download endpoint streams `storage/exports/<id>` and
 *   the wire `downloadUrl` is derivable from the job id. No `downloadUrl`/`metadata` column
 *   exists on the model (and none needs to: the id is the address).
 * - **Idempotent handlers.** A job runs once per dispatch (inline: inside `submit`; boss: from
 *   the worker). A boss retry can at worst re-render a deterministic file (byte-identical —
 *   see `pdf.ts`/`export.ts`) and re-stamp DONE, which is safe.
 *
 * pg-boss is loaded lazily (`createRequire`) so the inline path never pays for the import —
 * the same reason `server.ts` keeps its imports to what actually runs on the default path.
 */

const require = createRequire(import.meta.url)

/** A pg-boss client, the surface this queue uses (narrow on purpose — test doubles need less). */
interface BossClient {
  createQueue(name: string, options: unknown): Promise<unknown>
  work(queue: string, handler: (jobs: Array<{ data: unknown }>) => Promise<void>): Promise<unknown>
  send(queue: string, payload: unknown, options: unknown): Promise<unknown>
  start(): Promise<unknown>
  stop(): Promise<void>
}

/**
 * One unit of queued work. In boss mode this is JSON-serialised into Postgres, so `data` must
 * be *plain data only* (no clients, no class instances) — and nothing in it is trusted for
 * tenant scoping: a handler resolves the tenant from the `ExportJob` row via `jobId`.
 */
export interface JobPayload {
  /** The `ExportJob` row id all bookkeeping writes against (and the file address). */
  jobId: string
  kind: string
  data: unknown
}

/**
 * A handler renders the export's file and returns its bytes. The queue writes the file
 * (`<jobId>.<ext>`), which is what the download endpoint streams — a handler never touches
 * the filesystem, so "what the worker produces" and "what the job row points at" are the same
 * thing. `job.jobId` lets the handler read its own row (e.g. the owning `tenantId`).
 */
export type ExportHandler = (data: unknown, job: { jobId: string }) => Promise<Buffer>

export interface ExportQueue {
  readonly mode: 'boss' | 'inline'
  /** Register the handler for a kind. Must be called before `start()`. */
  register(kind: string, handler: ExportHandler): void
  /** Create the row (QUEUED), then run — now, or on the queue. Returns the created row id. */
  submit(kind: string, data: unknown, tenantId: string): Promise<string>
  start(): Promise<void>
  close(): Promise<void>
}

/** The Prisma surface the queue needs — injected so the module stays testable without a DB. */
export interface ExportJobStore {
  create(data: { tenantId: string; filename: string; dataScope: string; status: ExportJobStatus }): Promise<{ id: string }>
  updateMany(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>
}

/** Where every exported file lands, keyed by job id — the download endpoint's read path. */
export function exportFilePath(jobId: string, extension: string): string {
  return path.join(process.cwd(), 'storage', 'exports', `${jobId}.${extension}`)
}

/** The file extension a kind renders to — the download endpoint needs it to address the file. */
export function exportFileExtension(kind: string): string {
  return (KIND_FILENAME[kind] ?? { extension: 'xlsx' }).extension
}

const BOSS_QUEUE = 'exports'

/** The kind → (filename, extension) a job row is stamped with at creation. */
const KIND_FILENAME: Record<string, { filename: string; extension: string }> = {
  employees: { filename: 'employees.xlsx', extension: 'xlsx' },
  ledger: { filename: 'ledger.xlsx', extension: 'xlsx' },
}

export interface CreateExportQueueOptions {
  /** When set, jobs ride pg-boss on this connection string; when undefined, they run inline. */
  url?: string | undefined
  store: ExportJobStore
}

export async function createExportQueue(options: CreateExportQueueOptions): Promise<ExportQueue> {
  const { url, store } = options
  let boss: BossClient | null = null
  const handlers = new Map<string, ExportHandler>()

  if (url) {
    // Loaded lazily so the inline path (dev/CI/tests) never imports or connects to pg-boss.
    const PgBoss = require('pg-boss') as new (cfg: unknown) => BossClient
    boss = new PgBoss({ connectionString: url, schema: 'asas_boss' })
    await boss.start()
  }

  async function updateRow(jobId: string, patch: { status?: string; progressPct?: number }): Promise<void> {
    const data: Record<string, unknown> = {}
    if (patch.status !== undefined) data.status = patch.status
    if (patch.progressPct !== undefined) data.progressPct = patch.progressPct
    await store.updateMany({ where: { id: jobId }, data })
  }

  async function runJob(job: JobPayload): Promise<void> {
    const handler = handlers.get(job.kind)
    if (!handler) {
      await updateRow(job.jobId, { status: 'FAILED' })
      throw new Error(`No handler registered for export kind '${job.kind}'`)
    }
    await updateRow(job.jobId, { status: 'RUNNING', progressPct: 10 })
    try {
      const extension = (KIND_FILENAME[job.kind] ?? { extension: 'xlsx' }).extension
      const buffer = await handler(job.data, { jobId: job.jobId })
      const file = exportFilePath(job.jobId, extension)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, buffer)
      await updateRow(job.jobId, { status: 'DONE', progressPct: 100 })
    } catch (error) {
      await updateRow(job.jobId, { status: 'FAILED' })
      throw error instanceof Error ? error : new Error(String(error))
    }
  }

  return {
    mode: boss ? 'boss' : 'inline',
    register(kind, handler) {
      handlers.set(kind, handler)
    },
    async submit(kind, data, tenantId) {
      const row = await store.create({
        tenantId,
        filename: (KIND_FILENAME[kind] ?? { filename: `${kind}.xlsx` }).filename,
        dataScope: kind,
        status: 'QUEUED',
      })
      const payload: JobPayload = { jobId: row.id, kind, data }
      if (!boss) {
        // Inline: run in this tick. A handler failure marks the row FAILED and re-throws, so
        // the creating request sees it (a boss-mode failure only surfaces via the row).
        await runJob(payload)
        return row.id
      }
      await boss.send(BOSS_QUEUE, payload, { retryLimit: 2 })
      return row.id
    },
    async start() {
      if (!boss) return
      await boss.createQueue(BOSS_QUEUE, { retryLimit: 2 })
      await boss.work(BOSS_QUEUE, async jobs => {
        for (const job of jobs) await runJob(job.data as JobPayload)
      })
    },
    async close() {
      if (!boss) return
      await boss.stop()
    },
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    exportQueue: ExportQueue
  }
}

/**
 * Fastify plugin: builds the queue, registers it as `app.exportQueue`, starts it, and closes
 * it on server shutdown. `queueUrl` comes from the environment (`QUEUE_URL`) — unset means
 * inline mode, which is what the prisma-less test path and the CI runner use.
 */
export async function exportQueuePlugin(
  app: FastifyInstance,
  options: { queueUrl?: string | undefined; store: ExportJobStore },
): Promise<void> {
  const queue = await createExportQueue({ url: options.queueUrl, store: options.store })
  app.decorate('exportQueue', queue)
  // Handlers are registered by buildApp before workers start polling existing jobs.
  app.addHook('onReady', () => queue.start())
  app.addHook('onClose', () => queue.close())
}
