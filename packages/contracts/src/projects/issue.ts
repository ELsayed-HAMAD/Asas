/**
 * Projects / Issue (work item) contract. Issues are the unit of work a sprint burndowns; they
 * live under a sprint and carry a status the burndown aggregates on.
 */
import { z } from 'zod'
import { issuePrioritySchema, issueStatusSchema } from '../enums.generated.js'
import { idSchema, isoDateTimeSchema, boundedText } from '../primitives/ids.js'
import { collection } from '../primitives/pagination.js'

export const issueChecklistItemSchema = z.object({
  id: idSchema,
  issueId: idSchema,
  text: boundedText(255),
  done: z.boolean(),
})

export type IssueChecklistItem = z.infer<typeof issueChecklistItemSchema>

export const issueChecklistItemWriteSchema = z.object({
  text: boundedText(255),
})

export type IssueChecklistItemWriteInput = z.infer<typeof issueChecklistItemWriteSchema>

export const issueChecklistItemUpdateSchema = z.object({
  text: boundedText(255).optional(),
  done: z.boolean().optional(),
})

export type IssueChecklistItemUpdateInput = z.infer<typeof issueChecklistItemUpdateSchema>

export const issueCommentSchema = z.object({
  id: idSchema,
  issueId: idSchema,
  author: z.string(),
  body: boundedText(5000),
  createdAt: isoDateTimeSchema,
})

export type IssueComment = z.infer<typeof issueCommentSchema>

export const issueCommentWriteSchema = z.object({
  body: boundedText(5000),
})

export type IssueCommentWriteInput = z.infer<typeof issueCommentWriteSchema>

export const issueAssigneeEmployeeSchema = z.object({
  id: idSchema,
  name: z.string(),
  title: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
})

export const issueAssigneeSchema = z.object({
  id: idSchema,
  issueId: idSchema,
  employeeId: idSchema,
  employee: issueAssigneeEmployeeSchema.nullable().optional(),
})

export type IssueAssignee = z.infer<typeof issueAssigneeSchema>

export const issueAssigneeWriteSchema = z.object({
  employeeId: idSchema,
})

export type IssueAssigneeWriteInput = z.infer<typeof issueAssigneeWriteSchema>

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
  checklist: z.array(issueChecklistItemSchema).default([]),
  comments: z.array(issueCommentSchema).default([]),
  assignees: z.array(issueAssigneeSchema).default([]),
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

