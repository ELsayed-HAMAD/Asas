/**
 * Projects / Sprint contract. A sprint is a dated container of issues (work items); the
 * burndown and completion KPIs are computed from its issues' `updatedAt`/`status` in SQL on
 * the API side and shipped back here.
 */
import { z } from 'zod'
import { idSchema, isoDateTimeSchema, boundedText } from '../primitives/ids.js'
import { collection } from '../primitives/pagination.js'

export const sprintSchema = z.object({
  id: idSchema,
  name: z.string(),
  projectId: idSchema.nullable(),
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
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type Sprint = z.infer<typeof sprintSchema>

export const sprintListResponseSchema = collection(sprintSchema)

export const sprintWriteSchema = z.object({
  name: boundedText(200),
  projectId: idSchema.optional().nullable(),
  endsAt: isoDateTimeSchema.optional().nullable(),
})

export type SprintWriteInput = z.infer<typeof sprintWriteSchema>

export const sprintUpdateSchema = sprintWriteSchema.partial()

export type SprintUpdateInput = z.infer<typeof sprintUpdateSchema>
