import {
  envelope,
  errorResponses,
  dataMigrationProjectCreateSchema,
  dataMigrationProjectSchema,
  importEmployeesRequestSchema,
  importEmployeesResponseSchema,
  importEmployeesValidationResponseSchema,
  onboardingStatusResponseSchema,
  sampleApplyResponseSchema,
  sampleDataClearResponseSchema,
} from '@asas/contracts'
import type { ImportEmployeesRequest, OnboardingStatus } from '@asas/contracts'
import type { DataMigrationModule } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { requireAuthContext, requireRole } from '../../middlewares/rbac.js'
import { requirePermission } from '../../middlewares/permissions.js'
import { recordAuditLog } from '../../services/auditLog.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import { AppError } from '../../utils/errors.js'
import { applyEnterpriseSamplePack, clearSamplePack, importEmployees } from './samplePack.service.js'

/**
 * Onboarding — the preserved 3-path flow (empty / sample / import), ported from the legacy
 * `api/src/modules/onboarding/*` onto the new stack.
 *
 * RBAC mirrors the other modules: `GET /status` is open to any member, while the three write
 * paths go through the `onboarding.write` permission (ADMIN) and are audit-logged — a bulk
 * write of the whole business surface is exactly the kind of privileged action the audit log
 * exists for. `tenantId` is read only from the resolved session.
 *
 * The sample apply seeds every module, so its SSE invalidation publishes every module prefix
 * the web client knows about — an open tab refetches whatever surface it is showing.
 */
export async function onboardingRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.post(
    '/migration-project',
    {
      preHandler: requirePermission('onboarding.write'),
      schema: {
        body: dataMigrationProjectCreateSchema,
        response: { 200: envelope(dataMigrationProjectSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      const input = request.body
      const project = await request.server.prisma.$transaction(async tx => {
        const current = await tx.dataMigrationProject.findFirst({
          where: { tenantId, createdDuringOnboarding: true, status: { in: ['PLANNING', 'IN_PROGRESS'] } },
          orderBy: { updatedAt: 'desc' },
        })
        const data = {
          name: input.name,
          sourceSystem: input.sourceSystem ?? null,
          modules: input.modules as DataMigrationModule[],
          targetCutoverAt: input.targetCutoverAt ? new Date(input.targetCutoverAt) : null,
        }
        const saved = current
          ? await tx.dataMigrationProject.update({ where: { id: current.id }, data })
          : await tx.dataMigrationProject.create({ data: { ...data, tenantId, createdBy: userId, createdDuringOnboarding: true } })
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: current ? 'dataMigration.project.update' : 'dataMigration.project.create',
          targetType: 'DataMigrationProject',
          targetId: saved.id,
          metadata: { source: 'onboarding', modules: saved.modules, sourceSystem: saved.sourceSystem },
        })
        return saved
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('settings')])
      return {
        data: {
          id: project.id,
          name: project.name,
          sourceSystem: project.sourceSystem,
          modules: project.modules,
          status: project.status,
          targetCutoverAt: project.targetCutoverAt?.toISOString() ?? null,
          createdAt: project.createdAt.toISOString(),
          updatedAt: project.updatedAt.toISOString(),
        },
      }
    },
  )

  server.get(
    '/status',
    {
      preHandler: requireRole('MEMBER'),
      schema: { response: { 200: envelope(onboardingStatusResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const status = await getOnboardingStatus(request.server.prisma, tenantId)
      return { data: status }
    },
  )

  server.post(
    '/empty',
    {
      preHandler: requirePermission('onboarding.write'),
      schema: { response: { 200: envelope(onboardingStatusResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      await request.server.prisma.$transaction(async tx => {
        const changed = await tx.tenant.updateMany({
          where: { id: tenantId, onboardingStatus: 'PENDING' },
          data: { onboardingStatus: 'EMPTY' },
        })
        if (changed.count === 1) {
          await recordAuditLog(tx, {
            tenantId,
            actorId: userId,
            action: 'onboarding.markEmpty',
            targetType: 'Tenant',
            targetId: tenantId,
          })
          return
        }
        const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { onboardingStatus: true } })
        if (tenant?.onboardingStatus !== 'EMPTY') throw new AppError(409, 'Only a pending workspace can start empty')
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      const status = await getOnboardingStatus(request.server.prisma, tenantId)
      return { data: status }
    },
  )

  server.post(
    '/sample',
    {
      preHandler: requirePermission('onboarding.write'),
      schema: { response: { 201: envelope(sampleApplyResponseSchema), ...errorResponses } },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const summary = await applyEnterpriseSamplePack(request.server.prisma, tenantId, userId)
      for (const moduleName of ['hr', 'finance', 'crm', 'projects', 'inventory'] as const) {
        request.server.ssePublish(tenantId, [moduleKeyPrefix(moduleName)])
      }
      reply.code(201)
      return { data: { onboardingStatus: 'SAMPLE_LOADED' as const, summary } }
    },
  )

  server.post(
    '/import/validate',
    {
      bodyLimit: 5 * 1024 * 1024,
      preHandler: requirePermission('onboarding.write'),
      schema: {
        body: importEmployeesRequestSchema,
        response: { 200: envelope(importEmployeesValidationResponseSchema), ...errorResponses },
      },
    },
    async request => ({ data: { validRows: request.body.employees.length } }),
  )

  server.post(
    '/import',
    {
      // A 2 MiB CSV can expand when quoted rows are posted as JSON; cap the parsed request
      // while allowing the documented 500 employee rows to reach contract validation.
      bodyLimit: 5 * 1024 * 1024,
      preHandler: requirePermission('onboarding.write'),
      schema: {
        body: importEmployeesRequestSchema,
        response: { 201: envelope(importEmployeesResponseSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const result = await importEmployees(
        request.server.prisma,
        tenantId,
        request.body as ImportEmployeesRequest,
        userId,
      )
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      reply.code(201)
      return { data: { ...result, onboardingStatus: 'IMPORTED' as const } }
    },
  )

  server.delete(
    '/sample-data',
    {
      preHandler: requirePermission('onboarding.write'),
      schema: { response: { 200: envelope(sampleDataClearResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      const result = await clearSamplePack(request.server.prisma, tenantId, userId)
      // The sweep touched every business module — publish all their prefixes so an open tab
      // refetches whichever surface it is showing (same set as the sample-apply above).
      for (const moduleName of ['hr', 'finance', 'crm', 'projects', 'inventory'] as const) {
        request.server.ssePublish(tenantId, [moduleKeyPrefix(moduleName)])
      }
      return { data: result }
    },
  )
}

/** `GET /onboarding/status` — the flow state for the active workspace. */
export async function getOnboardingStatus(
  prisma: PrismaClient,
  tenantId: string,
): Promise<{ onboardingStatus: OnboardingStatus; hasHrData: boolean; workspaceName: string }> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) throw new AppError(404, 'Workspace not found')
  const employeeCount = await prisma.employee.count({ where: { tenantId } })
  return {
    onboardingStatus: tenant.onboardingStatus as OnboardingStatus,
    hasHrData: employeeCount > 0,
    workspaceName: tenant.name,
  }
}
