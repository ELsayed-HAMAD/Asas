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
  key: z.string().nullable(),
  title: z.string(),
  tag: z.string().nullable(),
  priority: issuePrioritySchema,
  status: issueStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type Issue = z.infer<typeof issueSchema>

export const issueListResponseSchema = collection(issueSchema)

export const issueWriteSchema = z.object({
  title: boundedText(200),
  sprintId: idSchema.optional().nullable(),
  key: boundedText(24, 0).optional().nullable(),
  tag: boundedText(40, 0).optional().nullable(),
  priority: issuePrioritySchema.optional(),
  status: issueStatusSchema.optional(),
})

export type IssueWriteInput = z.infer<typeof issueWriteSchema>

export const issueUpdateSchema = issueWriteSchema.partial()

export type IssueUpdateInput = z.infer<typeof issueUpdateSchema>
