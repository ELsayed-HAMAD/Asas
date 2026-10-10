import { createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import {
  candidateListQuerySchema,
  candidateListResponseSchema,
  candidateInterviewListSchema,
  candidateInterviewSchema,
  candidateInterviewWriteSchema,
  candidateSchema,
  candidateStageUpdateSchema,
  candidateWriteSchema,
  envelope,
  errorEnvelopeSchema,
  errorResponses,
  idParamSchema,
  resumeUploadUrlSchema,
} from '@asas/contracts'
import { requireAuthContext, requireRole } from '../../middlewares/rbac.js'
import { requirePermission } from '../../middlewares/permissions.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import * as candidatesService from './candidates.service.js'
import { renderCandidateCsv } from './candidateExport.js'
import { recordAuditLog } from '../../services/auditLog.js'

/**
 * HR candidates — recruitment pipeline reads/writes plus the CV (resume) surface.
 *
 * The CV flow is **server-side storage with a signed upload**, not a third-party presigned
 * URL: the API mints a short-lived HMAC-signed PUT (the `h` and `exp` params, 10-minute
 * window, verified against `authSecret`) scoped to exactly one tenant + candidate, and the
 * browser PUTs the PDF straight to the API. The file lands at
 * `storage/resumes/<tenantId>/<candidateId>.pdf` (gitignored, outside `dist/`),
 * `Candidate.resumeUrl` records the preview path, and the
 * preview route streams it back as `application/pdf` — which the web app feeds to an in-app
 * `<iframe>` over a same-origin blob URL (native PDF viewer; the 500 kB CI chunk budget rules
 * out bundling pdf.js).
 *
 * The stored filename is the candidate's own id (never client-supplied, and checked against
 * `^[a-z0-9]+$` so it cannot traverse): a candidate has exactly one CV at a time, so a
 * re-upload replaces in place, and two candidates can never share or overwrite a file. Legacy
 * files from the old shared `resume.pdf` layout are deliberately *not* read back — that file
 * may belong to a different candidate — so such a candidate reads as 404 until re-uploaded.
 * Tenant isolation follows the module's rule — `tenantId` only ever comes from the resolved
 * session.
 */

/** Upload window: 10 minutes is enough for a human, short enough that a leaked link is stale. */
const UPLOAD_TTL_SECONDS = 600
/** A CV is a document, not a video: 5 MB caps the in-flight and on-disk size. */
const MAX_RESUME_BYTES = 5 * 1024 * 1024

function storageDir(tenantId: string): string {
  return path.join(process.cwd(), 'storage', 'resumes', tenantId)
}

/**
 * The one CV file for a candidate. `z.cuid()` alone admits `/` and `.`, so the id is re-checked
 * here before it becomes a path segment.
 */
function resumeFilePath(tenantId: string, candidateId: string): string {
  if (!/^[a-z0-9]+$/.test(candidateId)) throw new Error('Refusing to build a resume path from a non-alphanumeric id')
  return path.join(storageDir(tenantId), `${candidateId}.pdf`)
}

/** Constant-time comparison of two hex signatures; a length mismatch is simply unequal. */
function signaturesMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * `h = hex(hmac(authSecret, `${tenantId}:${candidateId}:${expiresUnix}`))` — three-way scoped,
 * so a token for one candidate/tenant cannot upload to another. `expiresUnix` is part of the
 * signed payload and also travels as `exp` in the URL, so verification at upload time is a
 * pure function of (secret, tenant, candidate, exp) with a window check.
 */
function signUpload(secret: string, tenantId: string, candidateId: string, expiresUnix: number): string {
  return createHmac('sha256', secret).update(`${tenantId}:${candidateId}:${expiresUnix}`).digest('hex')
}

export async function candidateRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>()
  const authSecret = app.authSecret

  server.get('/candidates/export.csv', {
    preHandler: requirePermission('candidate.export'),
    schema: { querystring: candidateListQuerySchema, ...({} as object) },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const rows = await candidatesService.getCandidatesForExport(request.server.prisma, tenantId, request.query)
    await recordAuditLog(request.server.prisma, { tenantId, actorId: userId, action: 'hr.candidate.export', targetType: 'Candidate', metadata: { count: rows.length, stage: request.query.stage ?? null, search: request.query.search ?? null } })
    reply.code(200).header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="recruitment-candidates.csv"')
    return reply.send(renderCandidateCsv(rows))
  })

  server.get('/candidates/:id/interviews', {
    preHandler: requireRole('MEMBER'),
    schema: { params: idParamSchema, response: { 200: envelope(candidateInterviewListSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await candidatesService.listCandidateInterviews(request.server.prisma, tenantId, request.params.id) }
  })

  server.post('/candidates/:id/interviews', {
    preHandler: requirePermission('candidate.write'),
    schema: { params: idParamSchema, body: candidateInterviewWriteSchema, response: { 201: envelope(candidateInterviewSchema), ...errorResponses } },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const interview = await request.server.prisma.$transaction(async tx => {
      const created = await candidatesService.scheduleCandidateInterview(tx, tenantId, request.params.id, request.body)
      await recordAuditLog(tx, { tenantId, actorId: userId, action: 'hr.candidate.interview.schedule', targetType: 'Candidate', targetId: request.params.id, metadata: { interviewId: created.id, startsAt: created.startsAt, stage: created.stage } })
      return created
    })
    request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
    reply.code(201)
    return { data: interview }
  })

  server.post('/candidates/:id/interviews/:interviewId/cancel', {
    preHandler: requirePermission('candidate.write'),
    schema: { params: z.object({ id: idParamSchema.shape.id, interviewId: idParamSchema.shape.id }), response: { 200: envelope(candidateInterviewSchema), ...errorResponses } },
  }, async request => {
    const { tenantId, userId } = requireAuthContext(request)
    const interview = await request.server.prisma.$transaction(async tx => {
      const cancelled = await candidatesService.cancelCandidateInterview(tx, tenantId, request.params.id, request.params.interviewId)
      await recordAuditLog(tx, { tenantId, actorId: userId, action: 'hr.candidate.interview.cancel', targetType: 'Candidate', targetId: request.params.id, metadata: { interviewId: cancelled.id } })
      return cancelled
    })
    request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
    return { data: interview }
  })

  server.get(
    '/candidates',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        querystring: candidateListQuerySchema,
        response: { 200: envelope(candidateListResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await candidatesService.listCandidates(request.server.prisma, tenantId, request.query)
      return { data: result }
    },
  )

  server.get(
    '/candidates/:id',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        params: idParamSchema,
        response: { 200: envelope(candidateSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const candidate = await candidatesService.getCandidate(request.server.prisma, tenantId, request.params.id)
      return { data: candidate }
    },
  )

  server.post(
    '/candidates',
    {
      preHandler: requirePermission('candidate.write'),
      schema: {
        body: candidateWriteSchema,
        response: { 201: envelope(candidateSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const candidate = await request.server.prisma.$transaction(async tx => {
        const created = await candidatesService.createCandidateInTransaction(tx, tenantId, request.body)
        await recordAuditLog(tx, { tenantId, actorId: userId, action: 'hr.candidate.create', targetType: 'Candidate', targetId: created.id })
        return created
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      reply.code(201)
      return { data: candidate }
    },
  )

  server.post(
    '/candidates/:id/stage',
    {
      preHandler: requirePermission('candidate.write'),
      schema: {
        params: idParamSchema,
        body: candidateStageUpdateSchema,
        response: { 200: envelope(candidateSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      const candidate = await request.server.prisma.$transaction(async tx => {
        const updated = await candidatesService.updateCandidateStageInTransaction(tx, tenantId, request.params.id, request.body)
        await recordAuditLog(tx, {
          tenantId, actorId: userId, action: 'hr.candidate.stage.change', targetType: 'Candidate', targetId: request.params.id,
          metadata: { toStage: request.body.stage },
        })
        if (request.body.stage === 'HIRED' && updated.employeeId) {
          await recordAuditLog(tx, {
            tenantId, actorId: userId, action: 'hr.employee.create_from_candidate', targetType: 'Employee', targetId: updated.employeeId,
            metadata: { candidateId: request.params.id },
          })
        }
        return updated
      }, { isolationLevel: 'Serializable' })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      return { data: candidate }
    },
  )

  // ── CV (resume) surface ─────────────────────────────────────────────────────────

  /**
   * Mint the signed upload grant. The response is the whole grant: `uploadUrl` (carrying
   * `h` and `exp`), its `expiresAt`, and the upload's rules (PDF only, size cap).
   */
  server.get(
    '/candidates/:id/resume-upload-url',
    {
      preHandler: requirePermission('candidate.write'),
      schema: {
        params: idParamSchema,
        response: { 200: envelope(resumeUploadUrlSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const prisma = request.server.prisma
      const candidate = await candidatesService.getCandidate(prisma, tenantId, request.params.id)

      const expiresUnix = Math.floor(Date.now() / 1000) + UPLOAD_TTL_SECONDS
      const h = signUpload(authSecret, tenantId, candidate.id, expiresUnix)
      return {
        data: {
          uploadUrl: `/api/v1/hr/candidates/${candidate.id}/resume?h=${h}&exp=${expiresUnix}`,
          method: 'PUT' as const,
          expiresAt: new Date(expiresUnix * 1000).toISOString(),
          contentType: 'application/pdf' as const,
          maxBytes: MAX_RESUME_BYTES,
        },
      }
    },
  )

  /**
   * The signed PUT target. Three checks, in order: the session's tenant must match the
   * candidate (isolation), the signature must verify against (tenant, candidate, exp), and
   * `exp` must sit in (now, now + TTL] — the window makes a stale or pre-forged-early token
   * fail. `h` and `exp` travel as **query** params (the `resume-upload-url` grant puts them in
   * the query string of `uploadUrl`), so they are declared on `querystring`, not `params`. The
   * body is raw bytes: the `application/pdf` content-type parser (registered in `app.ts`)
   * buffers it, and the PDF magic-number check rejects a mislabeled file.
   */
  server.put(
    '/candidates/:id/resume',
    {
      preHandler: requirePermission('candidate.write'),
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        params: idParamSchema,
        querystring: z.object({ h: z.string().min(1), exp: z.string().min(1) }),
        response: { 200: envelope(candidateSchema), 413: errorEnvelopeSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId } = requireAuthContext(request)
      const candidateId = request.params.id
      const exp = Number(request.query.exp)
      const now = Math.floor(Date.now() / 1000)

      if (!Number.isSafeInteger(exp) || exp < now || exp - now > UPLOAD_TTL_SECONDS) {
        reply.code(403)
        return { error: { message: 'Invalid or expired upload signature' } }
      }
      const expected = signUpload(authSecret, tenantId, candidateId, exp)
      if (!signaturesMatch(request.query.h, expected)) {
        reply.code(403)
        return { error: { message: 'Invalid or expired upload signature' } }
      }

      const body = request.body
      if (!Buffer.isBuffer(body) || body.length === 0) {
        reply.code(400)
        return { error: { message: 'The resume must be a non-empty PDF' } }
      }
      if (body.length > MAX_RESUME_BYTES) {
        reply.code(413)
        return { error: { message: `Resume exceeds the ${MAX_RESUME_BYTES} byte limit` } }
      }
      if (body.subarray(0, 5).toString('latin1') !== '%PDF-') {
        reply.code(400)
        return { error: { message: 'The file is not a PDF' } }
      }

      const prisma = request.server.prisma
      const candidate = await candidatesService.getCandidate(prisma, tenantId, candidateId)
      await mkdir(storageDir(tenantId), { recursive: true })
      await writeFile(resumeFilePath(tenantId, candidate.id), body)

      const updated = await prisma.candidate.update({
        where: { id: candidate.id },
        data: { resumeUrl: `/api/v1/hr/candidates/${candidate.id}/resume` },
      })
      await prisma.candidateActivity.create({ data: { candidateId: candidate.id, action: 'cv.uploaded' } })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      reply.code(200)
      return { data: candidatesService.mapCandidate(updated) }
    },
  )

  /**
   * The CV preview — same-origin, tenant-scoped, raw `application/pdf` bytes. The web app
   * feeds this URL to pdf.js, which renders the first page to a canvas. No `schema.response`
   * is declared: the body is a binary, and a JSON response schema would route it through the
   * serializer. An orphaned `resumeUrl` (file deleted out-of-band) reads as 404.
   */
  server.get(
    '/candidates/:id/resume',
    {
      preHandler: requireRole('MEMBER'),
      schema: { params: idParamSchema, ...({} as object) },
    },
    async (request, reply) => {
      const { tenantId } = requireAuthContext(request)
      const prisma = request.server.prisma
      const candidate = await candidatesService.getCandidate(prisma, tenantId, request.params.id)
      if (!candidate.resumeUrl) {
        reply.code(404)
        return { error: { message: 'No resume has been uploaded for this candidate' } }
      }

      const file = resumeFilePath(tenantId, candidate.id)
      let bytes: Buffer
      try {
        bytes = await readFile(file)
      } catch {
        reply.code(404)
        return { error: { message: 'Resume file not found' } }
      }

      reply
        .code(200)
        .header('content-type', 'application/pdf')
        .header('content-disposition', `inline; filename="resume-${candidate.id}.pdf"`)
        .header('content-length', bytes.length)
      return reply.send(bytes)
    },
  )
}
