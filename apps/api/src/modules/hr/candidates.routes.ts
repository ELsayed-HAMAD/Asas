import { createHmac } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import {
  candidateListQuerySchema,
  candidateListResponseSchema,
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

/**
 * HR candidates — recruitment pipeline reads/writes plus the CV (resume) surface.
 *
 * The CV flow is **server-side storage with a signed upload**, not a third-party presigned
 * URL: the API mints a short-lived HMAC-signed PUT (the `h` and `exp` params, 10-minute
 * window, verified against `authSecret`) scoped to exactly one tenant + candidate, and the
 * browser PUTs the PDF straight to the API. The file lands under `storage/resumes/<tenantId>/`
 * (gitignored, outside `dist/`), `Candidate.resumeUrl` records the preview path, and the
 * preview route streams it back as `application/pdf` — which the web app feeds to an in-app
 * `<iframe>` over a same-origin blob URL (native PDF viewer; the 500 kB CI chunk budget rules
 * out bundling pdf.js).
 *
 * The stored filename is fixed (`resume.pdf`) rather than client-supplied: a candidate has
 * exactly one CV at a time, so a re-upload replaces in place and there is no path to
 * influence. Tenant isolation follows the module's rule — `tenantId` only ever comes from
 * the resolved session.
 */

/** Upload window: 10 minutes is enough for a human, short enough that a leaked link is stale. */
const UPLOAD_TTL_SECONDS = 600
/** A CV is a document, not a video: 5 MB caps the in-flight and on-disk size. */
const MAX_RESUME_BYTES = 5 * 1024 * 1024

function storageDir(tenantId: string): string {
  return path.join(process.cwd(), 'storage', 'resumes', tenantId)
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
      const { tenantId } = requireAuthContext(request)
      const candidate = await candidatesService.createCandidate(request.server.prisma, tenantId, request.body)
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
      const { tenantId } = requireAuthContext(request)
      const candidate = await candidatesService.updateCandidateStage(
        request.server.prisma,
        tenantId,
        request.params.id,
        request.body,
      )
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
      if (request.query.h.length !== 64 || request.query.h !== expected) {
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
      const dir = storageDir(tenantId)
      await mkdir(dir, { recursive: true })
      await writeFile(path.join(dir, 'resume.pdf'), body)

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
   * fetches these to a Blob and shows them in a native-viewer `<iframe>` (no pdf.js bundled —
   * it would blow the 500 kB/chunk CI budget). No `schema.response` is declared: the body is a
   * binary, and a JSON response schema would route it through the serializer. An orphaned
   * `resumeUrl` (file deleted out-of-band) reads as 404.
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

      const file = path.join(storageDir(tenantId), 'resume.pdf')
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
