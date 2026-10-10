/**
 * Projects / Issue (work item) contract. Issues are the unit of work a sprint burndowns; they
 * live under a sprint and carry a status the burndown aggregates on.
 */
import { z } from 'zod'
import { issuePrioritySchema, issueStatusSchema } from '../enums.generated.js'
import { idSchema, isoDateTimeSchema, boundedText } from '../primitives/ids.js'
import { collection } from '../primitives/pagination.js'

export const issueSchema = z.object({
  id: idSchema,
  sprintId: idSchema.nullable(),
  projectId: idSchema.nullable(),
  key: z.string().nullable(),
  title: z.string(),
  tag: z.string().nullable(),
  priority: issuePrioritySchema,
  status: issueStatusSchema,
  storyPoints: z.int().min(0).max(1000).nullable(),
  /** Null for open work or legacy completion events with no recorded completion date. */
  completedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type Issue = z.infer<typeof issueSchema>

export const issueListResponseSchema = collection(issueSchema)

export const issueWriteSchema = z.object({
  title: boundedText(200),
  sprintId: idSchema.optional().nullable(),
  projectId: idSchema.optional().nullable(),
  key: boundedText(24, 0).optional().nullable(),
  tag: boundedText(40, 0).optional().nullable(),
  priority: issuePrioritySchema.optional(),
  status: issueStatusSchema.optional(),
  storyPoints: z.int().min(0).max(1000).optional().nullable(),
})

export type IssueWriteInput = z.infer<typeof issueWriteSchema>

export const issueUpdateSchema = issueWriteSchema.partial()

export type IssueUpdateInput = z.infer<typeof issueUpdateSchema>
