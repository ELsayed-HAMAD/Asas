import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
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
  candidateUpdateSchema,
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
import { candidateResumeKey, candidateResumeStagingKey } from '../../services/objectStorage.js'

/**
 * HR candidates — recruitment pipeline reads/writes plus the CV (resume) surface.
 *
 * The CV flow uses tenant-scoped storage and short-lived uploads. Local development keeps the
 * signed API PUT; S3 mode returns a presigned PUT to a per-upload staging key and requires an
 * authenticated completion call to validate and promote the object. The file key is scoped to
 * `resumes/<tenantId>/<candidateId>.pdf`,
 * `Candidate.resumeUrl` records the preview path, and the
 * preview route streams it back as `application/pdf` — which the web app feeds to an in-app
 * `<iframe>` over a same-origin blob URL (native PDF viewer; the 500 kB CI chunk budget rules
 * out bundling pdf.js).
 *
 * The stored key is built from session tenant and validated candidate ids, never a client path.
 * A candidate has exactly one CV at a time, so a re-upload replaces in place, and two
 * candidates can never share or overwrite a file. Legacy
 * files from the old shared `resume.pdf` layout are deliberately *not* read back — that file
 * may belong to a different candidate — so such a candidate reads as 404 until re-uploaded.
 * Tenant isolation follows the module's rule — `tenantId` only ever comes from the resolved
 * session.
 */

/** Upload window: 10 minutes is enough for a human, short enough that a leaked link is stale. */
const UPLOAD_TTL_SECONDS = 600
/** A CV is a document, not a video: 5 MB caps the in-flight and stored size. */
const MAX_RESUME_BYTES = 5 * 1024 * 1024

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
function signUpload(secret: string, tenantId: string, candidateId: string, expiresUnix: number, uploadId: string): string {
  return createHmac('sha256', secret).update(`${tenantId}:${candidateId}:${expiresUnix}:${uploadId}`).digest('hex')
}

function validUploadGrant(secret: string, tenantId: string, candidateId: string, expiresUnix: number, uploadId: string, token: string): boolean {
  const now = Math.floor(Date.now() / 1000)
  if (!Number.isSafeInteger(expiresUnix) || expiresUnix < now || expiresUnix - now > UPLOAD_TTL_SECONDS) return false
  return signaturesMatch(token, signUpload(secret, tenantId, candidateId, expiresUnix, uploadId))
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

  server.patch(
    '/candidates/:id',
    {
      preHandler: requirePermission('candidate.write'),
      schema: {
        params: idParamSchema,
        body: candidateUpdateSchema,
        response: { 200: envelope(candidateSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      const candidate = await request.server.prisma.$transaction(async tx => {
        const updated = await candidatesService.updateCandidateInTransaction(tx, tenantId, request.params.id, request.body)
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'hr.candidate.update',
          targetType: 'Candidate',
          targetId: request.params.id,
          metadata: { fields: Object.keys(request.body) },
        })
        return updated
      })
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
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
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
      const uploadId = randomUUID()
      const uploadToken = signUpload(authSecret, tenantId, candidate.id, expiresUnix, uploadId)
      const uploadTarget = request.server.objectStorage.mode === 's3' ? 'object' as const : 'api' as const
      const uploadUrl = uploadTarget === 'object'
        ? await request.server.objectStorage.presignPut(candidateResumeStagingKey(tenantId, candidate.id, uploadId), 'application/pdf', UPLOAD_TTL_SECONDS)
        : `/api/v1/hr/candidates/${candidate.id}/resume?h=${uploadToken}&exp=${expiresUnix}&uploadId=${uploadId}`
      return {
        data: {
          uploadUrl,
          uploadTarget,
          uploadId,
          uploadToken,
          expiresUnix,
          method: 'PUT' as const,
          expiresAt: new Date(expiresUnix * 1000).toISOString(),
          contentType: 'application/pdf' as const,
          maxBytes: MAX_RESUME_BYTES,
        },
      }
    },
  )

  /** Confirm a direct S3 upload, validate its size/signature, then promote it to the stable CV key. */
  server.post(
    '/candidates/:id/resume/complete',
    {
      preHandler: requirePermission('candidate.write'),
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        params: idParamSchema,
        body: z.object({ uploadId: z.uuid(), expiresUnix: z.int().positive(), uploadToken: z.string().min(1) }),
        response: { 200: envelope(candidateSchema), 413: errorEnvelopeSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId } = requireAuthContext(request)
      const { uploadId, expiresUnix, uploadToken } = request.body
      const candidateId = request.params.id
      const storage = request.server.objectStorage
      if (storage.mode !== 's3' || !validUploadGrant(authSecret, tenantId, candidateId, expiresUnix, uploadId, uploadToken)) {
        reply.code(403)
        return { error: { message: 'Invalid or expired upload signature' } }
      }

      const candidate = await candidatesService.getCandidate(request.server.prisma, tenantId, candidateId)
      const stagedKey = candidateResumeStagingKey(tenantId, candidate.id, uploadId)
      const metadata = await storage.head(stagedKey)
      if (!metadata) {
        reply.code(404)
        return { error: { message: 'Uploaded resume was not found' } }
      }
      if (metadata.size === 0 || metadata.size > MAX_RESUME_BYTES) {
        await storage.delete(stagedKey)
        reply.code(metadata.size > MAX_RESUME_BYTES ? 413 : 400)
        return { error: { message: metadata.size > MAX_RESUME_BYTES ? `Resume exceeds the ${MAX_RESUME_BYTES} byte limit` : 'The resume must be a non-empty PDF' } }
      }
      const prefix = await storage.readPrefix(stagedKey, 5)
      if (!prefix || prefix.toString('latin1') !== '%PDF-') {
        await storage.delete(stagedKey)
        reply.code(400)
        return { error: { message: 'The file is not a PDF' } }
      }

      await storage.copy(stagedKey, candidateResumeKey(tenantId, candidate.id), 'application/pdf')
      await storage.delete(stagedKey)
      const updated = await request.server.prisma.candidate.update({
        where: { id: candidate.id },
        data: { resumeUrl: `/api/v1/hr/candidates/${candidate.id}/resume` },
      })
      await request.server.prisma.candidateActivity.create({ data: { candidateId: candidate.id, action: 'cv.uploaded' } })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      reply.code(200)
      return { data: candidatesService.mapCandidate(updated) }
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
        querystring: z.object({ h: z.string().min(1), exp: z.string().min(1), uploadId: z.uuid() }),
        response: { 200: envelope(candidateSchema), 413: errorEnvelopeSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId } = requireAuthContext(request)
      const candidateId = request.params.id
      if (request.server.objectStorage.mode !== 'local' || !validUploadGrant(authSecret, tenantId, candidateId, Number(request.query.exp), request.query.uploadId, request.query.h)) {
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
      await request.server.objectStorage.put(candidateResumeKey(tenantId, candidate.id), body, 'application/pdf')

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

      const bytes = await request.server.objectStorage.get(candidateResumeKey(tenantId, candidate.id))
      if (!bytes) {
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
