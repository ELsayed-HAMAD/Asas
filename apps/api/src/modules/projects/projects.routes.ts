import {
  burndownQuerySchema,
  burndownResponseSchema,
  envelope,
  errorResponses,
  idParamSchema,
  idSchema,
  issueAssigneeSchema,
  issueAssigneeWriteSchema,
  issueChecklistItemSchema,
  issueChecklistItemUpdateSchema,
  issueChecklistItemWriteSchema,
  issueCommentSchema,
  issueCommentWriteSchema,
  issueListResponseSchema,
  issueSchema,
  issueUpdateSchema,
  issueWriteSchema,
  noContentSchema,
  portfolioUtilizationResponseSchema,
  projectListQuerySchema,
  projectListResponseSchema,
  projectSchema,
  projectUpdateSchema,
  projectWriteSchema,
  roadmapPhaseWriteSchema,
  roadmapResponseSchema,
  roadmapTaskUpdateSchema,
  roadmapTaskWriteSchema,
  sprintListResponseSchema,
  sprintVelocityComparisonSchema,
  sprintSchema,
  sprintUpdateSchema,
  sprintWriteSchema,
} from '@asas/contracts'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { requireAuthContext, requireRole } from '../../middlewares/rbac.js'
import { requirePermission } from '../../middlewares/permissions.js'
import { recordAuditLog } from '../../services/auditLog.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import * as projectsController from './projects.controller.js'

const issueItemParamSchema = z.object({
  id: idSchema,
  itemId: idSchema,
})

const issueAssigneeParamSchema = z.object({
  id: idSchema,
  employeeId: idSchema,
})


/**
 * Projects — the second module ported onto the new stack (HR is the reference, Phase 2).
 *
 * Every route resolves `tenantId` from the authenticated session (via `requireAuthContext`)
 * and never from a request parameter, so no route can address another tenant's rows. Reads go
 * through `requireRole('MEMBER')`; writes/deletes through a named permission in
 * `middlewares/permissions.ts`. KPI endpoints (portfolio utilization, burndown) return
 * server-computed aggregates, never client-side sums.
 */
export async function projectsRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>()

  // ── Projects ────────────────────────────────────────────────────────────────

  server.get(
    '/projects',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        querystring: projectListQuerySchema,
        response: { 200: envelope(projectListResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await projectsController.listProjects(request.server.prisma, tenantId, request.query)
      return { data: result }
    },
  )

  server.get(
    '/projects/:id',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        params: idParamSchema,
        response: { 200: envelope(projectSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const project = await projectsController.getProject(request.server.prisma, tenantId, request.params.id)
      return { data: project }
    },
  )

  server.post(
    '/projects',
    {
      preHandler: requirePermission('project.write'),
      schema: {
        body: projectWriteSchema,
        response: { 201: envelope(projectSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId } = requireAuthContext(request)
      const project = await projectsController.createProject(request.server.prisma, tenantId, request.body)
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      reply.code(201)
      return { data: project }
    },
  )

  server.patch(
    '/projects/:id',
    {
      preHandler: requirePermission('project.write'),
      schema: {
        params: idParamSchema,
        body: projectUpdateSchema,
        response: { 200: envelope(projectSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const project = await projectsController.updateProject(
        request.server.prisma,
        tenantId,
        request.params.id,
        request.body,
      )
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      return { data: project }
    },
  )

  server.delete(
    '/projects/:id',
    {
      preHandler: requirePermission('project.delete'),
      schema: {
        params: idParamSchema,
        response: { 204: noContentSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      await projectsController.deleteProject(request.server.prisma, tenantId, request.params.id)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'project.delete',
        targetType: 'Project',
        targetId: request.params.id,
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      reply.code(204)
    },
  )

  // ── Analytics (KPIs computed in SQL) ────────────────────────────────────────

  server.get(
    '/portfolio',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        response: { 200: envelope(portfolioUtilizationResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await projectsController.getPortfolioUtilization(request.server.prisma, tenantId)
      return { data: result }
    },
  )

  server.get(
    '/projects/:id/sprint-velocity-comparison',
    {
      preHandler: requireRole('MEMBER'),
      schema: { params: idParamSchema, response: { 200: envelope(sprintVelocityComparisonSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await projectsController.getSprintVelocityComparison(request.server.prisma, tenantId, request.params.id)
      return { data: result }
    },
  )

  server.get(
    '/sprints/:id/burndown',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        params: idParamSchema,
        querystring: burndownQuerySchema,
        response: { 200: envelope(burndownResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await projectsController.getBurndown(
        request.server.prisma,
        tenantId,
        request.params.id,
        request.query,
      )
      return { data: result }
    },
  )

  // ── Sprints ─────────────────────────────────────────────────────────────────

  server.get(
    '/sprints',
    {
      preHandler: requireRole('MEMBER'),
      schema: { response: { 200: envelope(sprintListResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const items = await projectsController.listSprints(request.server.prisma, tenantId)
      return { data: { items } }
    },
  )

  server.get(
    '/sprints/:id',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        params: idParamSchema,
        response: { 200: envelope(sprintSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const sprint = await projectsController.getSprint(request.server.prisma, tenantId, request.params.id)
      return { data: sprint }
    },
  )

  server.post(
    '/sprints',
    {
      preHandler: requirePermission('sprint.write'),
      schema: {
        body: sprintWriteSchema,
        response: { 201: envelope(sprintSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId } = requireAuthContext(request)
      const sprint = await projectsController.createSprint(request.server.prisma, tenantId, request.body)
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      reply.code(201)
      return { data: sprint }
    },
  )

  server.patch(
    '/sprints/:id',
    {
      preHandler: requirePermission('sprint.write'),
      schema: {
        params: idParamSchema,
        body: sprintUpdateSchema,
        response: { 200: envelope(sprintSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const sprint = await projectsController.updateSprint(
        request.server.prisma,
        tenantId,
        request.params.id,
        request.body,
      )
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      return { data: sprint }
    },
  )

  server.delete(
    '/sprints/:id',
    {
      preHandler: requirePermission('sprint.delete'),
      schema: {
        params: idParamSchema,
        response: { 204: noContentSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      await projectsController.deleteSprint(request.server.prisma, tenantId, request.params.id)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'sprint.delete',
        targetType: 'Sprint',
        targetId: request.params.id,
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      reply.code(204)
    },
  )

  // ── Issues (work items under a sprint) ──────────────────────────────────────

  server.get(
    '/sprints/:id/issues',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        params: idParamSchema,
        response: { 200: envelope(issueListResponseSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const items = await projectsController.listIssues(request.server.prisma, tenantId, request.params.id)
      return { data: { items } }
    },
  )

  server.post(
    '/issues',
    {
      preHandler: requirePermission('issue.write'),
      schema: {
        body: issueWriteSchema,
        response: { 201: envelope(issueSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId } = requireAuthContext(request)
      const issue = await projectsController.createIssue(request.server.prisma, tenantId, request.body)
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      reply.code(201)
      return { data: issue }
    },
  )

  server.patch(
    '/issues/:id',
    {
      preHandler: requirePermission('issue.write'),
      schema: {
        params: idParamSchema,
        body: issueUpdateSchema,
        response: { 200: envelope(issueSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const issue = await projectsController.updateIssue(
        request.server.prisma,
        tenantId,
        request.params.id,
        request.body,
      )
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      return { data: issue }
    },
  )

  server.delete(
    '/issues/:id',
    {
      preHandler: requirePermission('issue.delete'),
      schema: {
        params: idParamSchema,
        response: { 204: noContentSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      await projectsController.deleteIssue(request.server.prisma, tenantId, request.params.id)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'issue.delete',
        targetType: 'Issue',
        targetId: request.params.id,
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      reply.code(204)
    },
  )

  server.get(
    '/issues/:id',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        params: idParamSchema,
        response: { 200: envelope(issueSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const issue = await projectsController.getIssue(request.server.prisma, tenantId, request.params.id)
      return { data: issue }
    },
  )

  server.post(
    '/issues/:id/checklist',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        params: idParamSchema,
        body: issueChecklistItemWriteSchema,
        response: { 201: envelope(issueChecklistItemSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const item = await request.server.prisma.$transaction(async tx => {
        const created = await projectsController.createChecklistItem(
          tx,
          tenantId,
          request.params.id,
          request.body,
        )
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'projects.issue.checklist.create',
          targetType: 'IssueChecklistItem',
          targetId: created.id,
          metadata: { issueId: request.params.id, text: created.text },
        })
        return created
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      reply.code(201)
      return { data: item }
    },
  )

  server.patch(
    '/issues/:id/checklist/:itemId',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        params: issueItemParamSchema,
        body: issueChecklistItemUpdateSchema,
        response: { 200: envelope(issueChecklistItemSchema), ...errorResponses },
      },
    },
    async request => {
      const { tenantId, userId } = requireAuthContext(request)
      const item = await request.server.prisma.$transaction(async tx => {
        const updated = await projectsController.updateChecklistItem(
          tx,
          tenantId,
          request.params.id,
          request.params.itemId,
          request.body,
        )
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'projects.issue.checklist.update',
          targetType: 'IssueChecklistItem',
          targetId: updated.id,
          metadata: { issueId: request.params.id, done: updated.done },
        })
        return updated
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      return { data: item }
    },
  )

  server.delete(
    '/issues/:id/checklist/:itemId',
    {
      preHandler: requirePermission('issue.write'),
      schema: {
        params: issueItemParamSchema,
        response: { 204: noContentSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      await request.server.prisma.$transaction(async tx => {
        await projectsController.deleteChecklistItem(
          tx,
          tenantId,
          request.params.id,
          request.params.itemId,
        )
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'projects.issue.checklist.delete',
          targetType: 'IssueChecklistItem',
          targetId: request.params.itemId,
          metadata: { issueId: request.params.id },
        })
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      reply.code(204)
    },
  )

  server.post(
    '/issues/:id/comments',
    {
      preHandler: requireRole('MEMBER'),
      schema: {
        params: idParamSchema,
        body: issueCommentWriteSchema,
        response: { 201: envelope(issueCommentSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const user = await request.server.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      })
      const author = user?.name || user?.email || 'Unknown'
      const comment = await request.server.prisma.$transaction(async tx => {
        const created = await projectsController.createIssueComment(
          tx,
          tenantId,
          request.params.id,
          author,
          request.body,
        )
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'projects.issue.comment.create',
          targetType: 'IssueComment',
          targetId: created.id,
          metadata: { issueId: request.params.id, author },
        })
        return created
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      reply.code(201)
      return { data: comment }
    },
  )

  server.post(
    '/issues/:id/assignees',
    {
      preHandler: requirePermission('issue.write'),
      schema: {
        params: idParamSchema,
        body: issueAssigneeWriteSchema,
        response: { 201: envelope(issueAssigneeSchema), ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      const assignee = await request.server.prisma.$transaction(async tx => {
        const created = await projectsController.addIssueAssignee(
          tx,
          tenantId,
          request.params.id,
          request.body.employeeId,
        )
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'projects.issue.assignee.add',
          targetType: 'IssueAssignee',
          targetId: created.id,
          metadata: { issueId: request.params.id, employeeId: request.body.employeeId },
        })
        return created
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      reply.code(201)
      return { data: assignee }
    },
  )

  server.delete(
    '/issues/:id/assignees/:employeeId',
    {
      preHandler: requirePermission('issue.write'),
      schema: {
        params: issueAssigneeParamSchema,
        response: { 204: noContentSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      await request.server.prisma.$transaction(async tx => {
        await projectsController.removeIssueAssignee(
          tx,
          tenantId,
          request.params.id,
          request.params.employeeId,
        )
        await recordAuditLog(tx, {
          tenantId,
          actorId: userId,
          action: 'projects.issue.assignee.remove',
          targetType: 'IssueAssignee',
          targetId: request.params.employeeId,
          metadata: { issueId: request.params.id, employeeId: request.params.employeeId },
        })
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      reply.code(204)
    },
  )

  // ── Roadmap (Gantt) ─────────────────────────────────────────────────────────

  server.get(
    '/roadmap',
    {
      preHandler: requireRole('MEMBER'),
      schema: { response: { 200: envelope(roadmapResponseSchema), ...errorResponses } },
    },
    async request => {
      const { tenantId } = requireAuthContext(request)
      const result = await projectsController.listRoadmap(request.server.prisma, tenantId)
      return { data: result }
    },
  )

  server.post(
    '/roadmap/phases',
    {
      preHandler: requirePermission('roadmap.write'),
      schema: {
        body: roadmapPhaseWriteSchema,
        response: { 204: noContentSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId } = requireAuthContext(request)
      await projectsController.createRoadmapPhase(request.server.prisma, tenantId, request.body)
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      reply.code(204)
    },
  )

  server.patch(
    '/roadmap/phases/:id',
    {
      preHandler: requirePermission('roadmap.write'),
      schema: {
        params: idParamSchema,
        body: roadmapPhaseWriteSchema,
        response: { 204: noContentSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId } = requireAuthContext(request)
      await projectsController.updateRoadmapPhase(request.server.prisma, tenantId, request.params.id, request.body)
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      reply.code(204)
    },
  )

  server.delete(
    '/roadmap/phases/:id',
    {
      preHandler: requirePermission('roadmap.write'),
      schema: {
        params: idParamSchema,
        response: { 204: noContentSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      await projectsController.deleteRoadmapPhase(request.server.prisma, tenantId, request.params.id)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'roadmap.phase.delete',
        targetType: 'RoadmapPhase',
        targetId: request.params.id,
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      reply.code(204)
    },
  )

  server.post(
    '/roadmap/tasks',
    {
      preHandler: requirePermission('roadmap.write'),
      schema: {
        body: roadmapTaskWriteSchema,
        response: { 204: noContentSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId } = requireAuthContext(request)
      await projectsController.createRoadmapTask(request.server.prisma, tenantId, request.body)
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      reply.code(204)
    },
  )

  server.patch(
    '/roadmap/tasks/:id',
    {
      preHandler: requirePermission('roadmap.write'),
      schema: {
        params: idParamSchema,
        body: roadmapTaskUpdateSchema,
        response: { 204: noContentSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId } = requireAuthContext(request)
      await projectsController.updateRoadmapTask(
        request.server.prisma,
        tenantId,
        request.params.id,
        request.body,
      )
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      reply.code(204)
    },
  )

  server.delete(
    '/roadmap/tasks/:id',
    {
      preHandler: requirePermission('roadmap.write'),
      schema: {
        params: idParamSchema,
        response: { 204: noContentSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { tenantId, userId } = requireAuthContext(request)
      await projectsController.deleteRoadmapTask(request.server.prisma, tenantId, request.params.id)
      await recordAuditLog(request.server.prisma, {
        tenantId,
        actorId: userId,
        action: 'roadmap.task.delete',
        targetType: 'RoadmapTask',
        targetId: request.params.id,
      })
      request.server.ssePublish(tenantId, [moduleKeyPrefix('projects')])
      reply.code(204)
    },
  )
}
