/**
 * Projects / Sprint contract. A sprint is a dated container of issues (work items); the
 * burndown and completion KPIs are computed from its issues' completion timestamps in SQL on
 * the API side and shipped back here.
 */
import { z } from 'zod'
import { idSchema, isoDateTimeSchema, boundedText } from '../primitives/ids.js'
import { collection } from '../primitives/pagination.js'
import { sprintStatusSchema } from '../enums.generated.js'

export const sprintSchema = z.object({
  id: idSchema,
  name: z.string(),
  status: sprintStatusSchema,
  projectId: idSchema.nullable(),
  /** Null for legacy sprints whose actual start date is unknown. */
  startsAt: isoDateTimeSchema.nullable(),
  /** `null` when the sprint has no end date set yet. */
  endsAt: isoDateTimeSchema.nullable(),
  /**
   * Completion as a percentage, 0–100. The API derives this from the sprint's issues
   * (`DONE` / total) in SQL — it is *not* trusted from the client, even though the column
   * exists on the model for the (separate) UI that edits it by hand.
   */
  completionPct: z.number().min(0).max(100),
  issueCounts: z.object({
    total: z.int().min(0),
    done: z.int().min(0),
  }),
  velocity: z.object({
    /** Null means none of the completed issues has an estimate; it is not a zero-point sprint. */
    completedStoryPoints: z.int().min(0).nullable(),
    estimatedCompletedIssues: z.int().min(0),
    unestimatedCompletedIssues: z.int().min(0),
  }),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type Sprint = z.infer<typeof sprintSchema>

export const sprintListResponseSchema = collection(sprintSchema)

export const sprintWriteSchema = z.object({
  name: boundedText(200),
  projectId: idSchema.optional().nullable(),
  startsAt: isoDateTimeSchema.optional().nullable(),
  endsAt: isoDateTimeSchema.optional().nullable(),
  status: sprintStatusSchema.optional(),
})

export type SprintWriteInput = z.infer<typeof sprintWriteSchema>

export const sprintUpdateSchema = sprintWriteSchema.partial()

export type SprintUpdateInput = z.infer<typeof sprintUpdateSchema>
