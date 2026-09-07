/**
 * Projects / Roadmap contract — the data behind the CSS-grid Gantt. A roadmap is a set of
 * ordered phases, each holding dated tasks; the Gantt renders one row per task and positions
 * each bar by `startDate`/`endDate`.
 *
 * The task schema is declared before the phase schema (a phase embeds its tasks) because Zod
 * reads the referenced schema eagerly at construction time.
 */
import { z } from 'zod'
import { idSchema, isoDateSchema, isoDateTimeSchema, boundedText } from '../primitives/ids.js'

export const roadmapTaskSchema = z.object({
  id: idSchema,
  phaseId: idSchema,
  title: z.string(),
  taskCode: z.string().nullable(),
  statusLabel: z.string().nullable(),
  description: z.string().nullable(),
  startDate: isoDateSchema.nullable(),
  endDate: isoDateSchema.nullable(),
  /** Whole percentage, 0–100, as stored. */
  progressPct: z.number().min(0).max(100),
  barColor: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type RoadmapTask = z.infer<typeof roadmapTaskSchema>

export const roadmapPhaseSchema = z.object({
  id: idSchema,
  title: z.string(),
  sortOrder: z.int().min(0),
  tasks: z.array(roadmapTaskSchema),
})

export type RoadmapPhase = z.infer<typeof roadmapPhaseSchema>

export const roadmapResponseSchema = z.object({
  phases: z.array(roadmapPhaseSchema),
})

export type RoadmapResponse = z.infer<typeof roadmapResponseSchema>

// ── Writes (the plan's "wire the unused write schemas to real routes", done in the new tree) ──

export const roadmapPhaseWriteSchema = z.object({
  title: boundedText(200),
  sortOrder: z.int().min(0).optional(),
})

export type RoadmapPhaseWriteInput = z.infer<typeof roadmapPhaseWriteSchema>

export const roadmapTaskWriteSchema = z.object({
  title: boundedText(200),
  phaseId: idSchema,
  taskCode: boundedText(24, 0).optional().nullable(),
  statusLabel: boundedText(40, 0).optional().nullable(),
  description: boundedText(2_000, 0).optional().nullable(),
  startDate: isoDateSchema.optional().nullable(),
  endDate: isoDateSchema.optional().nullable(),
  progressPct: z.number().min(0).max(100).optional(),
  barColor: z.string().nullable().optional(),
})

export type RoadmapTaskWriteInput = z.infer<typeof roadmapTaskWriteSchema>

export const roadmapTaskUpdateSchema = roadmapTaskWriteSchema.partial()

export type RoadmapTaskUpdateInput = z.infer<typeof roadmapTaskUpdateSchema>
