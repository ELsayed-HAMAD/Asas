import {
  envelope,
  errorResponses,
  importEmployeesRequestSchema,
  importEmployeesResponseSchema,
  onboardingStatusResponseSchema,
  sampleApplyResponseSchema,
} from '@asas/contracts'
import type { ImportEmployeesRequest, OnboardingStatus } from '@asas/contracts'
import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { requireAuthContext, requireRole } from '../../middlewares/rbac.js'
import { requirePermission } from '../../middlewares/permissions.js'
import { recordAuditLog } from '../../services/auditLog.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import { AppError } from '../../utils/errors.js'
import { applyEnterpriseSamplePack, importEmployees } from './samplePack.service.js'

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
      await request.server.prisma.tenant.update({
        where: { id: tenantId },
        data: { onboardingStatus: 'EMPTY' },
      })
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'onboarding.markEmpty',
        targetType: 'Tenant',
        targetId: tenantId,
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
      const summary = await applyEnterpriseSamplePack(request.server.prisma, tenantId)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'onboarding.sample.apply',
        targetType: 'Tenant',
        targetId: tenantId,
        metadata: {
          sections: Object.keys(summary).length,
          rows: Object.values(summary).reduce((total, rows) => total + rows, 0),
        },
      })
      for (const moduleName of ['hr', 'finance', 'crm', 'projects', 'inventory'] as const) {
        request.server.ssePublish(tenantId, [moduleKeyPrefix(moduleName)])
      }
      reply.code(201)
      return { data: { onboardingStatus: 'SAMPLE_LOADED' as const, summary } }
    },
  )

  server.post(
    '/import',
    {
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
      )
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'onboarding.import.employees',
        targetType: 'Tenant',
        targetId: tenantId,
        metadata: { imported: result.imported },
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('hr')])
      reply.code(201)
      return { data: { ...result, onboardingStatus: 'IMPORTED' as const } }
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
