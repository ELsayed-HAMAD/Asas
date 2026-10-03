/**
 * Projects controller — the HTTP-boundary layer between the Fastify routes and the
 * `projects.service`. The routes (`projects.routes.ts`) own the declarative bits (guards,
 * schema, response codes, auth-context extraction); the controller owns the request→service
 * mapping and is what a route handler actually invokes. This mirrors the old tree's
 * `projects.schema.js` + controller split, re-pointed at real routes in the new stack.
 *
 * The controller never reads `tenantId` from a request parameter — the route resolves it from
 * the session and passes it in, so a caller cannot address another tenant's rows.
 */
import type { PrismaClient } from '@prisma/client'
import type {
  BurndownQuery,
  BurndownResponse,
  Issue,
  IssueUpdateInput,
  IssueWriteInput,
  PortfolioUtilizationResponse,
  Project,
  ProjectListQuery,
  ProjectUpdateInput,
  ProjectWriteInput,
  RoadmapResponse,
  RoadmapPhaseWriteInput,
  RoadmapTaskUpdateInput,
  RoadmapTaskWriteInput,
  Sprint,
  SprintUpdateInput,
  SprintWriteInput,
} from '@asas/contracts'
import * as service from './projects.service.js'

export type { ProjectListResult } from './projects.service.js'

// ── Projects ────────────────────────────────────────────────────────────────────

export function listProjects(
  prisma: PrismaClient,
  tenantId: string,
  query: ProjectListQuery,
): ReturnType<typeof service.listProjects> {
  return service.listProjects(prisma, tenantId, query)
}

export function getProject(prisma: PrismaClient, tenantId: string, id: string): Promise<Project> {
  return service.getProject(prisma, tenantId, id)
}

export function createProject(
  prisma: PrismaClient,
  tenantId: string,
  input: ProjectWriteInput,
): Promise<Project> {
  return service.createProject(prisma, tenantId, input)
}

export function updateProject(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: ProjectUpdateInput,
): Promise<Project> {
  return service.updateProject(prisma, tenantId, id, input)
}

export function deleteProject(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  return service.deleteProject(prisma, tenantId, id)
}

// ── Analytics (SQL aggregates, never client-side) ───────────────────────────────

export function getPortfolioUtilization(
  prisma: PrismaClient,
  tenantId: string,
): Promise<PortfolioUtilizationResponse> {
  return service.getPortfolioUtilization(prisma, tenantId)
}

export function getBurndown(
  prisma: PrismaClient,
  tenantId: string,
  sprintId: string,
  query: BurndownQuery,
): Promise<BurndownResponse> {
  return service.getBurndown(prisma, tenantId, sprintId, query)
}

// ── Sprints ─────────────────────────────────────────────────────────────────────

export function listSprints(prisma: PrismaClient, tenantId: string): Promise<Sprint[]> {
  return service.listSprints(prisma, tenantId)
}

export function getSprint(prisma: PrismaClient, tenantId: string, id: string): Promise<Sprint> {
  return service.getSprint(prisma, tenantId, id)
}

export function createSprint(prisma: PrismaClient, tenantId: string, input: SprintWriteInput): Promise<Sprint> {
  return service.createSprint(prisma, tenantId, input)
}

export function updateSprint(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: SprintUpdateInput,
): Promise<Sprint> {
  return service.updateSprint(prisma, tenantId, id, input)
}

export function deleteSprint(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  return service.deleteSprint(prisma, tenantId, id)
}

// ── Issues ──────────────────────────────────────────────────────────────────────

export function listIssues(prisma: PrismaClient, tenantId: string, sprintId: string): Promise<Issue[]> {
  return service.listIssues(prisma, tenantId, sprintId)
}

export function createIssue(prisma: PrismaClient, tenantId: string, input: IssueWriteInput): Promise<Issue> {
  return service.createIssue(prisma, tenantId, input)
}

export function updateIssue(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: IssueUpdateInput,
): Promise<Issue> {
  return service.updateIssue(prisma, tenantId, id, input)
}

export function deleteIssue(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  return service.deleteIssue(prisma, tenantId, id)
}

// ── Roadmap (Gantt) ─────────────────────────────────────────────────────────────

export function listRoadmap(prisma: PrismaClient, tenantId: string): Promise<RoadmapResponse> {
  return service.listRoadmap(prisma, tenantId)
}

export function createRoadmapPhase(
  prisma: PrismaClient,
  tenantId: string,
  input: RoadmapPhaseWriteInput,
): Promise<void> {
  return service.createRoadmapPhase(prisma, tenantId, input)
}

export function updateRoadmapPhase(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: RoadmapPhaseWriteInput,
): Promise<void> {
  return service.updateRoadmapPhase(prisma, tenantId, id, input)
}

export function deleteRoadmapPhase(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  return service.deleteRoadmapPhase(prisma, tenantId, id)
}

export function createRoadmapTask(
  prisma: PrismaClient,
  tenantId: string,
  input: RoadmapTaskWriteInput,
): Promise<void> {
  return service.createRoadmapTask(prisma, tenantId, input)
}

export function updateRoadmapTask(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: RoadmapTaskUpdateInput,
): Promise<void> {
  return service.updateRoadmapTask(prisma, tenantId, id, input)
}

export function deleteRoadmapTask(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  return service.deleteRoadmapTask(prisma, tenantId, id)
}
